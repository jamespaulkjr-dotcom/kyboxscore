-- The full KHSAA offering, which is wider than the head-to-head scored game
-- the sport table originally assumed.
--
-- KHSAA groups its offering three ways, and the grouping is not cosmetic - it
-- decides what a "score" even means:
--
--   team        head-to-head, one score per side       (football, soccer)
--   individual  meet or match, placings and times      (cross country, golf)
--   activity    judged or scored events                (dance, esports)
--
-- Only team sports have a scoring unit, periods, or an RPI. Those columns were
-- NOT NULL because every sport modelled so far was a team sport; they become
-- nullable rather than being filled with a lie like 'points'/'quarter'/1 for
-- bass fishing.

CREATE TYPE sport_category AS ENUM ('team', 'individual', 'activity');

ALTER TABLE sport
  ADD COLUMN category sport_category NOT NULL DEFAULT 'team';

ALTER TABLE sport
  ALTER COLUMN scoring_unit       DROP NOT NULL,
  ALTER COLUMN period_noun        DROP NOT NULL,
  ALTER COLUMN regulation_periods DROP NOT NULL;

-- A sport with no head-to-head result has no winning percentage and therefore
-- no RPI. 'none' says so explicitly rather than leaving 'standard' to imply an
-- RPI that will never be computed.
ALTER TABLE sport DROP CONSTRAINT sport_rpi_profile_check;
ALTER TABLE sport
  ADD CONSTRAINT sport_rpi_profile_check
  CHECK (rpi_profile IN ('standard', 'football', 'none'));

-- The three scoring columns travel together: either a sport is scored
-- head-to-head and has all of them, or it is not and has none.
ALTER TABLE sport
  ADD CONSTRAINT sport_scoring_complete
  CHECK (
    (scoring_unit IS NULL AND period_noun IS NULL AND regulation_periods IS NULL)
    OR
    (scoring_unit IS NOT NULL AND period_noun IS NOT NULL AND regulation_periods IS NOT NULL)
  );

-- Non-team sports must not claim an RPI profile they cannot use.
ALTER TABLE sport
  ADD CONSTRAINT sport_rpi_requires_team
  CHECK (category = 'team' OR rpi_profile = 'none');

COMMENT ON COLUMN sport.category IS
  'KHSAA grouping. Decides whether a scoring unit, periods and RPI apply.';
COMMENT ON COLUMN sport.is_active IS
  'This sport is part of our offering. Whether it is browsable depends on a
   current sport_season existing, which is a separate question.';
