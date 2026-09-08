-- The adjusted record, as a view rather than a table.
--
-- Derived data stored as a fact goes stale, and this project has paid for that
-- lesson: 188 team records were wrong for three days because one write path
-- forgot to rebuild them. An opponent's adjusted record moves whenever their
-- raw record does, so it is computed on read.
--
-- Keyed on (season, Kentucky team, out-of-state opponent), because RPI removes
-- only the game against the team being rated. One row per matchup, never one
-- per opponent: Jellico played Lynn Camp and Jackson County, and the two of
-- them are owed different numbers.
--
-- Two ways to get there, and the difference matters:
--
--   * from the opponent's own schedule, when we hold their completed games.
--     The head-to-head is removed by *identifying the row*, so it works
--     whether or not their Kentucky games are in the schedule.
--   * from the hand-entered overall record otherwise, where the head-to-head
--     is removed by subtracting its result. That assumes the raw record
--     includes the Kentucky game, which is what "overall record" means.

CREATE VIEW out_of_state_adjusted AS
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
       (sched.played > 0) AS from_schedule,
       adj.wins, adj.losses, adj.ties,
       adj.wins + adj.losses + adj.ties AS games
FROM head_to_head h
-- Their own completed games, and the same again with this one match removed.
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
  SELECT CASE WHEN sched.played > 0 THEN sched.wins   ELSE coalesce(rec.wins, 0)   END AS wins,
         CASE WHEN sched.played > 0 THEN sched.losses ELSE coalesce(rec.losses, 0) END AS losses,
         CASE WHEN sched.played > 0 THEN sched.ties   ELSE coalesce(rec.ties, 0)   END AS ties
) raw
CROSS JOIN LATERAL (
  SELECT
    CASE WHEN sched.played > 0 THEN sched.adj_wins
         ELSE greatest(coalesce(rec.wins, 0)   - (h.oos_won)::int,  0) END AS wins,
    CASE WHEN sched.played > 0 THEN sched.adj_losses
         ELSE greatest(coalesce(rec.losses, 0) - (h.oos_lost)::int, 0) END AS losses,
    CASE WHEN sched.played > 0 THEN sched.adj_ties
         ELSE greatest(coalesce(rec.ties, 0)   - (h.oos_tied)::int, 0) END AS ties
) adj;

COMMENT ON VIEW out_of_state_adjusted IS
  'One row per (season, Kentucky team, out-of-state opponent): the opponent''s '
  'record with that Kentucky team''s game removed, which is what RPI needs. '
  'games = 0 means there is no winning percentage, not one of .500.';
