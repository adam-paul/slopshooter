/**
 * Shared ingestion core: classify bot replies, hydrate context, resolve rows,
 * upsert into D1. poll.ts (cron) and backfill.ts (deep history) are two fetch
 * strategies feeding this one path.
 */
import type { D1HttpClient } from './d1';
import { parseVerdictReply } from './parser';
import type { TwitterApiClient } from './twitterapi';
import type { NormalizedTweet, VerdictLabel } from './types';

export const BOT_HANDLE = 'pangram';

export interface PendingVerdict {
	tweet: NormalizedTweet;
	parsed: Extract<ReturnType<typeof parseVerdictReply>, { kind: 'verdict' }>;
}

export interface Quarantined {
	tweet: NormalizedTweet;
	reason: string;
}

/** One fully resolved verdict — the single shape both dry-run and D1 consume. */
export interface VerdictRow {
	verdictTweetId: string;
	historyUuid: string | null;
	verdict: VerdictLabel;
	taggerId: string | null;
	taggerHandle: string | null;
	summonsId: string | null;
	summonsText: string | null;
	checkedPostId: string | null;
	checkedAuthorHandle: string | null;
	shortTextDisclaimer: boolean;
	truncated: boolean;
	fromImage: boolean;
	fromLink: boolean;
	rawText: string;
	verdictAt: number;
	/** Not a column — drives the CI warning for snowflake-derived timestamps. */
	dateDerived: boolean;
}

/**
 * Single source of truth for the INSERT shape: the column list, placeholder
 * string, bound params, and chunk size are all derived from this spec, so
 * adding a column is a one-line change. (pct_ai is intentionally absent —
 * it is nullable and belongs to the v2 enricher.)
 */
const VERDICT_COLUMNS: Array<[string, (r: VerdictRow, now: number) => unknown]> = [
	['verdict_tweet_id', (r) => r.verdictTweetId],
	['history_uuid', (r) => r.historyUuid],
	['verdict', (r) => r.verdict],
	['tagger_id', (r) => r.taggerId],
	['tagger_handle', (r) => r.taggerHandle],
	['summons_id', (r) => r.summonsId],
	['summons_text', (r) => r.summonsText],
	['checked_post_id', (r) => r.checkedPostId],
	['checked_author_handle', (r) => r.checkedAuthorHandle],
	['short_text_disclaimer', (r) => (r.shortTextDisclaimer ? 1 : 0)],
	['truncated', (r) => (r.truncated ? 1 : 0)],
	['from_image', (r) => (r.fromImage ? 1 : 0)],
	['from_link', (r) => (r.fromLink ? 1 : 0)],
	['raw_text', (r) => r.rawText],
	['verdict_at', (r) => r.verdictAt],
	['ingested_at', (_r, now) => now]
];

/** D1 caps bound parameters per statement. */
const D1_MAX_PARAMS = 100;

export function uniqueIds(xs: Array<string | null | undefined>): string[] {
	return [...new Set(xs.filter((x): x is string => typeof x === 'string' && x.length > 0))];
}

export function fmtDate(unixSeconds: number): string {
	return unixSeconds > 0 ? new Date(unixSeconds * 1000).toISOString() : 'BAD-DATE';
}

/**
 * A quote-summons checks the QUOTED tweet (verified); a reply-summons checks
 * the tweet it replies to. When a summons somehow has both, prefer the quote.
 */
export function checkedIdOf(summons: NormalizedTweet | undefined): string | null {
	return summons ? (summons.quotedTweetId ?? summons.inReplyToTweetId) : null;
}

/** The checked post's author, as far as the summons payload alone can tell. */
export function checkedAuthorFromSummons(summons: NormalizedTweet | undefined): string | null {
	if (!summons) return null;
	return summons.quotedTweetId ? summons.quotedAuthorHandle : summons.inReplyToHandle;
}

export function resolveRow(
	{ tweet, parsed }: PendingVerdict,
	summonsMap: Map<string, NormalizedTweet>,
	checkedMap: Map<string, NormalizedTweet>
): VerdictRow {
	const summons = tweet.inReplyToTweetId ? summonsMap.get(tweet.inReplyToTweetId) : undefined;
	const checkedPostId = checkedIdOf(summons);
	const checked = checkedPostId ? checkedMap.get(checkedPostId) : undefined;
	return {
		verdictTweetId: tweet.id,
		historyUuid: parsed.historyUuid,
		verdict: parsed.label,
		taggerId: tweet.inReplyToUserId ?? summons?.authorId ?? null,
		taggerHandle: tweet.inReplyToHandle ?? summons?.authorHandle ?? null,
		summonsId: tweet.inReplyToTweetId,
		summonsText: summons?.text ?? null,
		checkedPostId,
		checkedAuthorHandle: checkedAuthorFromSummons(summons) ?? checked?.authorHandle ?? null,
		shortTextDisclaimer: parsed.shortTextDisclaimer,
		truncated: parsed.truncated,
		fromImage: parsed.fromImage,
		fromLink: parsed.fromLink,
		rawText: tweet.text,
		verdictAt: tweet.createdAt,
		dateDerived: tweet.createdAtDerived
	};
}

/**
 * Steps 2-4 of an ingest: hydrate summons tweets, hydrate checked posts where
 * the summons alone can't name the author, resolve each pending verdict into a
 * row. Emits the snowflake-derived-date warning as it goes.
 */
export async function hydrateAndResolve(
	api: TwitterApiClient,
	pending: PendingVerdict[]
): Promise<VerdictRow[]> {
	const summonsMap = new Map(
		(await api.tweetsByIds(uniqueIds(pending.map((v) => v.tweet.inReplyToTweetId)))).map((s) => [
			s.id,
			s
		])
	);

	const needsCheckedHydration = uniqueIds(
		pending
			.map((v) => summonsMap.get(v.tweet.inReplyToTweetId ?? ''))
			.filter((s) => s && checkedIdOf(s) !== null && checkedAuthorFromSummons(s) === null)
			.map((s) => checkedIdOf(s))
	);
	const checkedMap = new Map((await api.tweetsByIds(needsCheckedHydration)).map((c) => [c.id, c]));

	const rows = pending.map((p) => resolveRow(p, summonsMap, checkedMap));
	for (const r of rows) {
		if (r.dateDerived) {
			console.log(
				`::warning title=Unparseable tweet date::Tweet ${r.verdictTweetId} had no parseable created-at; using ${fmtDate(r.verdictAt)} derived from its snowflake id. Check normalizeTweet()'s date mapping.`
			);
		}
	}
	return rows;
}

/**
 * Upsert rows, chunked under D1's bound-parameter cap. Re-fetched rows repair
 * any missing enrichment (COALESCE), so the count covers inserts and repairs.
 */
export async function writeVerdicts(
	d1: D1HttpClient,
	rows: VerdictRow[],
	now: number
): Promise<number> {
	const CHUNK = Math.floor(D1_MAX_PARAMS / VERDICT_COLUMNS.length);
	const colNames = VERDICT_COLUMNS.map(([name]) => name).join(', ');
	const rowSql = `(${VERDICT_COLUMNS.map(() => '?').join(', ')})`;
	let upserted = 0;
	for (let i = 0; i < rows.length; i += CHUNK) {
		const chunk = rows.slice(i, i + CHUNK);
		const { meta } = await d1.queryWithMeta(
			`INSERT INTO verdicts (${colNames}) VALUES ${chunk.map(() => rowSql).join(', ')}
			 ON CONFLICT(verdict_tweet_id) DO UPDATE SET
				summons_id = COALESCE(excluded.summons_id, summons_id),
				summons_text = COALESCE(excluded.summons_text, summons_text),
				checked_post_id = COALESCE(excluded.checked_post_id, checked_post_id),
				checked_author_handle = COALESCE(excluded.checked_author_handle, checked_author_handle),
				tagger_id = COALESCE(excluded.tagger_id, tagger_id),
				tagger_handle = COALESCE(excluded.tagger_handle, tagger_handle)`,
			chunk.flatMap((r) => VERDICT_COLUMNS.map(([, extract]) => extract(r, now)))
		);
		upserted += meta?.changes ?? chunk.length;
	}
	return upserted;
}

export async function writeQuarantine(
	d1: D1HttpClient,
	quarantined: Quarantined[],
	now: number
): Promise<void> {
	const CHUNK = Math.floor(D1_MAX_PARAMS / 4);
	for (let i = 0; i < quarantined.length; i += CHUNK) {
		const chunk = quarantined.slice(i, i + CHUNK);
		await d1.query(
			`INSERT INTO quarantine (tweet_id, raw_text, reason, seen_at) VALUES ${chunk.map(() => '(?, ?, ?, ?)').join(', ')}
			 ON CONFLICT(tweet_id) DO NOTHING`,
			chunk.flatMap((q) => [q.tweet.id, q.tweet.text, q.reason, now])
		);
	}
}

/** Dry-run display for resolved rows. */
export function printRows(rows: VerdictRow[], limit = 20): void {
	for (const r of rows.slice(0, limit)) {
		console.log(
			`[${r.verdict.toUpperCase().padEnd(5)}] ${fmtDate(r.verdictAt)} @${r.taggerHandle ?? '?'} -> ` +
				`checked=${r.checkedPostId ?? '?'} by @${r.checkedAuthorHandle ?? '?'} uuid=${r.historyUuid ?? '-'} | ${r.rawText.slice(0, 80)}`
		);
	}
}

/** The format-drift alarm, shared verbatim by every ingest surface. */
export function logDriftWarning(count: number): void {
	if (count > 0) {
		console.log(
			`::warning title=Pangram reply format drift::${count} bot repl(ies) had a history link but matched no template. Check the quarantine table and update pipeline/lib/parser.ts.`
		);
	}
}
