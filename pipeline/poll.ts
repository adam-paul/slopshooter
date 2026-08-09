/**
 * Poll @pangram's replies, parse verdicts, write to D1.
 *
 * Usage:
 *   bun run pipeline/poll.ts                     # incremental: pages until the stored cursor
 *   bun run pipeline/poll.ts --dry-run           # fetch + parse, print, write nothing
 *   bun run pipeline/poll.ts --max-pages=500 --ignore-cursor   # backfill mode
 *
 * Env (see .env.example): TWITTERAPI_IO_KEY, CLOUDFLARE_ACCOUNT_ID,
 * CLOUDFLARE_D1_DATABASE_ID, D1_API_TOKEN.
 *
 * Cursor safety: the cursor only advances when this run verifiably connected to
 * the previous one (reached the stored cursor while paging). If --max-pages is
 * exhausted first, rows are still written (inserts dedupe) but the cursor stays
 * put and the run emits a coverage-gap annotation.
 *
 * Backfill note: the timeline endpoint may not reach past X's ~3,200-status
 * window; the bot has ~9.4k lifetime statuses. For the full corpus, seed from
 * the provider's advanced search (from:pangram) or the Wayback CDX id list —
 * see README "Backfill".
 */
import { D1HttpClient } from './lib/d1';
import { parseVerdictReply } from './lib/parser';
import { TwitterApiClient } from './lib/twitterapi';
import type { NormalizedTweet, VerdictLabel } from './lib/types';

const BOT_HANDLE = 'pangram';
const CURSOR_KEY = 'last_seen_tweet_id';
/** Safety valve, not a target: incremental runs stop at the cursor long before this. */
const DEFAULT_MAX_PAGES = 50;

interface PendingVerdict {
	tweet: NormalizedTweet;
	parsed: Extract<ReturnType<typeof parseVerdictReply>, { kind: 'verdict' }>;
}

interface Quarantined {
	tweet: NormalizedTweet;
	reason: string;
}

/** One fully resolved verdict — the single shape both dry-run and D1 consume. */
interface VerdictRow {
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

function requireEnv(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`Missing required env var ${name}`);
	return v;
}

function arg(name: string): string | boolean | undefined {
	const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
	if (hit === undefined) return undefined;
	return hit.includes('=') ? hit.split('=').slice(1).join('=') : true;
}

/** Bare `--flag`, `--flag=true/1`, `--flag=false/0`. Anything else aborts the run. */
function boolArg(name: string): boolean {
	const v = arg(name);
	if (v === undefined) return false;
	if (v === true || v === 'true' || v === '1') return true;
	if (v === 'false' || v === '0') return false;
	throw new Error(`Invalid value for --${name}: "${String(v)}" (expected true/false)`);
}

function intArg(name: string, fallback: number): number {
	const v = arg(name);
	if (v === undefined) return fallback;
	const n = Number(v);
	if (!Number.isInteger(n) || n <= 0) {
		throw new Error(`Invalid value for --${name}: "${String(v)}" (expected a positive integer)`);
	}
	return n;
}

/** Compare two decimal snowflake ids. */
function cmpIds(a: string, b: string): number {
	const x = BigInt(a);
	const y = BigInt(b);
	return x < y ? -1 : x > y ? 1 : 0;
}

function uniqueIds(xs: Array<string | null | undefined>): string[] {
	return [...new Set(xs.filter((x): x is string => typeof x === 'string' && x.length > 0))];
}

function fmtDate(unixSeconds: number): string {
	return unixSeconds > 0 ? new Date(unixSeconds * 1000).toISOString() : 'BAD-DATE';
}

/**
 * A quote-summons checks the QUOTED tweet (verified); a reply-summons checks
 * the tweet it replies to. When a summons somehow has both, prefer the quote.
 */
function checkedIdOf(summons: NormalizedTweet | undefined): string | null {
	return summons ? (summons.quotedTweetId ?? summons.inReplyToTweetId) : null;
}

/** The checked post's author, as far as the summons payload alone can tell. */
function checkedAuthorFromSummons(summons: NormalizedTweet | undefined): string | null {
	if (!summons) return null;
	return summons.quotedTweetId ? summons.quotedAuthorHandle : summons.inReplyToHandle;
}

function resolveRow(
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

async function main() {
	const dryRun = boolArg('dry-run');
	const ignoreCursor = boolArg('ignore-cursor');
	const maxPages = intArg('max-pages', DEFAULT_MAX_PAGES);

	const api = new TwitterApiClient(requireEnv('TWITTERAPI_IO_KEY'));
	// d1 is null exactly when --dry-run; `if (!d1)` below IS the dry-run branch.
	const d1 = dryRun
		? null
		: new D1HttpClient(
				requireEnv('CLOUDFLARE_ACCOUNT_ID'),
				requireEnv('CLOUDFLARE_D1_DATABASE_ID'),
				// Not CLOUDFLARE_API_TOKEN — wrangler would hijack that name from
				// bun's auto-loaded .env and shadow the developer's OAuth login.
				requireEnv('D1_API_TOKEN')
			);

	let sinceId: string | null = null;
	if (d1 && !ignoreCursor) {
		const rows = await d1.query<{ value: string }>(
			'SELECT value FROM ingest_state WHERE key = ?',
			[CURSOR_KEY]
		);
		sinceId = rows[0]?.value ?? null;
	}

	// ---- 1. Page the bot's timeline (replies included), newest first. ----
	const pending: PendingVerdict[] = [];
	const quarantined: Quarantined[] = [];
	let skipped = 0;
	let pages = 0;
	let cursor: string | undefined;
	let reachedCursor = false;
	let maxSeenId: string | null = null;

	while (pages < maxPages && !reachedCursor) {
		const { tweets, nextCursor } = await api.userLastTweets(BOT_HANDLE, cursor);
		if (tweets.length === 0) break;
		pages++;

		for (const t of tweets) {
			if (!t.id) continue;
			// Timeline can include retweets; verdicts only ever come from the bot itself.
			if (t.authorHandle && t.authorHandle.toLowerCase() !== BOT_HANDLE) continue;
			if (sinceId && cmpIds(t.id, sinceId) <= 0) {
				reachedCursor = true;
				continue;
			}
			if (maxSeenId === null || cmpIds(t.id, maxSeenId) > 0) maxSeenId = t.id;

			const parsed = parseVerdictReply(t.text, t.expandedUrls);
			if (parsed.kind === 'verdict') pending.push({ tweet: t, parsed });
			else if (parsed.kind === 'unrecognized') quarantined.push({ tweet: t, reason: parsed.reason });
			else skipped++;
		}

		if (!nextCursor) break;
		cursor = nextCursor;
	}

	// Coverage is contiguous when there was no previous cursor (first run /
	// backfill) or we paged all the way back to it.
	const coverageComplete = sinceId === null || reachedCursor;

	console.log(
		`Fetched ${pages} page(s): ${pending.length} verdict(s), ${quarantined.length} quarantined, ${skipped} non-verdict tweet(s) skipped.`
	);

	// ---- 2. Hydrate summons tweets (the "@pangram ai?" tweets we were tagged in). ----
	const summonsMap = new Map(
		(await api.tweetsByIds(uniqueIds(pending.map((v) => v.tweet.inReplyToTweetId)))).map((s) => [
			s.id,
			s
		])
	);

	// ---- 3. Hydrate checked posts — only where the summons payload couldn't
	// name the author itself (reply-summons carry it in inReplyToHandle,
	// quote-summons in quotedAuthorHandle). ----
	const needsCheckedHydration = uniqueIds(
		pending
			.map((v) => summonsMap.get(v.tweet.inReplyToTweetId ?? ''))
			.filter((s) => s && checkedIdOf(s) !== null && checkedAuthorFromSummons(s) === null)
			.map((s) => checkedIdOf(s))
	);
	const checkedMap = new Map(
		(await api.tweetsByIds(needsCheckedHydration)).map((c) => [c.id, c])
	);

	// ---- 4. Resolve once; dry-run printing and D1 are two sinks for the same rows. ----
	const rows = pending.map((p) => resolveRow(p, summonsMap, checkedMap));
	const now = Math.floor(Date.now() / 1000);

	for (const r of rows) {
		if (r.dateDerived) {
			console.log(
				`::warning title=Unparseable tweet date::Tweet ${r.verdictTweetId} had no parseable created-at; using ${fmtDate(r.verdictAt)} derived from its snowflake id. Check normalizeTweet()'s date mapping.`
			);
		}
	}

	if (!d1) {
		for (const r of rows.slice(0, 20)) {
			console.log(
				`[${r.verdict.toUpperCase().padEnd(5)}] ${fmtDate(r.verdictAt)} @${r.taggerHandle ?? '?'} -> ` +
					`checked=${r.checkedPostId ?? '?'} by @${r.checkedAuthorHandle ?? '?'} uuid=${r.historyUuid ?? '-'} | ${r.rawText.slice(0, 80)}`
			);
		}
		for (const q of quarantined) console.log(`[QUARANTINE] ${q.tweet.id}: ${q.tweet.text.slice(0, 120)}`);
		if (!coverageComplete) console.log(`(coverage gap: --max-pages=${maxPages} exhausted before cursor ${sinceId})`);
		console.log('(dry run — nothing written)');
		return;
	}

	// ---- 5. Write, chunked under D1's bound-parameter cap. ----
	const CHUNK = Math.floor(D1_MAX_PARAMS / VERDICT_COLUMNS.length);
	const colNames = VERDICT_COLUMNS.map(([name]) => name).join(', ');
	const rowSql = `(${VERDICT_COLUMNS.map(() => '?').join(', ')})`;
	let inserted = 0;
	for (let i = 0; i < rows.length; i += CHUNK) {
		const chunk = rows.slice(i, i + CHUNK);
		const { meta } = await d1.queryWithMeta(
			`INSERT INTO verdicts (${colNames}) VALUES ${chunk.map(() => rowSql).join(', ')}
			 ON CONFLICT(verdict_tweet_id) DO NOTHING`,
			chunk.flatMap((r) => VERDICT_COLUMNS.map(([, extract]) => extract(r, now)))
		);
		inserted += meta?.changes ?? chunk.length;
	}

	const QUARANTINE_CHUNK = Math.floor(D1_MAX_PARAMS / 4);
	for (let i = 0; i < quarantined.length; i += QUARANTINE_CHUNK) {
		const chunk = quarantined.slice(i, i + QUARANTINE_CHUNK);
		await d1.query(
			`INSERT INTO quarantine (tweet_id, raw_text, reason, seen_at) VALUES ${chunk.map(() => '(?, ?, ?, ?)').join(', ')}
			 ON CONFLICT(tweet_id) DO NOTHING`,
			chunk.flatMap((q) => [q.tweet.id, q.tweet.text, q.reason, now])
		);
	}

	if (maxSeenId !== null && coverageComplete) {
		await d1.query(
			`INSERT INTO ingest_state (key, value) VALUES (?, ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
			[CURSOR_KEY, maxSeenId]
		);
	}

	console.log(
		`Wrote ${inserted} new verdict(s) of ${rows.length} fetched, ${quarantined.length} quarantine row(s). Cursor -> ${coverageComplete ? (maxSeenId ?? '(unchanged)') : '(NOT advanced)'}`
	);

	if (!coverageComplete) {
		console.log(
			`::error title=Poll coverage gap::Exhausted --max-pages=${maxPages} before reaching stored cursor ${sinceId}. This run's rows are saved (inserts dedupe), but a gap remains and the cursor was NOT advanced. Trigger the workflow manually with args "--ignore-cursor --max-pages=500" to close it.`
		);
	}

	if (quarantined.length > 0) {
		// GitHub Actions annotation — the format-drift alarm.
		console.log(
			`::warning title=Pangram reply format drift::${quarantined.length} bot repl(ies) had a history link but matched no template. Check the quarantine table and update pipeline/lib/parser.ts.`
		);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
