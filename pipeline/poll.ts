/**
 * Poll @pangram's replies, parse verdicts, write to D1.
 *
 * Usage:
 *   bun run pipeline/poll.ts                     # incremental: pages until the stored cursor
 *   bun run pipeline/poll.ts --dry-run           # fetch + parse, print, write nothing
 *   bun run pipeline/poll.ts --max-pages=500 --ignore-cursor   # backfill mode
 *
 * Env (see .env.example): TWITTERAPI_IO_KEY, CLOUDFLARE_ACCOUNT_ID,
 * CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN.
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
import type { NormalizedTweet } from './lib/types';

const BOT_HANDLE = 'pangram';
const CURSOR_KEY = 'last_seen_tweet_id';
/** Safety valve, not a target: incremental runs stop at the cursor long before this. */
const DEFAULT_MAX_PAGES = 50;

interface PendingVerdict {
	tweet: NormalizedTweet;
	parsed: Extract<ReturnType<typeof parseVerdictReply>, { kind: 'verdict' }>;
}

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

const TWITTER_EPOCH_MS = 1288834974657;

/** Snowflake ids encode their creation time — the fallback when created-at fails to parse. */
function snowflakeToUnixSeconds(id: string): number {
	try {
		return Math.floor((Number(BigInt(id) >> 22n) + TWITTER_EPOCH_MS) / 1000);
	} catch {
		return 0;
	}
}

function fmtDate(unixSeconds: number): string {
	return unixSeconds > 0 ? new Date(unixSeconds * 1000).toISOString() : 'BAD-DATE';
}

async function main() {
	const dryRun = boolArg('dry-run');
	const ignoreCursor = boolArg('ignore-cursor');
	const maxPages = intArg('max-pages', DEFAULT_MAX_PAGES);

	const api = new TwitterApiClient(requireEnv('TWITTERAPI_IO_KEY'));
	const d1 = dryRun
		? null
		: new D1HttpClient(
				requireEnv('CLOUDFLARE_ACCOUNT_ID'),
				requireEnv('CLOUDFLARE_D1_DATABASE_ID'),
				requireEnv('CLOUDFLARE_API_TOKEN')
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
	const verdicts: PendingVerdict[] = [];
	const quarantined: NormalizedTweet[] = [];
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
			if (parsed.kind === 'verdict') verdicts.push({ tweet: t, parsed });
			else if (parsed.kind === 'unrecognized') quarantined.push(t);
			else skipped++;
		}

		if (!nextCursor) break;
		cursor = nextCursor;
	}

	// Coverage is contiguous when there was no previous cursor (first run /
	// backfill) or we paged all the way back to it.
	const coverageComplete = sinceId === null || reachedCursor;

	console.log(
		`Fetched ${pages} page(s): ${verdicts.length} verdict(s), ${quarantined.length} quarantined, ${skipped} non-verdict tweet(s) skipped.`
	);

	// ---- 2. Hydrate summons tweets (the "@pangram ai?" tweets we were tagged in). ----
	const summonsIds = [
		...new Set(verdicts.map((v) => v.tweet.inReplyToTweetId).filter((x): x is string => x !== null))
	];
	const summonsMap = new Map((await api.tweetsByIds(summonsIds)).map((s) => [s.id, s]));

	// ---- 3. Resolve + hydrate checked posts for author handles. ----
	// A quote-summons checks the QUOTED tweet (verified); a reply-summons checks
	// the tweet it replies to. When a summons somehow has both, prefer the quote.
	const checkedIdOf = (s: NormalizedTweet | undefined): string | null =>
		s ? (s.quotedTweetId ?? s.inReplyToTweetId) : null;

	const checkedIds = [
		...new Set(
			verdicts
				.map((v) => checkedIdOf(summonsMap.get(v.tweet.inReplyToTweetId ?? '')))
				.filter((x): x is string => x !== null)
		)
	];
	const checkedMap = new Map((await api.tweetsByIds(checkedIds)).map((c) => [c.id, c]));

	// ---- 4. Write. ----
	if (dryRun) {
		for (const { tweet, parsed } of verdicts.slice(0, 20)) {
			const summons = summonsMap.get(tweet.inReplyToTweetId ?? '');
			console.log(
				`[${parsed.label.toUpperCase().padEnd(5)}] ${fmtDate(tweet.createdAt)} @${tweet.inReplyToHandle ?? summons?.authorHandle ?? '?'} -> ` +
					`checked=${checkedIdOf(summons) ?? '?'} uuid=${parsed.historyUuid ?? '-'} | ${tweet.text.slice(0, 80)}`
			);
		}
		for (const t of quarantined) console.log(`[QUARANTINE] ${t.id}: ${t.text.slice(0, 120)}`);
		if (!coverageComplete) console.log(`(coverage gap: --max-pages=${maxPages} exhausted before cursor ${sinceId})`);
		console.log('(dry run — nothing written)');
		return;
	}
	if (!d1) return;

	const now = Math.floor(Date.now() / 1000);

	const rowsParams: unknown[][] = [];
	for (const { tweet, parsed } of verdicts) {
		const summons = summonsMap.get(tweet.inReplyToTweetId ?? '');
		const checkedId = checkedIdOf(summons);
		const checked = checkedId ? checkedMap.get(checkedId) : undefined;

		let verdictAt = tweet.createdAt;
		if (verdictAt === 0) {
			verdictAt = snowflakeToUnixSeconds(tweet.id);
			console.log(
				`::warning title=Unparseable tweet date::Tweet ${tweet.id} had no parseable created-at; derived ${fmtDate(verdictAt)} from its snowflake id. Check normalizeTweet()'s date mapping.`
			);
		}

		rowsParams.push([
			tweet.id,
			parsed.historyUuid,
			parsed.label,
			tweet.inReplyToUserId ?? summons?.authorId ?? null,
			tweet.inReplyToHandle ?? summons?.authorHandle ?? null,
			tweet.inReplyToTweetId,
			summons?.text ?? null,
			checkedId,
			checked?.authorHandle ?? summons?.quotedAuthorHandle ?? null,
			parsed.shortTextDisclaimer ? 1 : 0,
			parsed.truncated ? 1 : 0,
			parsed.fromImage ? 1 : 0,
			tweet.text,
			verdictAt,
			now
		]);
	}

	// 15 bound params per row; D1 caps queries at 100 params -> 6 rows per statement.
	const ROW_SQL = '(?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
	const CHUNK = 6;
	let inserted = 0;
	let insertedExact = true;
	for (let i = 0; i < rowsParams.length; i += CHUNK) {
		const chunk = rowsParams.slice(i, i + CHUNK);
		const { meta } = await d1.queryWithMeta(
			`INSERT INTO verdicts (
				verdict_tweet_id, history_uuid, verdict, pct_ai,
				tagger_id, tagger_handle, summons_id, summons_text,
				checked_post_id, checked_author_handle,
				short_text_disclaimer, truncated, from_image,
				raw_text, verdict_at, ingested_at
			) VALUES ${chunk.map(() => ROW_SQL).join(', ')}
			ON CONFLICT(verdict_tweet_id) DO NOTHING`,
			chunk.flat()
		);
		if (typeof meta?.changes === 'number') inserted += meta.changes;
		else {
			inserted += chunk.length;
			insertedExact = false;
		}
	}

	for (const t of quarantined) {
		await d1.query(
			`INSERT INTO quarantine (tweet_id, raw_text, reason, seen_at) VALUES (?, ?, ?, ?)
			 ON CONFLICT(tweet_id) DO NOTHING`,
			[t.id, t.text, 'history link present but no known verdict template', now]
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
		`Wrote ${inserted}${insertedExact ? '' : ' (attempted)'} new verdict(s) of ${verdicts.length} fetched, ${quarantined.length} quarantine row(s). Cursor -> ${coverageComplete ? (maxSeenId ?? '(unchanged)') : '(NOT advanced)'}`
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
