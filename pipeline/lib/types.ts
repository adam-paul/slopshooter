export type { VerdictLabel } from '../../shared/verdicts';

/**
 * Provider-agnostic tweet shape. All provider-specific field names are handled
 * in normalizeTweet() (twitterapi.ts) — nothing else in the pipeline should
 * ever touch a raw API payload.
 */
export interface NormalizedTweet {
	id: string;
	text: string;
	/** Unix seconds. Derived from the snowflake id when the source date failed to parse. */
	createdAt: number;
	/** True when createdAt came from the snowflake fallback, not the payload. */
	createdAtDerived: boolean;
	authorId: string | null;
	authorHandle: string | null;
	inReplyToTweetId: string | null;
	inReplyToUserId: string | null;
	inReplyToHandle: string | null;
	quotedTweetId: string | null;
	quotedAuthorHandle: string | null;
	expandedUrls: string[];
}
