-- Use whichever source accounts for more of the opponent's season.
--
-- 0015 preferred the schedule whenever it held any completed game. That is
-- wrong while a schedule is only partly scored, and ours is: of 313 imported
-- rows only 34 carry a result, and those 34 are exactly the Kentucky matchups.
-- So the schedule "knew" Anderson had played one game, the typed record knew
-- they had played three, the schedule won, the head-to-head was removed, and
-- 32 of 34 opponents fell back to a flat .500 - wiping out the very deltas
-- this feature exists to show.
--
-- The rule now: whichever source has seen more completed games wins. That
-- keeps the hand-entered totals in charge today and hands over to the schedule
-- on its own, with no further change, once those 279 scores are filled in.

CREATE OR REPLACE VIEW out_of_state_adjusted AS
WITH head_to_head AS (
  SELECT g.id AS game_id,
         g.sport_season_id,
         ky.team_id  AS kentucky_team_id,
         oos.team_id AS opponent_team_id,
         (oos.score > ky.score) AS oos_won,
         (oos.score < ky.score) AS oos_lost,
         (oos.score = ky.score) AS oos_tied
  FROM game g
  JOIN game_participant ky ON ky.game_id = g.id
  JOIN team kt ON kt.id = ky.team_id
  JOIN school ks ON ks.id = kt.school_id AND ks.state = 'KY'
  JOIN game_participant oos ON oos.game_id = g.id AND oos.id <> ky.id
  JOIN team ot ON ot.id = oos.team_id
  JOIN school os ON os.id = ot.school_id AND os.state <> 'KY'
  WHERE g.status IN ('final', 'forfeit')
    AND g.stage = 'regular_season'
    AND ky.score IS NOT NULL AND oos.score IS NOT NULL
)
SELECT h.sport_season_id,
       h.kentucky_team_id,
       h.opponent_team_id,
       raw.wins   AS raw_wins,
       raw.losses AS raw_losses,
       raw.ties   AS raw_ties,
       src.use_schedule AS from_schedule,
       adj.wins, adj.losses, adj.ties,
       adj.wins + adj.losses + adj.ties AS games
FROM head_to_head h
CROSS JOIN LATERAL (
  SELECT count(*) FILTER (WHERE og.result IS NOT NULL)::int AS played,
         count(*) FILTER (WHERE og.result = 'W')::int AS wins,
         count(*) FILTER (WHERE og.result = 'L')::int AS losses,
         count(*) FILTER (WHERE og.result = 'T')::int AS ties,
         count(*) FILTER (WHERE og.result = 'W'
                            AND og.kentucky_game_id IS DISTINCT FROM h.game_id)::int AS adj_wins,
         count(*) FILTER (WHERE og.result = 'L'
                            AND og.kentucky_game_id IS DISTINCT FROM h.game_id)::int AS adj_losses,
         count(*) FILTER (WHERE og.result = 'T'
                            AND og.kentucky_game_id IS DISTINCT FROM h.game_id)::int AS adj_ties
  FROM out_of_state_game og
  WHERE og.team_id = h.opponent_team_id
    AND og.sport_season_id = h.sport_season_id
) sched
LEFT JOIN out_of_state_record rec
       ON rec.team_id = h.opponent_team_id
      AND rec.sport_season_id = h.sport_season_id
CROSS JOIN LATERAL (
  -- The fuller account of their season wins. A partly scored schedule must not
  -- overrule a hand-entered total that has seen more games.
  SELECT sched.played >=
         greatest(coalesce(rec.wins, 0) + coalesce(rec.losses, 0)
                + coalesce(rec.ties, 0), 1)
         AND sched.played > 0 AS use_schedule
) src
CROSS JOIN LATERAL (
  SELECT CASE WHEN src.use_schedule THEN sched.wins   ELSE coalesce(rec.wins, 0)   END AS wins,
         CASE WHEN src.use_schedule THEN sched.losses ELSE coalesce(rec.losses, 0) END AS losses,
         CASE WHEN src.use_schedule THEN sched.ties   ELSE coalesce(rec.ties, 0)   END AS ties
) raw
CROSS JOIN LATERAL (
  SELECT
    CASE WHEN src.use_schedule THEN sched.adj_wins
         ELSE greatest(coalesce(rec.wins, 0)   - (h.oos_won)::int,  0) END AS wins,
    CASE WHEN src.use_schedule THEN sched.adj_losses
         ELSE greatest(coalesce(rec.losses, 0) - (h.oos_lost)::int, 0) END AS losses,
    CASE WHEN src.use_schedule THEN sched.adj_ties
         ELSE greatest(coalesce(rec.ties, 0)   - (h.oos_tied)::int, 0) END AS ties
) adj;

COMMENT ON VIEW out_of_state_adjusted IS
  'One row per (season, Kentucky team, out-of-state opponent): the opponent''s '
  'record with that Kentucky team''s game removed. Sourced from whichever of '
  'the schedule or the hand-entered record has seen more completed games. '
  'games = 0 means there is no winning percentage, not one of .500.';
