import {
  DEFAULT_CONFIG,
  computeBoth,
  type Game,
  type RpiConfig,
  type RpiResult,
  type TeamInput,
} from "@kyboxscore/rpi";
import { sql } from "./client.ts";

/**
 * Running the RPI engine against real data and persisting the arithmetic.
 *
 * The engine itself is pure and stays that way - this module is the seam
 * between it and the database. Every stored value keeps the inputs that
 * produced it, because the whole point is being able to show a disputing coach
 * the numbers rather than asserting a ranking at them.
 */

export const FORMULA_VERSION = "khsaa-2026.1";

type GameRow = {
  teamId: number;
  teamClass: number | null;
  gameId: number;
  opponentId: number;
  homeScore: number | null;
  awayScore: number | null;
  isHome: boolean;
  opponentAssumedFiveHundred: boolean;
  opponentClass: number | null;
  opponentExternalWp: number | null;
};

/**
 * Every team in the season with its regular-season games through a date.
 *
 * Only `final` regular-season games count, per the KHSAA rules. A final game
 * with no score is still loaded, flagged, and counted as a tie: a tie is the
 * neutral 0.5, which distorts the least, and the team is suppressed from
 * publication anyway. Dropping it instead would hide the data gap.
 */
export async function loadTeamInputs(
  sportSeasonId: number,
  throughDate: string
): Promise<TeamInput[]> {
  const rows = await sql<GameRow[]>`
    WITH seasons AS (
      SELECT ts.id, ts.team_id, cls.ordinal AS team_class
      FROM team_season ts
      LEFT JOIN alignment a   ON a.id = ts.alignment_id
      LEFT JOIN alignment cls ON cls.id = a.parent_id AND cls.kind = 'classification'
      WHERE ts.sport_season_id = ${sportSeasonId}
    )
    SELECT s.team_id::int   AS "teamId",
           s.team_class::int AS "teamClass",
           g.id::int        AS "gameId",
           opp.team_id::int AS "opponentId",
           mine.score::int  AS "homeScore",
           opp.score::int   AS "awayScore",
           (mine.role = 'home') AS "isHome",
           -- Out of state teams and in-state home school teams are both pinned
           -- to a flat .500 under the official formula.
           (opp_school.state <> 'KY' OR opp_school.is_home_school)
             AS "opponentAssumedFiveHundred",
           opp_cls.ordinal::int AS "opponentClass",
           -- Shadow RPI needs the opponent's real record. Stored as W/L/T,
           -- so the percentage is derived here rather than assumed to exist.
           CASE WHEN (oos.wins + oos.losses + oos.ties) > 0
                THEN (oos.wins + 0.5 * oos.ties)::float8
                     / (oos.wins + oos.losses + oos.ties)
           END AS "opponentExternalWp"
    FROM seasons s
    JOIN game_participant mine ON mine.team_id = s.team_id
    JOIN game g   ON g.id = mine.game_id AND g.sport_season_id = ${sportSeasonId}
    JOIN game_participant opp ON opp.game_id = g.id AND opp.id <> mine.id
    JOIN team opp_team     ON opp_team.id = opp.team_id
    JOIN school opp_school ON opp_school.id = opp_team.school_id
    LEFT JOIN team_season opp_ts
           ON opp_ts.team_id = opp.team_id AND opp_ts.sport_season_id = ${sportSeasonId}
    LEFT JOIN alignment opp_a   ON opp_a.id = opp_ts.alignment_id
    LEFT JOIN alignment opp_cls ON opp_cls.id = opp_a.parent_id
                               AND opp_cls.kind = 'classification'
    LEFT JOIN out_of_state_record oos
           ON oos.team_id = opp.team_id
          AND oos.sport_season_id = ${sportSeasonId}
    WHERE g.status = 'final'
      AND g.stage = 'regular_season'
      AND g.local_date <= ${throughDate}::date`;

  const byTeam = new Map<number, TeamInput>();
  const externalWp = new Map<number, number>();

  for (const r of rows) {
    if (!byTeam.has(r.teamId)) {
      byTeam.set(r.teamId, { teamId: r.teamId, teamClass: r.teamClass, games: [] });
    }
    if (r.opponentExternalWp !== null) {
      externalWp.set(r.opponentId, r.opponentExternalWp);
    }

    const missingScore = r.homeScore === null || r.awayScore === null;
    const outcome: Game["outcome"] = missingScore
      ? "tie"
      : r.homeScore! > r.awayScore!
        ? "win"
        : r.homeScore! < r.awayScore!
          ? "loss"
          : "tie";

    byTeam.get(r.teamId)!.games.push({
      gameId: r.gameId,
      opponentId: r.opponentId,
      outcome,
      isHome: r.isHome,
      opponentAssumedFiveHundred: r.opponentAssumedFiveHundred,
      opponentClass: r.opponentClass,
      missingScore,
    });
  }

  // Real out-of-state records, used only by Shadow RPI.
  for (const [teamId, wp] of externalWp) {
    const t = byTeam.get(teamId);
    if (t) t.externalWinPct = wp;
  }

  return [...byTeam.values()];
}

async function persistRun(
  sportSeasonId: number,
  variant: "official" | "shadow",
  config: RpiConfig,
  throughDate: string,
  results: RpiResult[]
): Promise<number> {
  return sql.begin(async (tx) => {
    const [run] = await tx<{ id: number }[]>`
      INSERT INTO rpi_run
        (sport_season_id, variant, formula_version, config, through_date)
      VALUES (${sportSeasonId}, ${variant}::rpi_variant, ${FORMULA_VERSION},
              ${sql.json(config as never)}, ${throughDate}::date)
      RETURNING id::int`;

    if (results.length > 0) {
      await tx`
        INSERT INTO rpi_result ${tx(
          results.map((r) => {
            // The columns store wp/owp/oowp at 6 decimals and the class factor
            // at 4. If the rating were stored as the engine computed it, from
            // unrounded values, it would not reproduce from the numbers a coach
            // is shown - off by ~3e-5, which is enough to make the arithmetic
            // look wrong on a page. So the published rating is computed FROM
            // the published components. "Every stored RPI value must be
            // reproducible" is only true if it is derived this way.
            const wp = Number(r.wp.toFixed(6));
            const owp = Number(r.owp.toFixed(6));
            const oowp = Number(r.oowp.toFixed(6));
            const cf = Number(r.classFactor.toFixed(4));
            const rpi =
              (wp * config.weights.wp +
                owp * config.weights.owp +
                oowp * config.weights.oowp) *
              cf;
            return {
            rpi_run_id: run.id,
            team_id: r.teamId,
            wins: r.wins,
            losses: r.losses,
            ties: r.ties,
            wp: wp.toFixed(6),
            owp: owp.toFixed(6),
            oowp: oowp.toFixed(6),
            class_factor: cf.toFixed(4),
            rpi: rpi.toFixed(6),
            is_published: r.published,
            suppressed_reason: r.published
              ? null
              : r.suppressedReason === "no_games"
                ? "insufficient_games"
                : "missing_scores",
            };
          }),
          "rpi_run_id", "team_id", "wins", "losses", "ties", "wp", "owp",
          "oowp", "class_factor", "rpi", "is_published", "suppressed_reason"
        )}`;

      const inputs = results.flatMap((r) =>
        r.inputs.map((i) => ({
          rpi_run_id: run.id,
          team_id: r.teamId,
          game_id: i.gameId,
          opponent_team_id: i.opponentId,
          opponent_is_in_state: i.appliedWpReason !== "flat_500_assumed",
          opponent_actual_wp:
            i.opponentActualWp === null ? null : i.opponentActualWp.toFixed(6),
          opponent_applied_wp: i.opponentAppliedWp.toFixed(6),
          applied_wp_reason: i.appliedWpReason,
          result_value: i.resultValue.toFixed(3),
          class_delta: i.classDelta,
        }))
      );
      // Chunked: a full season across 200 teams is tens of thousands of rows
      // and a single statement would exceed the parameter limit.
      for (let i = 0; i < inputs.length; i += 500) {
        const chunk = inputs.slice(i, i + 500);
        await tx`
          INSERT INTO rpi_input ${tx(
            chunk,
            "rpi_run_id", "team_id", "game_id", "opponent_team_id",
            "opponent_is_in_state", "opponent_actual_wp", "opponent_applied_wp",
            "applied_wp_reason", "result_value", "class_delta"
          )}`;
      }
    }

    // Ranks: overall, then within classification and within region.
    //
    // Only published Kentucky teams are ranked. Out-of-state opponents are
    // computed - their winning percentage feeds everyone else's OWP - but they
    // are opponents, not members, and ranking them in Kentucky standings would
    // be a category error.
    await tx`
      UPDATE rpi_result r SET state_rank = s.rn
      FROM (
        SELECT rr.team_id,
               row_number() OVER (ORDER BY rr.rpi DESC, rr.team_id) AS rn
        FROM rpi_result rr
        JOIN team t    ON t.id = rr.team_id
        JOIN school sc ON sc.id = t.school_id
        WHERE rr.rpi_run_id = ${run.id} AND rr.is_published
          AND sc.state = 'KY' AND NOT sc.is_home_school
      ) s
      WHERE r.rpi_run_id = ${run.id} AND r.team_id = s.team_id`;

    for (const [column, kind] of [
      ["class_rank", "classification"],
      ["region_rank", "region"],
    ] as const) {
      await tx`
        UPDATE rpi_result r
        SET ${tx(column)} = s.rn
        FROM (
          SELECT rr.team_id,
                 row_number() OVER (PARTITION BY parent.id ORDER BY rr.rpi DESC, rr.team_id) AS rn
          FROM rpi_result rr
          JOIN team_season ts
            ON ts.team_id = rr.team_id AND ts.sport_season_id = ${sportSeasonId}
          JOIN alignment a      ON a.id = ts.alignment_id
          JOIN alignment parent ON parent.id = a.parent_id AND parent.kind = ${kind}
          JOIN team t    ON t.id = rr.team_id
          JOIN school sc ON sc.id = t.school_id
          WHERE rr.rpi_run_id = ${run.id} AND rr.is_published
            AND sc.state = 'KY' AND NOT sc.is_home_school
        ) s
        WHERE r.rpi_run_id = ${run.id} AND r.team_id = s.team_id`;
    }

    return run.id;
  });
}

export type RpiRunSummary = {
  officialRunId: number;
  shadowRunId: number;
  teams: number;
  published: number;
  suppressed: number;
  throughDate: string;
};

/**
 * Computes and stores both variants for one sport season.
 *
 * Official and shadow are separate runs rather than columns on one row: they
 * are different formulas, and a coach comparing them is comparing two answers,
 * not one answer with an annotation.
 */
export async function runRpi(
  sportSeasonId: number,
  options: { throughDate?: string; config?: Partial<RpiConfig> } = {}
): Promise<RpiRunSummary> {
  const [season] = await sql<{ endsOn: string; profile: string }[]>`
    SELECT least(ss.regular_season_ends_on, CURRENT_DATE)::text AS "endsOn",
           sp.rpi_profile AS profile
    FROM sport_season ss
    JOIN sport sp ON sp.id = ss.sport_id
    WHERE ss.id = ${sportSeasonId}`;
  if (!season) throw new Error(`no sport_season ${sportSeasonId}`);

  const throughDate = options.throughDate ?? season.endsOn;
  const config: RpiConfig = {
    ...DEFAULT_CONFIG,
    sportProfile: season.profile === "football" ? "football" : "standard",
    ...options.config,
  };

  const teams = await loadTeamInputs(sportSeasonId, throughDate);
  const { official, shadow } = computeBoth(teams, config);

  const officialRunId = await persistRun(
    sportSeasonId, "official", { ...config, shadow: false }, throughDate, official
  );
  const shadowRunId = await persistRun(
    sportSeasonId, "shadow", { ...config, shadow: true }, throughDate, shadow
  );

  return {
    officialRunId,
    shadowRunId,
    teams: teams.length,
    published: official.filter((r) => r.published).length,
    suppressed: official.filter((r) => !r.published).length,
    throughDate,
  };
}

/* --------------------------------------------------------- reading it */

export type RpiStanding = {
  teamId: number;
  schoolName: string;
  schoolSlug: string;
  wins: number;
  losses: number;
  ties: number;
  wp: number;
  owp: number;
  oowp: number;
  classFactor: number;
  rpi: number;
  stateRank: number | null;
  classRank: number | null;
  className: string | null;
  shadowRpi: number | null;
  delta: number | null;
};

/**
 * The published table, with the shadow number beside it. The delta is what
 * coaches near the state line have been asking about for years.
 */
export async function getRpiStandings(sportSlug: string, urlYear?: number) {
  return sql<RpiStanding[]>`
    WITH ss AS (
      SELECT ss.id FROM sport_season ss
      JOIN sport sp ON sp.id = ss.sport_id
      WHERE sp.slug = ${sportSlug}
        AND ${urlYear ? sql`ss.url_year = ${urlYear}` : sql`ss.is_current`}
      LIMIT 1
    ),
    latest AS (
      SELECT variant, max(id) AS run_id
      FROM rpi_run WHERE sport_season_id = (SELECT id FROM ss)
      GROUP BY variant
    )
    SELECT r.team_id::int AS "teamId", sc.name AS "schoolName",
           sc.slug::text AS "schoolSlug",
           r.wins::int, r.losses::int, r.ties::int,
           r.wp::float8, r.owp::float8, r.oowp::float8,
           r.class_factor::float8 AS "classFactor",
           r.rpi::float8, r.state_rank::int AS "stateRank",
           r.class_rank::int AS "classRank",
           parent.name AS "className",
           sh.rpi::float8 AS "shadowRpi",
           (sh.rpi - r.rpi)::float8 AS delta
    FROM rpi_result r
    JOIN team t   ON t.id = r.team_id
    JOIN school sc ON sc.id = t.school_id
    LEFT JOIN team_season ts
           ON ts.team_id = r.team_id AND ts.sport_season_id = (SELECT id FROM ss)
    LEFT JOIN alignment a      ON a.id = ts.alignment_id
    LEFT JOIN alignment parent ON parent.id = a.parent_id
    LEFT JOIN rpi_result sh
           ON sh.team_id = r.team_id
          AND sh.rpi_run_id = (SELECT run_id FROM latest WHERE variant = 'shadow')
    WHERE r.rpi_run_id = (SELECT run_id FROM latest WHERE variant = 'official')
      AND r.is_published
      -- Out-of-state opponents are computed but never ranked; see persistRun.
      AND sc.state = 'KY'
      AND NOT sc.is_home_school
    ORDER BY r.rpi DESC`;
}

export async function getLatestRpiRun(sportSlug: string) {
  const rows = await sql<{ computedAt: string; throughDate: string }[]>`
    SELECT rr.computed_at::text AS "computedAt", rr.through_date::text AS "throughDate"
    FROM rpi_run rr
    JOIN sport_season ss ON ss.id = rr.sport_season_id AND ss.is_current
    JOIN sport sp ON sp.id = ss.sport_id
    WHERE sp.slug = ${sportSlug} AND rr.variant = 'official'
    ORDER BY rr.id DESC LIMIT 1`;
  return rows[0] ?? null;
}
