CREATE TABLE `tagger_stats` (
	`handle_key` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`checks` integer NOT NULL,
	`ai` integer NOT NULL,
	`mix` integer NOT NULL,
	`human` integer NOT NULL,
	`last_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verdict_totals` (
	`id` integer PRIMARY KEY NOT NULL,
	`checks` integer NOT NULL,
	`ai` integer NOT NULL,
	`taggers` integer NOT NULL
);
