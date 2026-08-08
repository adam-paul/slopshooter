import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function getDb(platform: App.Platform | undefined) {
	if (!platform?.env?.DB) {
		throw new Error(
			'D1 binding "DB" is not available. In dev, run `bun run db:migrate:local` once and use `bun run dev` (the Cloudflare adapter emulates bindings from wrangler.jsonc).'
		);
	}
	return drizzle(platform.env.DB, { schema });
}

export type Db = ReturnType<typeof getDb>;
