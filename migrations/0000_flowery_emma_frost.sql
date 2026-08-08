CREATE TABLE `ingest_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `quarantine` (
	`tweet_id` text PRIMARY KEY NOT NULL,
	`raw_text` text NOT NULL,
	`reason` text NOT NULL,
	`seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verdicts` (
	`verdict_tweet_id` text PRIMARY KEY NOT NULL,
	`history_uuid` text,
	`verdict` text NOT NULL,
	`pct_ai` real,
	`tagger_id` text,
	`tagger_handle` text,
	`summons_id` text,
	`summons_text` text,
	`checked_post_id` text,
	`checked_author_handle` text,
	`short_text_disclaimer` integer DEFAULT false NOT NULL,
	`truncated` integer DEFAULT false NOT NULL,
	`from_image` integer DEFAULT false NOT NULL,
	`raw_text` text NOT NULL,
	`verdict_at` integer NOT NULL,
	`ingested_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_verdicts_tagger` ON `verdicts` (`tagger_handle`);--> statement-breakpoint
CREATE INDEX `idx_verdicts_verdict_at` ON `verdicts` (`verdict_at`);--> statement-breakpoint
CREATE INDEX `idx_verdicts_checked_author` ON `verdicts` (`checked_author_handle`);