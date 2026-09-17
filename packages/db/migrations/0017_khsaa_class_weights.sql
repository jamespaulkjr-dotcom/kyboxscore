-- KHSAA's real football class weighting.
--
-- The formula shipped through khsaa-2026.1 applied a team level multiplier to
-- the finished rating. KHSAA does not do that. Their class weight is a per
-- game term inside the winning percentage, applied to wins only, as the ratio
-- of two published class weights. The engine now matches; these columns are
-- what the audit trail needs to show a coach the new arithmetic.
--
-- Additive and nullable on purpose, so this deploys ahead of the code that
-- writes it without disturbing the run currently on the site.

-- What actually entered WP for this game. In football that is the class
-- weighted value, which can exceed 1.0 and reaches 2.011 at the extreme (a 1A
-- team beating 6A). result_value keeps the raw 1 / 0.5 / 0 beside it, because
-- a coach disputing a rating asks both "did we win" and "what was it worth".
ALTER TABLE rpi_input
  ADD COLUMN game_value numeric(7,6);

-- Whether one of the season's two play-down exemptions covered this contest,
-- neutralising the weight. Stored rather than recomputed: the exemptions go to
-- the first two such contests in date order, so which games got them is a
-- property of the run, and a schedule correction months later must not silently
-- rewrite what a past ranking was built on.
ALTER TABLE rpi_input
  ADD COLUMN play_down_exempt boolean NOT NULL DEFAULT false;

-- rpi_result.class_factor is deliberately left in place. It is NOT NULL with a
-- default of 1.0 and has no counterpart in KHSAA's method, so runs from
-- khsaa-2026.2 onward write the identity and nothing reads it. Dropping it
-- would destroy the only record of what the superseded formula published,
-- which is exactly the history rpi_run.formula_version exists to preserve.
COMMENT ON COLUMN rpi_result.class_factor IS
  'Superseded. Team level multiplier from khsaa-2026.1 and earlier; always 1.0 from khsaa-2026.2. KHSAA weights class per game inside WP, see rpi_input.game_value.';

COMMENT ON COLUMN rpi_input.game_value IS
  'The value this game contributed to WP. Class weighted in football; equal to result_value elsewhere.';
