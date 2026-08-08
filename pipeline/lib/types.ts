export type VerdictLabel = 'ai' | 'human' | 'mix';

/**
 * Provider-agnostic tweet shape. All provider-specific field names are handled
 * in normalizeTweet() (twitterapi.ts) — nothing else in the pipeline should
 * ever touch a raw API payload.
 */
export interface NormalizedTweet {
	id: string;
	text: string;
	/** Unix seconds; 0 if the source date failed to parse (logged by caller). */
	createdAt: number;
	authorId: string | null;
	authorHandle: string | null;
	inReplyToTweetId: string | null;
	inReplyToUserId: string | null;
	inReplyToHandle: string | null;
	quotedTweetId: string | null;
	quotedAuthorHandle: string | null;
	expandedUrls: string[];
}
