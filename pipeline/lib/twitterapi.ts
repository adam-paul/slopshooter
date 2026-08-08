import type { NormalizedTweet } from './types';

const BASE = 'https://api.twitterapi.io';

/**
 * Thin client for twitterapi.io ($0.15/1k tweets, pay-as-you-go).
 *
 * CAVEAT: exact response field names were not verified against a live key when
 * this was written — normalizeTweet() maps every plausible spelling and is the
 * ONLY place that touches raw payloads. On your first run, use
 * `bun run pipeline/poll.ts --dry-run` and check that ids/handles/reply fields
 * come through; adjust normalizeTweet() if the provider's schema differs.
 */
export class TwitterApiClient {
	constructor(private apiKey: string) {}

	private async get(path: string, params: Record<string, string>): Promise<any> {
		const url = new URL(BASE + path);
		for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
		const res = await fetch(url, { headers: { 'X-API-Key': this.apiKey } });
		if (!res.ok) {
			throw new Error(`twitterapi.io ${path} -> HTTP ${res.status}: ${await res.text()}`);
		}
		const json: any = await res.json();
		if (json?.status && json.status !== 'success') {
			throw new Error(`twitterapi.io ${path} -> status=${json.status}: ${json.msg ?? json.message ?? 'unknown error'}`);
		}
		return json?.data ?? json;
	}

	/** One page of a user's timeline including replies. */
	async userLastTweets(
		userName: string,
		cursor?: string
	): Promise<{ tweets: NormalizedTweet[]; nextCursor: string | null }> {
		const payload = await this.get('/twitter/user/last_tweets', {
			userName,
			includeReplies: 'true',
			...(cursor ? { cursor } : {})
		});
		const raw: any[] = payload?.tweets ?? payload?.data?.tweets ?? [];
		const hasNext = payload?.has_next_page ?? payload?.hasNextPage ?? false;
		const next = payload?.next_cursor ?? payload?.nextCursor ?? null;
		return { tweets: raw.map(normalizeTweet), nextCursor: hasNext && next ? String(next) : null };
	}

	/** Batch tweet hydration by id (chunks of 100). */
	async tweetsByIds(ids: string[]): Promise<NormalizedTweet[]> {
		const out: NormalizedTweet[] = [];
		for (let i = 0; i < ids.length; i += 100) {
			const payload = await this.get('/twitter/tweets', {
				tweet_ids: ids.slice(i, i + 100).join(',')
			});
			const raw: any[] = payload?.tweets ?? [];
			out.push(...raw.map(normalizeTweet));
		}
		return out;
	}
}

function str(v: unknown): string | null {
	if (v === null || v === undefined) return null;
	const s = String(v);
	return s.length > 0 ? s : null;
}

export function normalizeTweet(t: any): NormalizedTweet {
	const author = t.author ?? t.user ?? {};
	const quoted = t.quoted_tweet ?? t.quotedTweet ?? null;
	return {
		// Prefer string-typed id fields: a legacy payload's numeric `id` has already
		// lost precision beyond 2^53 by the time JSON.parse hands it to us.
		id: str(t.id_str ?? t.tweet_id ?? t.id) ?? '',
		text: t.text ?? t.full_text ?? '',
		createdAt: parseTweetDate(t.createdAt ?? t.created_at),
		authorId: str(author.id_str ?? t.author_id ?? author.id),
		authorHandle: author.userName ?? author.username ?? author.screen_name ?? null,
		inReplyToTweetId: str(t.in_reply_to_status_id_str ?? t.inReplyToId ?? t.in_reply_to_status_id),
		inReplyToUserId: str(t.in_reply_to_user_id_str ?? t.inReplyToUserId ?? t.in_reply_to_user_id),
		inReplyToHandle: t.inReplyToUsername ?? t.in_reply_to_screen_name ?? null,
		quotedTweetId: str(quoted?.id_str ?? t.quoted_status_id_str ?? quoted?.id),
		quotedAuthorHandle: quoted?.author?.userName ?? quoted?.user?.screen_name ?? null,
		expandedUrls: (t.entities?.urls ?? [])
			.map((u: any) => u.expanded_url ?? u.expandedUrl ?? u.url)
			.filter(Boolean)
	};
}

/** Handles ISO 8601 and legacy "Wed Oct 10 20:19:24 +0000 2018". Returns unix seconds, 0 on failure. */
export function parseTweetDate(v: unknown): number {
	if (typeof v === 'number' && Number.isFinite(v)) {
		return v > 1e12 ? Math.floor(v / 1000) : Math.floor(v);
	}
	if (typeof v === 'string') {
		let ms = Date.parse(v);
		if (Number.isNaN(ms)) {
			const m = v.match(/^\w{3} (\w{3}) (\d{1,2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{4}) (\d{4})$/);
			if (m) ms = Date.parse(`${m[1]} ${m[2]}, ${m[5]} ${m[3]} GMT${m[4]}`);
		}
		if (!Number.isNaN(ms)) return Math.floor(ms / 1000);
	}
	return 0;
}
