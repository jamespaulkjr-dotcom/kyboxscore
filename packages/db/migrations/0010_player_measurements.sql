-- Height and weight, for scouting.
--
-- On player_season rather than player: a sophomore is not the same size as a
-- senior, and a measurement without the season it belongs to is worthless to
-- the person reading it.
--
-- These are minors. CLAUDE.md's rule is names, schools, jersey numbers and game
-- statistics, with "when in doubt, leave the field out" - so this is a
-- deliberate widening, made knowingly for a scouting use case, not an accident.
-- Storing is not publishing: nothing displays these yet, and who can see them
-- is a separate decision.

ALTER TABLE player_season
  ADD COLUMN height_inches smallint CHECK (height_inches BETWEEN 36 AND 96),
  ADD COLUMN weight_lb     smallint CHECK (weight_lb BETWEEN 60 AND 500);

COMMENT ON COLUMN player_season.height_inches IS
  'Listed height in inches, as published by the school. Season-scoped.';
COMMENT ON COLUMN player_season.weight_lb IS
  'Listed weight in pounds, as published by the school. Season-scoped.';
