/**
 * Minimal Cloudflare D1 HTTP API client, used by the GitHub Actions pipeline.
 * (The SvelteKit app uses the Workers binding instead — see src/lib/server/db.)
 */
export class D1HttpClient {
	constructor(
		private accountId: string,
		private databaseId: string,
		private apiToken: string
	) {}

	async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
		return (await this.queryWithMeta<T>(sql, params)).results;
	}

	/** Like query(), but also returns D1's per-statement meta (e.g. meta.changes). */
	async queryWithMeta<T = Record<string, unknown>>(
		sql: string,
		params: unknown[] = []
	): Promise<{ results: T[]; meta: { changes?: number; [k: string]: unknown } | undefined }> {
		const res = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${this.accountId}/d1/database/${this.databaseId}/query`,
			{
				method: 'POST',
				headers: {
					authorization: `Bearer ${this.apiToken}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({ sql, params })
			}
		);
		const json: any = await res.json().catch(() => null);
		if (!res.ok || json?.success === false) {
			throw new Error(`D1 query failed (HTTP ${res.status}): ${JSON.stringify(json?.errors ?? json)}`);
		}
		const first = json?.result?.[0];
		return { results: first?.results ?? [], meta: first?.meta };
	}
}
