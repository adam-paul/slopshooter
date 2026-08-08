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
		db.all<LeaderboardCounts>(sql`
			SELECT
				tagger_handle       AS handle,
				COUNT(*)            AS checks,
				SUM(verdict = 'ai') AS ai,
				SUM(verdict = 'mix') AS mix,
				SUM(verdict = 'human') AS human,
				MAX(verdict_at)     AS lastAt
			FROM verdicts
			WHERE tagger_handle IS NOT NULL AND verdict_at >= ${cutoff}
			GROUP BY lower(tagger_handle)
			HAVING COUNT(*) >= ${MIN_CHECKS}
			ORDER BY (SUM(verdict = 'ai') + 0.5 * SUM(verdict = 'mix')) / (1.0 * COUNT(*)) DESC, checks DESC
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
