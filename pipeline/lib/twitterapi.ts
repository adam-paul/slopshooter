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
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class TwitterApiClient {
	/** Learned pacing: starts at 0; the first 429 teaches us the account's QPS floor. */
	private minIntervalMs = 0;
	private lastRequestAt = 0;

	constructor(private apiKey: string) {}

	private async get(path: string, params: Record<string, string>): Promise<any> {
		const url = new URL(BASE + path);
		for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

		for (let attempt = 1; ; attempt++) {
			const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
			if (wait > 0) await sleep(wait);
			this.lastRequestAt = Date.now();

			const res = await fetch(url, { headers: { 'X-API-Key': this.apiKey } });
			if (res.status === 429 && attempt <= 5) {
				// Free-tier accounts allow one request per 5s; adopt that pace for the
				// rest of the run instead of failing. Paid tiers never hit this.
				await res.body?.cancel();
				this.minIntervalMs = Math.max(this.minIntervalMs, 5500);
				continue;
			}
			if (!res.ok) {
				throw new Error(`twitterapi.io ${path} -> HTTP ${res.status}: ${await res.text()}`);
			}
			const json: any = await res.json();
			if (json?.status && json.status !== 'success') {
				throw new Error(`twitterapi.io ${path} -> status=${json.status}: ${json.msg ?? json.message ?? 'unknown error'}`);
			}
			// Return the FULL envelope: pagination fields (has_next_page/next_cursor)
			// live at the top level, siblings of data — unwrapping here would lose them.
			return json;
		}
	}

	/** One page of a user's timeline including replies. */
	async userLastTweets(
		userName: string,
		cursor?: string
	): Promise<{ tweets: NormalizedTweet[]; nextCursor: string | null }> {
		const json = await this.get('/twitter/user/last_tweets', {
			userName,
			includeReplies: 'true',
			...(cursor ? { cursor } : {})
		});
		// Verified envelope (2026-08-09): { status, code, msg, data: { pin_tweet, tweets }, has_next_page, next_cursor }
		const raw: any[] = json?.data?.tweets ?? json?.tweets ?? [];
		const next = json?.has_next_page ? (json?.next_cursor ?? null) : null;
		return { tweets: raw.map(normalizeTweet), nextCursor: next ? String(next) : null };
	}

	/** Batch tweet hydration by id (chunks of 100). */
	async tweetsByIds(ids: string[]): Promise<NormalizedTweet[]> {
		const out: NormalizedTweet[] = [];
		for (let i = 0; i < ids.length; i += 100) {
			const json = await this.get('/twitter/tweets', {
				tweet_ids: ids.slice(i, i + 100).join(',')
			});
			const raw: any[] = json?.tweets ?? json?.data?.tweets ?? [];
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
	// Prefer string-typed id fields: a legacy payload's numeric `id` has already
	// lost precision beyond 2^53 by the time JSON.parse hands it to us.
	const id = str(t.id_str ?? t.tweet_id ?? t.id) ?? '';
	const parsedDate = parseTweetDate(t.createdAt ?? t.created_at);
	return {
		id,
		text: t.text ?? t.full_text ?? '',
		// Snowflake ids encode their creation time — the normalization layer owns
		// this fallback so no consumer ever sees a 0 sentinel it must repair.
		createdAt: parsedDate || snowflakeToUnixSeconds(id),
		createdAtDerived: parsedDate === 0,
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

const TWITTER_EPOCH_MS = 1288834974657;

/** Snowflake ids encode their creation time. Returns unix seconds, 0 on failure. */
export function snowflakeToUnixSeconds(id: string): number {
	try {
		return Math.floor((Number(BigInt(id) >> 22n) + TWITTER_EPOCH_MS) / 1000);
	} catch {
		return 0;
	}
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
