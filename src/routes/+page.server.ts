import { sql } from 'drizzle-orm';
import { hitRatePct } from '$lib/format';
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

export type LeaderboardRow = LeaderboardCounts & { hitRate: number };

export interface RecentRow {
	verdictTweetId: string;
	verdict: string;
	taggerHandle: string | null;
	checkedAuthorHandle: string | null;
	historyUuid: string | null;
	verdictAt: number;
}

const MIN_CHECKS = 5;

export const load: PageServerLoad = async ({ platform }) => {
	const db = getDb(platform);

	// Three independent reads — overlap them instead of serializing TTFB.
	const [leaderboardCounts, recent, totalsRows] = await Promise.all([
		db.all<LeaderboardCounts>(sql`
			SELECT
				tagger_handle       AS handle,
				COUNT(*)            AS checks,
				SUM(verdict = 'ai') AS ai,
				SUM(verdict = 'mix') AS mix,
				SUM(verdict = 'human') AS human,
				MAX(verdict_at)     AS lastAt
			FROM verdicts
			WHERE tagger_handle IS NOT NULL
			GROUP BY lower(tagger_handle)
			HAVING COUNT(*) >= ${MIN_CHECKS}
			ORDER BY (1.0 * SUM(verdict = 'ai')) / COUNT(*) DESC, checks DESC
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
			SELECT
				COUNT(*)                             AS checks,
				COALESCE(SUM(verdict = 'ai'), 0)     AS ai,
				COUNT(DISTINCT lower(tagger_handle)) AS taggers
			FROM verdicts
		`)
	]);

	// hitRatePct is the one owner of the metric's definition — SQL returns raw
	// counts and only uses the raw ratio for ordering.
	const leaderboard: LeaderboardRow[] = leaderboardCounts.map((r) => ({
		...r,
		hitRate: hitRatePct(r.ai, r.checks)
	}));

	return {
		leaderboard,
		recent,
		totals: totalsRows[0] ?? { checks: 0, ai: 0, taggers: 0 },
		minChecks: MIN_CHECKS
	};
};
