import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { VERDICT_LABELS } from '../../../../shared/verdicts';

/**
 * One row per verdict reply posted by @pangram.
 *
 * Thread topology (verified Aug 2026, 57/57 samples):
 *   bot verdict --in_reply_to--> summons ("@pangram ai?") --in_reply_to/quoted--> checked post
 * so the tagger comes straight from the verdict tweet's own reply-to fields.
 */
export const verdicts = sqliteTable(
	'verdicts',
	{
		verdictTweetId: text('verdict_tweet_id').primaryKey(),
		/** UUID from the pangram.com/history/{uuid} link — the stable per-check key. */
		historyUuid: text('history_uuid'),
		verdict: text('verdict', { enum: VERDICT_LABELS }).notNull(),
		/** 0–100, OCR'd from the history page's OG image. Null until the v2 enricher runs. */
		pctAi: real('pct_ai'),
		taggerId: text('tagger_id'),
		taggerHandle: text('tagger_handle'),
		summonsId: text('summons_id'),
		summonsText: text('summons_text'),
		checkedPostId: text('checked_post_id'),
		checkedAuthorHandle: text('checked_author_handle'),
		/** "Disclaimer: For text under 75 words, results may be less accurate." present. */
		shortTextDisclaimer: integer('short_text_disclaimer', { mode: 'boolean' })
			.notNull()
			.default(false),
		/** "Truncated to 2500 words." prefix present. */
		truncated: integer('truncated', { mode: 'boolean' }).notNull().default(false),
		/** "Extracted N words from the image." prefix present. */
		fromImage: integer('from_image', { mode: 'boolean' }).notNull().default(false),
		/** "Extracted N words from the link." prefix present (article-URL checks). */
		fromLink: integer('from_link', { mode: 'boolean' }).notNull().default(false),
		rawText: text('raw_text').notNull(),
		/** Unix seconds. Can lag the summons by hours after bot outages (backfills). */
		verdictAt: integer('verdict_at').notNull(),
		ingestedAt: integer('ingested_at').notNull()
	},
	(t) => [
		// Expression index matching how every query compares handles (lower()).
		// A raw-column index could never serve those reads.
		index('idx_verdicts_tagger_lower').on(sql`lower(${t.taggerHandle})`),
		index('idx_verdicts_verdict_at').on(t.verdictAt),
		index('idx_verdicts_checked_author').on(t.checkedAuthorHandle)
	]
);

/**
 * Bot replies that carry a history link but match no known verdict template.
 * The template has drifted twice in nine weeks — rows landing here are the
 * format-drift alarm, not noise. The poller emits a CI warning when it inserts here.
 */
export const quarantine = sqliteTable('quarantine', {
	tweetId: text('tweet_id').primaryKey(),
	rawText: text('raw_text').notNull(),
	reason: text('reason').notNull(),
	seenAt: integer('seen_at').notNull()
});

/** Single-row-per-key state, e.g. the poller's high-water-mark tweet id. */
export const ingestState = sqliteTable('ingest_state', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});
