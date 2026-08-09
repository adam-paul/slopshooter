/**
 * Deep backfill: recover verdict history beyond the timeline's ~3,200-status
 * window via the search index, date-window by date-window, plus a Wayback CDX
 * sweep for ids the search index forgot (it undercounts old low-engagement
 * replies — measured 94-98% on recent days, worse deeper).
 *
 * Usage:
 *   bun run pipeline/backfill.ts                 # launch day -> timeline-covered zone
 *   bun run pipeline/backfill.ts --dry-run       # fetch + parse + report, write nothing
 *   bun run pipeline/backfill.ts --since=2026-02-01 --until=2026-03-01 --no-wayback
 *
 * Never touches ingest_state — the cron's cursor belongs to poll.ts alone.
 * Writes are the shared upsert, so overlap with existing rows repairs
 * enrichment instead of duplicating.
 */
import { boolArg, dateArg, intArg, requireEnv } from './lib/cli';
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
import type { NormalizedTweet } from './lib/types';

/** Just before the bot's first verdict (2025-12-29). */
const DEFAULT_SINCE = '2025-12-25';
/** The timeline walk already covers ~early July onward. */
const DEFAULT_UNTIL = '2026-07-15';
const DAY_MS = 86_400_000;

function isoDay(d: Date): string {
	return d.toISOString().slice(0, 10);
}

/** Free Wayback CDX index: archived bot-status URLs -> tweet ids. Best effort. */
async function fetchWaybackIds(): Promise<string[]> {
	const ids = new Set<string>();
	for (const host of ['twitter.com', 'x.com']) {
		// Pre-rename captures live under the old handle's path.
		for (const handle of ['pangram', 'pangramlabs']) {
			// matchType=prefix, not a trailing wildcard — the wildcard form silently
			// returns nothing for path prefixes (verified live 2026-08-09).
			const url = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(`${host}/${handle}/status`)}&matchType=prefix&output=text&fl=original&collapse=urlkey&limit=10000`;
			try {
				const res = await fetch(url);
				if (!res.ok) {
					console.log(`  CDX ${host}/${handle}: HTTP ${res.status}`);
					await res.body?.cancel();
					continue;
				}
				const text = await res.text();
				let n = 0;
				for (const m of text.matchAll(/\/status(?:es)?\/(\d{10,20})/g)) {
					ids.add(m[1]);
					n++;
				}
				console.log(`  CDX ${host}/${handle}: ${n} archived status urls`);
			} catch (err) {
				// CDX is best-effort; a dead endpoint must not kill the backfill.
				console.log(`  CDX ${host}/${handle}: failed (${err instanceof Error ? err.message : err})`);
			}
		}
	}
	return [...ids];
}

interface Tally {
	fetched: number;
	verdicts: number;
	quarantined: number;
	skipped: number;
	upserted: number;
}

async function main() {
	const dryRun = boolArg('dry-run');
	const wayback = !boolArg('no-wayback');
	const waybackOnly = boolArg('wayback-only');
	const windowDays = intArg('window-days', 7);
	const maxPagesPerWindow = intArg('max-pages-per-window', 60);
	const since = dateArg('since', DEFAULT_SINCE);
	const until = dateArg('until', DEFAULT_UNTIL);
	if (since >= until) throw new Error('--since must be before --until');

	const api = new TwitterApiClient(requireEnv('TWITTERAPI_IO_KEY'));
	const d1 = dryRun
		? null
		: new D1HttpClient(
				requireEnv('CLOUDFLARE_ACCOUNT_ID'),
				requireEnv('CLOUDFLARE_D1_DATABASE_ID'),
				requireEnv('D1_API_TOKEN')
			);

	// Read-only D1 for dry-run: lets the Wayback phase filter against the real
	// tables (else a dry run would hydrate — and pay for — thousands of archived
	// ids the wet run would skip). Optional: dry-run still works without creds.
	const d1Read =
		d1 ??
		(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_D1_DATABASE_ID && process.env.D1_API_TOKEN
			? new D1HttpClient(
					process.env.CLOUDFLARE_ACCOUNT_ID,
					process.env.CLOUDFLARE_D1_DATABASE_ID,
					process.env.D1_API_TOKEN
				)
			: null);

	const now = Math.floor(Date.now() / 1000);
	const seen = new Set<string>();
	const total: Tally = { fetched: 0, verdicts: 0, quarantined: 0, skipped: 0, upserted: 0 };

	const classify = (
		tweets: NormalizedTweet[],
		pending: PendingVerdict[],
		quarantined: Quarantined[],
		tally: Tally
	) => {
		for (const t of tweets) {
			if (!t.id || seen.has(t.id)) continue;
			seen.add(t.id);
			if (t.authorHandle && t.authorHandle.toLowerCase() !== BOT_HANDLE) continue;
			tally.fetched++;
			const parsed = parseVerdictReply(t.text, t.expandedUrls);
			if (parsed.kind === 'verdict') {
				pending.push({ tweet: t, parsed });
				tally.verdicts++;
			} else if (parsed.kind === 'unrecognized') {
				quarantined.push({ tweet: t, reason: parsed.reason });
				tally.quarantined++;
			} else tally.skipped++;
		}
	};

	const flush = async (pending: PendingVerdict[], quarantined: Quarantined[], tally: Tally) => {
		const rows = await hydrateAndResolve(api, pending);
		if (d1) {
			tally.upserted += await writeVerdicts(d1, rows, now);
			await writeQuarantine(d1, quarantined, now);
		} else {
			printRows(rows, 5);
		}
		total.fetched += tally.fetched;
		total.verdicts += tally.verdicts;
		total.quarantined += tally.quarantined;
		total.skipped += tally.skipped;
		total.upserted += tally.upserted;
	};

	// ---- Phase 1: search index, oldest window first, 1-day overlap. ----
	for (
		let start = since.getTime();
		!waybackOnly && start < until.getTime();
		start += windowDays * DAY_MS
	) {
		const wSince = isoDay(new Date(start));
		// Overlap by a day: the provider's until: boundary bleeds; dedupe absorbs it.
		const wUntil = isoDay(new Date(Math.min(start + (windowDays + 1) * DAY_MS, until.getTime() + DAY_MS)));
		const query = `from:${BOT_HANDLE} since:${wSince} until:${wUntil}`;

		const pending: PendingVerdict[] = [];
		const quarantined: Quarantined[] = [];
		const tally: Tally = { fetched: 0, verdicts: 0, quarantined: 0, skipped: 0, upserted: 0 };

		let cursor: string | undefined;
		let pages = 0;
		let truncated = false;
		while (true) {
			const { tweets, nextCursor } = await api.searchAdvanced(query, cursor);
			if (tweets.length === 0) break;
			pages++;
			classify(tweets, pending, quarantined, tally);
			if (!nextCursor) break;
			// Truncated only when a cursor remains unconsumed — a window whose
			// pagination ends naturally ON the cap is fully covered.
			if (pages >= maxPagesPerWindow) {
				truncated = true;
				break;
			}
			cursor = nextCursor;
		}
		if (truncated) {
			console.log(`::warning title=Backfill window truncated::${wSince}..${wUntil} hit --max-pages-per-window=${maxPagesPerWindow}; narrow --window-days to cover it fully.`);
		}

		await flush(pending, quarantined, tally);
		console.log(
			`${wSince}..${wUntil}: ${tally.fetched} fetched, ${tally.verdicts} verdicts, ${tally.quarantined} quarantined${d1 ? `, ${tally.upserted} upserted` : ''}`
		);
	}

	// ---- Phase 2: Wayback CDX sweep for ids the search index missed. ----
	if (wayback) {
		const waybackIds = await fetchWaybackIds();
		if (!d1Read) {
			console.log(
				`Wayback: ${waybackIds.length} archived ids. DB filter unavailable (no credentials in dry-run); skipping hydration — the wet run hydrates only ids missing from verdicts.`
			);
		} else {
			const existing = new Set<string>(
				(
					await d1Read.query<{ verdict_tweet_id: string }>('SELECT verdict_tweet_id FROM verdicts')
				).map((r) => r.verdict_tweet_id)
			);
			// Ids whose stored text STILL matches no template would just re-quarantine
			// on every run — exclude them until a parser fix makes them parseable.
			const stillUnparseable = new Set<string>();
			for (const q of await d1Read.query<{ tweet_id: string; raw_text: string }>(
				'SELECT tweet_id, raw_text FROM quarantine'
			)) {
				if (parseVerdictReply(q.raw_text, []).kind !== 'verdict') stillUnparseable.add(q.tweet_id);
			}
			const todo = waybackIds.filter(
				(id) => !seen.has(id) && !existing.has(id) && !stillUnparseable.has(id)
			);
			console.log(`Wayback: ${waybackIds.length} archived ids, ${todo.length} not otherwise covered.`);

			if (todo.length > 0) {
				const pending: PendingVerdict[] = [];
				const quarantined: Quarantined[] = [];
				const tally: Tally = { fetched: 0, verdicts: 0, quarantined: 0, skipped: 0, upserted: 0 };
				classify(await api.tweetsByIds(todo), pending, quarantined, tally);
				await flush(pending, quarantined, tally);
				console.log(
					`Wayback: ${tally.fetched} hydrated, ${tally.verdicts} verdicts, ${tally.quarantined} quarantined${d1 ? `, ${tally.upserted} upserted` : ''}`
				);
			}
		}
	}

	// ---- Report. ----
	console.log(
		`TOTAL: ${total.fetched} bot tweets, ${total.verdicts} verdicts, ${total.quarantined} quarantined, ${total.skipped} non-verdict${d1 ? `, ${total.upserted} upserted` : ' (dry run — nothing written)'}`
	);
	if (d1) {
		const [{ n, oldest }] = await d1.query<{ n: number; oldest: number | null }>(
			'SELECT COUNT(*) n, MIN(verdict_at) oldest FROM verdicts'
		);
		console.log(
			`DB now holds ${n} verdicts, oldest ${oldest == null ? 'n/a' : new Date(oldest * 1000).toISOString().slice(0, 10)} (lifetime estimate ~8,900 as of 2026-08-08).`
		);
	}
	logDriftWarning(total.quarantined);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
