/**
 * Poll @pangram's replies, parse verdicts, write to D1.
 *
 * Usage:
 *   bun run pipeline/poll.ts                     # incremental: pages until the stored cursor
 *   bun run pipeline/poll.ts --dry-run           # fetch + parse, print, write nothing
 *   bun run pipeline/poll.ts --max-pages=500 --ignore-cursor   # recent-window re-walk
 *
 * Env (see .env.example): TWITTERAPI_IO_KEY, CLOUDFLARE_ACCOUNT_ID,
 * CLOUDFLARE_D1_DATABASE_ID, D1_API_TOKEN.
 *
 * Cursor safety: the cursor only advances when this run verifiably connected to
 * the previous one (reached the stored cursor while paging). If --max-pages is
 * exhausted first, rows are still written (inserts dedupe) but the cursor stays
 * put and the run emits a coverage-gap annotation.
 *
 * The timeline surface only reaches X's most recent ~3,200 statuses; for the
 * deep history use pipeline/backfill.ts (search windows + Wayback sweep).
 */
import { boolArg, intArg, requireEnv } from './lib/cli';
import { D1HttpClient } from './lib/d1';
import {
	BOT_HANDLE,
	hydrateAndResolve,
	logDriftWarning,
	printRows,
	writeQuarantine,
	writeVerdicts,
	type PendingVerdict,
	type Quarantined
} from './lib/ingest';
import { parseVerdictReply } from './lib/parser';
import { TwitterApiClient } from './lib/twitterapi';

const CURSOR_KEY = 'last_seen_tweet_id';
/** Safety valve, not a target: incremental runs stop at the cursor long before this. */
const DEFAULT_MAX_PAGES = 50;

/** Compare two decimal snowflake ids. */
function cmpIds(a: string, b: string): number {
	const x = BigInt(a);
	const y = BigInt(b);
	return x < y ? -1 : x > y ? 1 : 0;
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
	// re-walk) or we paged all the way back to it.
	const coverageComplete = sinceId === null || reachedCursor;

	console.log(
		`Fetched ${pages} page(s): ${pending.length} verdict(s), ${quarantined.length} quarantined, ${skipped} non-verdict tweet(s) skipped.`
	);

	// ---- 2. Hydrate, resolve; dry-run printing and D1 are two sinks for the same rows. ----
	const rows = await hydrateAndResolve(api, pending);
	const now = Math.floor(Date.now() / 1000);

	if (!d1) {
		printRows(rows);
		for (const q of quarantined) console.log(`[QUARANTINE] ${q.tweet.id}: ${q.tweet.text.slice(0, 120)}`);
		if (!coverageComplete) console.log(`(coverage gap: --max-pages=${maxPages} exhausted before cursor ${sinceId})`);
		console.log('(dry run — nothing written)');
		return;
	}

	// ---- 3. Write, then advance the cursor only on contiguous coverage. ----
	const upserted = await writeVerdicts(d1, rows, now);
	await writeQuarantine(d1, quarantined, now);

	if (maxSeenId !== null && coverageComplete) {
		await d1.query(
			`INSERT INTO ingest_state (key, value) VALUES (?, ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
			[CURSOR_KEY, maxSeenId]
		);
	}

	console.log(
		`Upserted ${upserted} verdict(s) of ${rows.length} fetched, ${quarantined.length} quarantine row(s). Cursor -> ${coverageComplete ? (maxSeenId ?? '(unchanged)') : '(NOT advanced)'}`
	);

	if (!coverageComplete) {
		console.log(
			`::error title=Poll coverage gap::Exhausted --max-pages=${maxPages} before reaching stored cursor ${sinceId}. This run's rows are saved (inserts dedupe), but a gap remains and the cursor was NOT advanced. Trigger the workflow manually with args "--ignore-cursor --max-pages=500" to close it.`
		);
	}

	logDriftWarning(quarantined.length);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
