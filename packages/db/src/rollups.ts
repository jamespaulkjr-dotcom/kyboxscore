import { sql } from "./client.ts";

/**
 * Rebuilds the read model for one team season.
 *
 * stat_line / stat_value are the write model. player_season_stat,
 * team_season_stat and team_season_record are what team pages and
 * leaderboards actually read, and none of them maintain themselves - a
 * committed import lands correctly and stays invisible until this runs.
 *
 * Scoped to one team season and fully recomputed rather than incremented, so
 * it is idempotent and a re-import or a correction converges instead of
 * drifting. Cheap at this size: one team's season is a few hundred rows.
 */
type Executor = typeof sql;

export async function refreshTeamSeasonRollups(
  teamSeasonId: number,
  executor: Executor = sql
) {
  const db = executor;

  // ---- per player ----
  await db`
    DELETE FROM player_season_stat
    WHERE player_season_id IN (
      SELECT id FROM player_season WHERE team_season_id = ${teamSeasonId}
    )`;

  await db`
    INSERT INTO player_season_stat
      (player_season_id, stat_definition_id, value, games_played,
       sport_season_id, alignment_id)
    SELECT ps.id, sd.id,
           -- Honour how each stat aggregates over a season. Derived stats are
           -- computed from other keys and are never stored.
           CASE sd.season_aggregation
             WHEN 'sum' THEN sum(sv.value)
             WHEN 'max' THEN max(sv.value)
             WHEN 'min' THEN min(sv.value)
             WHEN 'avg' THEN avg(sv.value)
           END,
           count(DISTINCT sl.game_id),
           ts.sport_season_id, ts.alignment_id
    FROM player_season ps
    JOIN team_season ts ON ts.id = ps.team_season_id
    JOIN stat_line sl   ON sl.player_id = ps.player_id AND NOT sl.did_not_play
    JOIN game g         ON g.id = sl.game_id AND g.sport_season_id = ts.sport_season_id
    JOIN stat_value sv  ON sv.stat_line_id = sl.id
    JOIN stat_definition sd ON sd.id = sv.stat_definition_id AND NOT sd.is_derived
    WHERE ps.team_season_id = ${teamSeasonId}
    GROUP BY ps.id, sd.id, sd.season_aggregation, ts.sport_season_id, ts.alignment_id`;

  // ---- per team ----
  await db`
    DELETE FROM team_season_stat WHERE team_season_id = ${teamSeasonId}`;

  await db`
    INSERT INTO team_season_stat
      (team_season_id, stat_definition_id, value, games_played)
    SELECT ts.id, sd.id,
           CASE sd.season_aggregation
             WHEN 'sum' THEN sum(sv.value)
             WHEN 'max' THEN max(sv.value)
             WHEN 'min' THEN min(sv.value)
             WHEN 'avg' THEN avg(sv.value)
           END,
           count(DISTINCT sl.game_id)
    FROM team_season ts
    JOIN game_participant gp ON gp.team_id = ts.team_id
    JOIN game g  ON g.id = gp.game_id AND g.sport_season_id = ts.sport_season_id
    JOIN stat_line sl ON sl.game_participant_id = gp.id AND NOT sl.did_not_play
    JOIN stat_value sv ON sv.stat_line_id = sl.id
    JOIN stat_definition sd ON sd.id = sv.stat_definition_id AND NOT sd.is_derived
    WHERE ts.id = ${teamSeasonId}
    GROUP BY ts.id, sd.id, sd.season_aggregation`;

  // ---- win/loss record ----
  // Only final games with both scores count. A game missing a score is not a
  // tie, it is unknown, and counting it either way would be a lie.
  await db`
    INSERT INTO team_season_record
      (team_season_id, wins, losses, ties, district_wins, district_losses,
       preseason_wins, preseason_losses, computed_at)
    SELECT ts.id,
           -- The official record counts regular season games only. A game
           -- played before the season opened is real but counts for nothing.
           count(*) FILTER (WHERE mine.score > opp.score AND counts),
           count(*) FILTER (WHERE mine.score < opp.score AND counts),
           count(*) FILTER (WHERE mine.score = opp.score AND counts),
           count(*) FILTER (WHERE mine.score > opp.score AND counts AND same_district),
           count(*) FILTER (WHERE mine.score < opp.score AND counts AND same_district),
           count(*) FILTER (WHERE mine.score > opp.score AND NOT counts),
           count(*) FILTER (WHERE mine.score < opp.score AND NOT counts),
           now()
    FROM team_season ts
    JOIN game_participant mine ON mine.team_id = ts.team_id
    JOIN game g   ON g.id = mine.game_id AND g.sport_season_id = ts.sport_season_id
    JOIN game_participant opp ON opp.game_id = g.id AND opp.id <> mine.id
    LEFT JOIN team_season opp_ts
           ON opp_ts.team_id = opp.team_id
          AND opp_ts.sport_season_id = ts.sport_season_id
    CROSS JOIN LATERAL (
      SELECT ts.alignment_id IS NOT NULL
         AND ts.alignment_id = opp_ts.alignment_id AS same_district,
             g.stage = 'regular_season' AS counts
    ) d
    WHERE ts.id = ${teamSeasonId}
      AND g.status = 'final'
      AND mine.score IS NOT NULL
      AND opp.score IS NOT NULL
      -- Scrimmages are excluded entirely: they have no record of any kind.
      -- Preseason games are kept so they can be counted separately.
      AND g.stage IN ('regular_season', 'preseason')
    GROUP BY ts.id
    ON CONFLICT (team_season_id) DO UPDATE
      SET wins = EXCLUDED.wins,
          losses = EXCLUDED.losses,
          ties = EXCLUDED.ties,
          district_wins = EXCLUDED.district_wins,
          district_losses = EXCLUDED.district_losses,
          preseason_wins = EXCLUDED.preseason_wins,
          preseason_losses = EXCLUDED.preseason_losses,
          computed_at = now()`;
}

/**
 * Rebuilds every team season in one sport season.
 *
 * Records are derived, not entered, so after a bulk import of schedules or a
 * change of alignment they have to be recomputed wholesale. Cheap at this
 * size and idempotent, so it is safe to run whenever something feels stale.
 */
export async function refreshSportSeasonRollups(sportSeasonId: number) {
  const seasons = await sql<{ id: number }[]>`
    SELECT id::int FROM team_season WHERE sport_season_id = ${sportSeasonId}`;
  for (const s of seasons) await refreshTeamSeasonRollups(s.id);
  return seasons.length;
}
