import { error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export interface UserVerdictRow {
	verdictTweetId: string;
	verdict: string;
	checkedAuthorHandle: string | null;
	historyUuid: string | null;
	shortTextDisclaimer: number;
	verdictAt: number;
}

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = getDb(platform);
	const handle = params.handle;

	// Headline stats come from an unlimited aggregate — the feed below is capped
	// at 200 rows and must never be the source of the counts. The two reads are
	// independent, so overlap them and 404 after both resolve.
	const [countsRows, verdicts] = await Promise.all([
		db.all<{ checks: number; ai: number; mix: number; human: number }>(sql`
			SELECT
				COUNT(*)                          AS checks,
				COALESCE(SUM(verdict = 'ai'), 0)  AS ai,
				COALESCE(SUM(verdict = 'mix'), 0) AS mix,
				COALESCE(SUM(verdict = 'human'), 0) AS human
			FROM verdicts
			WHERE lower(tagger_handle) = lower(${handle})
		`),
		db.all<UserVerdictRow>(sql`
			SELECT
				verdict_tweet_id      AS verdictTweetId,
				verdict,
				checked_author_handle AS checkedAuthorHandle,
				history_uuid          AS historyUuid,
				short_text_disclaimer AS shortTextDisclaimer,
				verdict_at            AS verdictAt
			FROM verdicts
			WHERE lower(tagger_handle) = lower(${handle})
			ORDER BY verdict_at DESC
			LIMIT 200
		`)
	]);

	const totals = countsRows[0];
	if (!totals || totals.checks === 0) {
		error(404, `No tracked checks for @${handle}`);
	}

	return {
		handle,
		verdicts,
		counts: { ai: totals.ai, mix: totals.mix, human: totals.human },
		totalChecks: totals.checks
	};
};
