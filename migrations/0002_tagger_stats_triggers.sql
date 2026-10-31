-- Keeps tagger_stats and verdict_totals exact on every write path (poller, backfill,
-- hand-run SQL), so the home page reads ~100 rows instead of scanning verdicts.
-- Inserts count incrementally; updates and deletes recount just the affected
-- taggers through idx_verdicts_tagger_lower. INSERT OR REPLACE into verdicts would
-- skip the delete trigger (SQLite only fires it with recursive_triggers on), so
-- writers must keep using ON CONFLICT ... DO UPDATE.

-- Serves the all-time leaderboard straight off an index: the expression and the
-- WHERE must match the query in src/routes/+page.server.ts (MIN_CHECKS = 5) exactly.
-- handle_key breaks ties alphabetically, as the old GROUP BY did; without it ties would
-- fall in rowid order, which the triggers reshuffle on every recount.
CREATE INDEX `idx_tagger_stats_board` ON `tagger_stats` ((ai + 0.5 * mix) / (1.0 * checks) DESC, checks DESC, handle_key) WHERE checks >= 5;
--> statement-breakpoint
CREATE TRIGGER `verdicts_stats_insert` AFTER INSERT ON `verdicts` BEGIN
	UPDATE verdict_totals SET checks = checks + 1, ai = ai + (NEW.verdict = 'ai');
	INSERT INTO tagger_stats (handle_key, handle, checks, ai, mix, human, last_at)
		SELECT lower(NEW.tagger_handle), NEW.tagger_handle, 1,
			NEW.verdict = 'ai', NEW.verdict = 'mix', NEW.verdict = 'human', NEW.verdict_at
		WHERE NEW.tagger_handle IS NOT NULL
	ON CONFLICT(handle_key) DO UPDATE SET
		checks = checks + 1,
		ai = ai + excluded.ai,
		mix = mix + excluded.mix,
		human = human + excluded.human,
		handle = CASE WHEN excluded.last_at >= last_at THEN excluded.handle ELSE handle END,
		last_at = max(last_at, excluded.last_at);
END;
--> statement-breakpoint
-- The poller's upsert names tagger_handle in its SET list on every conflict, so the
-- WHEN keeps unchanged re-fetches from recounting anything.
CREATE TRIGGER `verdicts_stats_update` AFTER UPDATE OF verdict, tagger_handle, verdict_at ON `verdicts`
WHEN OLD.verdict IS NOT NEW.verdict OR OLD.tagger_handle IS NOT NEW.tagger_handle OR OLD.verdict_at IS NOT NEW.verdict_at
BEGIN
	UPDATE verdict_totals SET ai = ai + (NEW.verdict = 'ai') - (OLD.verdict = 'ai');
	DELETE FROM tagger_stats WHERE handle_key IN (lower(OLD.tagger_handle), lower(NEW.tagger_handle));
	INSERT INTO tagger_stats (handle_key, handle, checks, ai, mix, human, last_at)
		SELECT lower(tagger_handle), tagger_handle, COUNT(*),
			SUM(verdict = 'ai'), SUM(verdict = 'mix'), SUM(verdict = 'human'), MAX(verdict_at)
		FROM verdicts
		WHERE lower(tagger_handle) IN (lower(OLD.tagger_handle), lower(NEW.tagger_handle))
		GROUP BY lower(tagger_handle);
END;
--> statement-breakpoint
CREATE TRIGGER `verdicts_stats_delete` AFTER DELETE ON `verdicts` BEGIN
	UPDATE verdict_totals SET checks = checks - 1, ai = ai - (OLD.verdict = 'ai');
	DELETE FROM tagger_stats WHERE handle_key = lower(OLD.tagger_handle);
	INSERT INTO tagger_stats (handle_key, handle, checks, ai, mix, human, last_at)
		SELECT lower(tagger_handle), tagger_handle, COUNT(*),
			SUM(verdict = 'ai'), SUM(verdict = 'mix'), SUM(verdict = 'human'), MAX(verdict_at)
		FROM verdicts
		WHERE lower(tagger_handle) = lower(OLD.tagger_handle)
		GROUP BY lower(tagger_handle);
END;
--> statement-breakpoint
-- verdict_totals.taggers follows tagger_stats rows coming and going.
CREATE TRIGGER `tagger_stats_insert` AFTER INSERT ON `tagger_stats` BEGIN
	UPDATE verdict_totals SET taggers = taggers + 1;
END;
--> statement-breakpoint
CREATE TRIGGER `tagger_stats_delete` AFTER DELETE ON `tagger_stats` BEGIN
	UPDATE verdict_totals SET taggers = taggers - 1;
END;
--> statement-breakpoint
-- Fill both tables from scratch, after the triggers exist, so a poll landing mid-migration
-- is counted either by the triggers or by this recount. Re-running these three statements
-- is also the repair if the tables are ever suspected of drifting.
DELETE FROM tagger_stats;
--> statement-breakpoint
INSERT INTO tagger_stats (handle_key, handle, checks, ai, mix, human, last_at)
	SELECT lower(tagger_handle), tagger_handle, COUNT(*),
		SUM(verdict = 'ai'), SUM(verdict = 'mix'), SUM(verdict = 'human'), MAX(verdict_at)
	FROM verdicts
	WHERE tagger_handle IS NOT NULL
	GROUP BY lower(tagger_handle);
--> statement-breakpoint
INSERT OR REPLACE INTO verdict_totals (id, checks, ai, taggers)
	SELECT 1, COUNT(*), COALESCE(SUM(verdict = 'ai'), 0), (SELECT COUNT(*) FROM tagger_stats)
	FROM verdicts;
