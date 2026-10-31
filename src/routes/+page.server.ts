import { sql } from 'drizzle-orm';
import { scoreOf } from '$lib/format';
import { getDb } from '$lib/server/db';
import type { PageServerLoad } from './$types';

interface LeaderboardCounts {
	handle: string;
	checks: number;
	ai: number;
	mix: number;
	human: number;
	lastAt: number;
}

export type LeaderboardRow = LeaderboardCounts & { score: number };

export interface RecentRow {
	verdictTweetId: string;
	verdict: string;
	taggerHandle: string | null;
	checkedAuthorHandle: string | null;
	historyUuid: string | null;
	verdictAt: number;
}

const MIN_CHECKS = 5;
const WEEK_SECONDS = 7 * 86400;

export const load: PageServerLoad = async ({ platform, url }) => {
	const db = getDb(platform);

	const range = url.searchParams.get('range') === 'week' ? 'week' : 'all-time';
	const cutoff = range === 'week' ? Math.floor(Date.now() / 1000) - WEEK_SECONDS : 0;

	// Three independent reads — overlap them instead of serializing TTFB.
	const [leaderboardCounts, recent, totalsRows] = await Promise.all([
		// All-time reads the trigger-maintained tagger_stats in idx_tagger_stats_board order
		// (~100 rows); its ORDER BY and inlined MIN_CHECKS must match that index exactly.
		// The week has no summary, so it is pinned to the verdict_at index: left alone the
		// planner groups via idx_verdicts_tagger_lower and scans every verdict ever.
		range === 'week'
			? db.all<LeaderboardCounts>(sql`
					SELECT
						tagger_handle       AS handle,
						COUNT(*)            AS checks,
						SUM(verdict = 'ai') AS ai,
						SUM(verdict = 'mix') AS mix,
						SUM(verdict = 'human') AS human,
						MAX(verdict_at)     AS lastAt
					FROM verdicts INDEXED BY idx_verdicts_verdict_at
					WHERE tagger_handle IS NOT NULL AND verdict_at >= ${cutoff}
					GROUP BY lower(tagger_handle)
					HAVING COUNT(*) >= ${MIN_CHECKS}
					ORDER BY (SUM(verdict = 'ai') + 0.5 * SUM(verdict = 'mix')) / (1.0 * COUNT(*)) DESC, checks DESC, lower(tagger_handle)
					LIMIT 100
				`)
			: db.all<LeaderboardCounts>(sql`
					SELECT handle, checks, ai, mix, human, last_at AS lastAt
					FROM tagger_stats
					WHERE checks >= ${sql.raw(String(MIN_CHECKS))}
					ORDER BY (ai + 0.5 * mix) / (1.0 * checks) DESC, checks DESC, handle_key
					LIMIT 100
				`),
		db.all<RecentRow>(sql`
			SELECT
				verdict_tweet_id      AS verdictTweetId,
				verdict,
				tagger_handle         AS taggerHandle,
				checked_author_handle AS checkedAuthorHandle,
				history_uuid          AS historyUuid,
				verdict_at            AS verdictAt
			FROM verdicts
			ORDER BY verdict_at DESC
			LIMIT 25
		`),
		db.all<{ checks: number; ai: number; taggers: number }>(sql`
			SELECT checks, ai, taggers FROM verdict_totals
		`)
	]);

	// scoreOf is the one owner of the metric (AI=1, Mixed=1/2, Human=0) — SQL
	// mirrors it only for ORDER BY.
	const leaderboard: LeaderboardRow[] = leaderboardCounts.map((r) => ({
		...r,
		score: scoreOf(r.ai, r.mix, r.checks)
	}));

	return {
		leaderboard,
		recent,
		totals: totalsRows[0] ?? { checks: 0, ai: 0, taggers: 0 },
		minChecks: MIN_CHECKS,
		range
	};
};
