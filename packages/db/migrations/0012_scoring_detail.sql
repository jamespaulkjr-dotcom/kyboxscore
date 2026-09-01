-- Scoring plays that say who and how, and a score you can simply type.
--
-- Two things this makes possible.
--
-- 1. **A typed score and tapped plays can coexist.** Scores were recomputed
--    from the plays, so anybody who typed "14-7" because they picked the game
--    up at half time had it wiped the moment they tapped the next touchdown.
--    The adjustment holds whatever was typed, and the score is the plays plus
--    the adjustment - so somebody can start keeping a game that is already
--    under way, which is the normal case, not the exception.
--
-- 2. **A play knows what kind it was.** `description` is prose meant for a
--    reader; matching on it to decide which follow-up questions to ask ("who
--    scored?", "rush or pass?") would break the moment the wording changed.

ALTER TABLE game_participant
  ADD COLUMN score_adjustment smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN game_participant.score_adjustment IS
  'Points not accounted for by scoring plays - a score typed in directly. '
  'The published score is sum(scoring_play.points) + score_adjustment.';

ALTER TABLE scoring_play
  ADD COLUMN play_key text,
  ADD COLUMN method   text;

COMMENT ON COLUMN scoring_play.play_key IS
  'Which button produced this: td, pat, two, fg, safety. Null for plays that '
  'arrived by file import. Never trust it for points - the server owns those.';
COMMENT ON COLUMN scoring_play.method IS
  'How it happened: rush, pass, kick, interception_return and so on. Kept '
  'apart from description so the description can be regenerated when a play '
  'is edited, and so a reader-facing wording change cannot break editing.';
