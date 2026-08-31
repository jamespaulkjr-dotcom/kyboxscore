-- Preseason games.
--
-- KHSAA football does not count anything played before the season's first
-- permissible date. Those games are real - they have scores, and coaches and
-- parents want to see them - but they count for no record, no district
-- standing and no RPI.
--
-- "scrimmage" already existed but is not the same thing: a scrimmage is a
-- scrimmage whenever it is played, while a preseason game is defined purely by
-- falling before sport_season.starts_on. Keeping them apart means the date rule
-- can be re-applied every season without destroying the scrimmage flag a human
-- set by hand.
--
-- The new enum value cannot be used in the same transaction that adds it, so
-- the reclassification lives in the next migration.

ALTER TYPE game_stage ADD VALUE IF NOT EXISTS 'preseason' BEFORE 'regular_season';

-- A preseason record is worth showing, clearly labelled as not counting.
ALTER TABLE team_season_record
  ADD COLUMN preseason_wins   smallint NOT NULL DEFAULT 0,
  ADD COLUMN preseason_losses smallint NOT NULL DEFAULT 0;
