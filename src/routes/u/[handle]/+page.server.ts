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

	const verdicts = await db.all<UserVerdictRow>(sql`
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
	`);

	if (verdicts.length === 0) {
		error(404, `No tracked checks for @${handle}`);
	}

	const counts = { ai: 0, mix: 0, human: 0 };
	for (const v of verdicts) {
		if (v.verdict === 'ai') counts.ai++;
		else if (v.verdict === 'mix') counts.mix++;
		else if (v.verdict === 'human') counts.human++;
	}

	return { handle, verdicts, counts };
};
