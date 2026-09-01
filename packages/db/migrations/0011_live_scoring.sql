-- Live scoring: who is allowed to keep it, and what they did.
--
-- Three problems this solves.
--
-- 1. The person in the press box is usually not the coach. It is a team mom, a
--    student manager, or the AD's nephew. Requiring them to hold an account
--    twenty minutes before kick-off means it does not happen, so a coach can
--    mint a link scoped to ONE game and one side and text it to them. It is a
--    bearer token, so it is narrow on purpose: one game, expires, revocable,
--    and it can only move a score.
--
-- 2. Accountability. scoring_play had no record of who entered it. A public
--    score somebody can dispute needs a name against every change.
--
-- 3. Undo. Fat fingers happen on a phone in the cold, so a play is voided
--    rather than deleted - the audit trail is the point.

CREATE TABLE game_scorekeeper (
  id                 bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id            bigint      NOT NULL REFERENCES game ON DELETE CASCADE,
  -- Which side handed it out. A keeper link scores the whole game, but we keep
  -- the delegating team so a coach only ever sees and revokes their own.
  team_id            bigint      NOT NULL REFERENCES team,
  token_hash         text        NOT NULL UNIQUE,
  label              text        NOT NULL,
  created_by_user_id bigint      NOT NULL REFERENCES app_user,
  created_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  revoked_at         timestamptz,
  last_used_at       timestamptz
);
CREATE INDEX game_scorekeeper_game_idx ON game_scorekeeper (game_id);

COMMENT ON TABLE game_scorekeeper IS
  'Per-game bearer links so a coach can delegate scorekeeping without the '
  'keeper needing an account. Scoped to one game, always expiring, revocable.';

-- Who entered a play, by whichever route. Both nullable: rows that arrived by
-- file import have neither.
ALTER TABLE scoring_play
  ADD COLUMN entered_by_user_id bigint      REFERENCES app_user,
  ADD COLUMN scorekeeper_id     bigint      REFERENCES game_scorekeeper,
  ADD COLUMN entered_at         timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN voided_at          timestamptz;

COMMENT ON COLUMN scoring_play.voided_at IS
  'Undo. The row stays so the audit trail survives; readers must filter it out.';

-- When the score last moved, which is a different question from when the row
-- was last touched. The public scoreboard uses it to stop claiming a game is
-- live hours after everyone went home.
ALTER TABLE game
  ADD COLUMN score_updated_at timestamptz;

COMMENT ON COLUMN game.score_updated_at IS
  'Last time a human moved the score. Drives the LIVE indicator going stale.';

-- The scoreboard asks "which games are live right now" on every poll.
CREATE INDEX game_in_progress_idx ON game (sport_season_id, local_date)
  WHERE status = 'in_progress';
