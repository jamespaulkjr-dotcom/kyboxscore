-- Kick-off time.
--
-- Stored as a plain local time, deliberately not folded into a timestamptz.
-- Kentucky spans Eastern and Central, and every school's time_zone currently
-- says Eastern - which is wrong for Paducah, Owensboro, Bowling Green and
-- Hopkinsville. Converting a local time through a zone we know to be wrong
-- would produce a confidently incorrect instant. "7:00 PM local" is exactly
-- what the schedule says and exactly what a reader needs.

ALTER TABLE game ADD COLUMN local_time time;

COMMENT ON COLUMN game.local_time IS
  'Kick-off in the venue''s own local time. Not a timestamptz: school time
   zones are not yet trustworthy, and a wrong instant is worse than a plain
   clock time.';
