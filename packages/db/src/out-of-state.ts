import { sql } from "./client.ts";
import { matchSchoolNames } from "./schedule-import.ts";

/**
 * Out-of-state opponents: their schedules, their raw records, and the adjusted
 * record each Kentucky team is entitled to see.
 *
 * The distinction this module exists to keep straight:
 *
 * - **raw** is a fact about the opponent: their overall record.
 * - **adjusted** is a question asked by one Kentucky team: your record with our
 *   game removed. RPI removes only the game against the team being rated, so
 *   there is one adjusted record per matchup, not one per opponent. Jellico
 *   played Lynn Camp and Jackson County; the two of them are owed different
 *   numbers, and storing one would be wrong even on a week when they agree.
 */

export type OutOfStateGameInput = {
  teamId: number;
  opponentTeamId: number | null;
  opponentName: string;
  opponentState: string | null;
  localDate: string;
  homeAway: "home" | "away" | "neutral";
  status: string;
  result: "W" | "L" | "T" | null;
  teamScore: number | null;
  opponentScore: number | null;
  isKentuckyOpponent: boolean;
  kentuckyGameId: number | null;
  gameKey: string | null;
};

/** Idempotent: the natural key is the team, the date and who they played. */
export async function upsertOutOfStateGames(
  sportSeasonId: number,
  games: OutOfStateGameInput[],
  sourceName: string,
  sourceUrl: string | null,
  retrievedAsOf: string
): Promise<{ written: number }> {
  let written = 0;
  for (const g of games) {
    await sql`
      INSERT INTO out_of_state_game
        (sport_season_id, team_id, opponent_team_id, opponent_name,
         opponent_state, local_date, home_away, status, result, team_score,
         opponent_score, is_kentucky_opponent, kentucky_game_id, game_key,
         source_name, source_url, retrieved_as_of, data_source_id)
      SELECT ${sportSeasonId}, ${g.teamId}, ${g.opponentTeamId},
             ${g.opponentName}, ${g.opponentState}, ${g.localDate}::date,
             ${g.homeAway}, ${g.status}, ${g.result}, ${g.teamScore},
             ${g.opponentScore}, ${g.isKentuckyOpponent}, ${g.kentuckyGameId},
             ${g.gameKey}, ${sourceName}, ${sourceUrl},
             ${retrievedAsOf}::date, ds.id
      FROM (SELECT id FROM data_source WHERE kind = 'staff_entry'
             ORDER BY id LIMIT 1) ds
      ON CONFLICT (sport_season_id, team_id, local_date,
                   coalesce(opponent_team_id::text, lower(opponent_name)))
      DO UPDATE SET
        status = EXCLUDED.status,
        result = EXCLUDED.result,
        team_score = EXCLUDED.team_score,
        opponent_score = EXCLUDED.opponent_score,
        home_away = EXCLUDED.home_away,
        opponent_state = EXCLUDED.opponent_state,
        kentucky_game_id = coalesce(EXCLUDED.kentucky_game_id,
                                    out_of_state_game.kentucky_game_id),
        source_name = EXCLUDED.source_name,
        retrieved_as_of = EXCLUDED.retrieved_as_of`;
    written++;
  }
  return { written };
}

export type AdjustedOpponentWp = {
  kentuckyTeamId: number;
  opponentTeamId: number;
  opponentName: string;
  /** The opponent's overall record, as a fact about them. */
  rawWins: number;
  rawLosses: number;
  rawTies: number;
  /** That record with this Kentucky team's game taken out. */
  adjustedWins: number;
  adjustedLosses: number;
  adjustedTies: number;
  adjustedGames: number;
  /** Null when there are no qualifying games. Never silently 0.5. */
  adjustedWp: number | null;
  fallbackWp: number;
  usedFallback: boolean;
  /** True when the opponent's own schedule was the fuller account. */
  fromSchedule: boolean;
};

/** What RPI uses for an out-of-state opponent, when nothing else is known. */
export const NEUTRAL_FALLBACK_WP = 0.5;

/**
 * The adjusted record every Kentucky team is owed from every out-of-state
 * opponent it played.
 *
 * Derived, never stored. The raw record comes from `out_of_state_record` (or
 * from completed rows in `out_of_state_game` once scores are there), and the
 * one game removed is the head-to-head, found from our own game table.
 *
 * A team with nothing else played comes back with `adjustedWp: null` and
 * `usedFallback: true`. That is not a winning percentage of .500; it is the
 * absence of one, and the two must never be printed as the same thing.
 */
export async function adjustedOpponentWp(
  sportSeasonId: number
): Promise<AdjustedOpponentWp[]> {
  return sql<AdjustedOpponentWp[]>`
    SELECT a.kentucky_team_id::int AS "kentuckyTeamId",
           a.opponent_team_id::int AS "opponentTeamId",
           coalesce(sc.short_name, sc.name) AS "opponentName",
           a.raw_wins::int AS "rawWins",
           a.raw_losses::int AS "rawLosses",
           a.raw_ties::int AS "rawTies",
           a.wins::int AS "adjustedWins",
           a.losses::int AS "adjustedLosses",
           a.ties::int AS "adjustedTies",
           a.games::int AS "adjustedGames",
           CASE WHEN a.games > 0
                THEN ((a.wins + 0.5 * a.ties) / a.games)::float8
           END AS "adjustedWp",
           ${NEUTRAL_FALLBACK_WP}::float8 AS "fallbackWp",
           (a.games = 0) AS "usedFallback",
           a.from_schedule AS "fromSchedule"
    FROM out_of_state_adjusted a
    JOIN team t ON t.id = a.opponent_team_id
    JOIN school sc ON sc.id = t.school_id
    WHERE a.sport_season_id = ${sportSeasonId}
    ORDER BY coalesce(sc.short_name, sc.name), a.kentucky_team_id`;
}
