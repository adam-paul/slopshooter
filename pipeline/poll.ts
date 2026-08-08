/**
 * Poll @pangram's replies, parse verdicts, write to D1.
 *
 * Usage:
 *   bun run pipeline/poll.ts                     # incremental (cursor-based), max 5 pages
 *   bun run pipeline/poll.ts --dry-run           # fetch + parse, print, write nothing
 *   bun run pipeline/poll.ts --max-pages=500 --ignore-cursor   # backfill mode
 *
 * Env (see .env.example): TWITTERAPI_IO_KEY, CLOUDFLARE_ACCOUNT_ID,
 * CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN.
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

/** Compare two decimal snowflake ids. */
function cmpIds(a: string, b: string): number {
	const x = BigInt(a);
	const y = BigInt(b);
	return x < y ? -1 : x > y ? 1 : 0;
}

async function main() {
	const dryRun = arg('dry-run') === true;
	const ignoreCursor = arg('ignore-cursor') === true;
	const maxPages = Number(arg('max-pages') ?? 5);

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
				`[${parsed.label.toUpperCase().padEnd(5)}] @${tweet.inReplyToHandle ?? summons?.authorHandle ?? '?'} -> ` +
					`checked=${checkedIdOf(summons) ?? '?'} uuid=${parsed.historyUuid ?? '-'} | ${tweet.text.slice(0, 80)}`
			);
		}
		for (const t of quarantined) console.log(`[QUARANTINE] ${t.id}: ${t.text.slice(0, 120)}`);
		console.log('(dry run — nothing written)');
		return;
	}
	if (!d1) return;

	const now = Math.floor(Date.now() / 1000);
	let inserted = 0;
	for (const { tweet, parsed } of verdicts) {
		const summons = summonsMap.get(tweet.inReplyToTweetId ?? '');
		const checkedId = checkedIdOf(summons);
		const checked = checkedId ? checkedMap.get(checkedId) : undefined;
		const res = await d1.query(
			`INSERT INTO verdicts (
				verdict_tweet_id, history_uuid, verdict, pct_ai,
				tagger_id, tagger_handle, summons_id, summons_text,
				checked_post_id, checked_author_handle,
				short_text_disclaimer, truncated, from_image,
				raw_text, verdict_at, ingested_at
			) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(verdict_tweet_id) DO NOTHING`,
			[
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
				tweet.createdAt,
				now
			]
		);
		void res;
		inserted++;
	}

	for (const t of quarantined) {
		await d1.query(
			`INSERT INTO quarantine (tweet_id, raw_text, reason, seen_at) VALUES (?, ?, ?, ?)
			 ON CONFLICT(tweet_id) DO NOTHING`,
			[t.id, t.text, 'history link present but no known verdict template', now]
		);
	}

	if (maxSeenId !== null) {
		await d1.query(
			`INSERT INTO ingest_state (key, value) VALUES (?, ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
			[CURSOR_KEY, maxSeenId]
		);
	}

	console.log(`Wrote ${inserted} verdict(s), ${quarantined.length} quarantine row(s). Cursor -> ${maxSeenId ?? '(unchanged)'}`);

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
