import { sql } from "./client.ts";
import type {
  BoxScoreRow,
  GameStatus,
  RosterRow,
  ScoreboardGame,
  SportSeason,
  TeamScheduleRow,
} from "./types.ts";

export async function listSports() {
  return sql<{ slug: string; name: string; urlYear: number }[]>`
    SELECT sp.slug, sp.name, ss.url_year::int AS "urlYear"
    FROM sport sp
    JOIN sport_season ss ON ss.sport_id = sp.id AND ss.is_current
    WHERE sp.is_active
    ORDER BY sp.display_order`;
}

export type SportListing = {
  slug: string;
  name: string;
  category: "team" | "individual" | "activity";
  urlYear: number | null;
};

/**
 * Every sport we offer, whether or not it has a season open.
 *
 * listSports() is the navigation query and deliberately returns only sports
 * with a current season, because a nav link to an empty scoreboard is a dead
 * end. This one backs the sports index, where "not open yet" is the useful
 * answer rather than a broken page.
 */
export async function listAllSports() {
  return sql<SportListing[]>`
    SELECT sp.slug, sp.name, sp.category::text AS category,
           ss.url_year::int AS "urlYear"
    FROM sport sp
    LEFT JOIN sport_season ss ON ss.sport_id = sp.id AND ss.is_current
    WHERE sp.is_active
    ORDER BY sp.display_order`;
}

export async function getSportSeason(
  sportSlug: string,
  urlYear?: number
): Promise<SportSeason | null> {
  const rows = await sql<SportSeason[]>`
    SELECT ss.id, sp.id AS "sportId", sp.slug AS "sportSlug", sp.name AS "sportName",
           sp.period_noun AS "periodNoun", sp.regulation_periods::int AS "regulationPeriods",
           ss.url_year::int AS "urlYear", se.label AS "seasonLabel",
           ss.starts_on::text AS "startsOn", ss.ends_on::text AS "endsOn"
    FROM sport_season ss
    JOIN sport sp ON sp.id = ss.sport_id
    JOIN season se ON se.id = ss.season_id
    WHERE sp.slug = ${sportSlug}
      AND ${urlYear ? sql`ss.url_year = ${urlYear}` : sql`ss.is_current`}
    LIMIT 1`;
  return rows[0] ?? null;
}

/**
 * The date to show when none is given. "Today" is the right answer in season
 * and an empty page in July, so fall back to the most recent slate.
 */
export async function resolveSlateDate(
  sportSeasonId: number,
  requested?: string
): Promise<string | null> {
  if (requested) return requested;
  const rows = await sql<{ d: string }[]>`
    SELECT local_date::text AS d FROM game
    WHERE sport_season_id = ${sportSeasonId}
      AND local_date <= CURRENT_DATE
    ORDER BY local_date DESC LIMIT 1`;
  if (rows[0]) return rows[0].d;
  const upcoming = await sql<{ d: string }[]>`
    SELECT local_date::text AS d FROM game
    WHERE sport_season_id = ${sportSeasonId}
    ORDER BY local_date ASC LIMIT 1`;
  return upcoming[0]?.d ?? null;
}

export async function getScoreboard(
  sportSeasonId: number,
  localDate: string,
  groupBy: "district" | "region" | "classification" = "region"
): Promise<ScoreboardGame[]> {
  const rows = await sql<ScoreboardGame[]>`
    WITH sides AS (
      SELECT gp.game_id, gp.role, gp.team_id::int, gp.score::int,
             sc.slug AS school_slug, sc.name AS school_name,
             sc.short_name, sc.mascot, sc.time_zone,
             CASE WHEN ${groupBy} = 'district' THEN grp.name ELSE parent.name END AS group_name
      FROM game_participant gp
      JOIN team t ON t.id = gp.team_id
      JOIN school sc ON sc.id = t.school_id
      LEFT JOIN team_season ts
        ON ts.team_id = gp.team_id AND ts.sport_season_id = ${sportSeasonId}
      LEFT JOIN alignment grp ON grp.id = ts.alignment_id
      LEFT JOIN alignment parent ON parent.id = grp.parent_id
    )
    SELECT g.id::int, g.short_code AS "shortCode", g.local_date::text AS "localDate",
           g.status, g.stage, g.neutral_site AS "neutralSite",
           g.event_name AS "eventName", g.periods_played::int AS "periodsPlayed",
           g.starts_at::text AS "startsAt",
           h.time_zone AS "timeZone",
           coalesce(h.group_name, a.group_name) AS "groupName",
           jsonb_build_object(
             'teamId', h.team_id, 'schoolSlug', h.school_slug,
             'schoolName', h.school_name, 'shortName', h.short_name,
             'mascot', h.mascot, 'score', h.score) AS home,
           jsonb_build_object(
             'teamId', a.team_id, 'schoolSlug', a.school_slug,
             'schoolName', a.school_name, 'shortName', a.short_name,
             'mascot', a.mascot, 'score', a.score) AS away
    FROM game g
    JOIN sides h ON h.game_id = g.id AND h.role = 'home'
    JOIN sides a ON a.game_id = g.id AND a.role = 'away'
    WHERE g.sport_season_id = ${sportSeasonId}
      AND g.local_date = ${localDate}::date
    ORDER BY
      CASE g.status WHEN 'in_progress' THEN 0 WHEN 'final' THEN 1 ELSE 2 END,
      coalesce(h.group_name, a.group_name) NULLS LAST,
      h.school_name`;
  return rows;
}

export async function getSlateDates(sportSeasonId: number) {
  return sql<{ localDate: string; games: number }[]>`
    SELECT local_date::text AS "localDate", count(*)::int AS games
    FROM game WHERE sport_season_id = ${sportSeasonId}
    GROUP BY local_date ORDER BY local_date`;
}

/* ------------------------------------------------------------------ team */

export async function getTeamSeason(
  sportSeasonId: number,
  schoolSlug: string
) {
  const rows = await sql<
    {
      teamSeasonId: number;
      teamId: number;
      schoolName: string;
      schoolSlug: string;
      mascot: string | null;
      city: string | null;
      county: string | null;
      timeZone: string;
      districtName: string | null;
      regionName: string | null;
      wins: number;
      losses: number;
      ties: number;
    }[]
  >`
    SELECT ts.id::int AS "teamSeasonId", t.id::int AS "teamId",
           sc.name AS "schoolName", sc.slug AS "schoolSlug", sc.mascot,
           sc.city, sc.county, sc.time_zone AS "timeZone",
           d.name AS "districtName", r.name AS "regionName",
           coalesce(rec.wins, 0)::int AS wins,
           coalesce(rec.losses, 0)::int AS losses,
           coalesce(rec.ties, 0)::int AS ties
    FROM team_season ts
    JOIN team t ON t.id = ts.team_id
    JOIN school sc ON sc.id = t.school_id
    LEFT JOIN alignment d ON d.id = ts.alignment_id
    LEFT JOIN alignment r ON r.id = d.parent_id
    LEFT JOIN team_season_record rec ON rec.team_season_id = ts.id
    WHERE ts.sport_season_id = ${sportSeasonId} AND sc.slug = ${schoolSlug}
    LIMIT 1`;
  return rows[0] ?? null;
}

export async function getTeamSchedule(
  sportSeasonId: number,
  teamId: number
): Promise<TeamScheduleRow[]> {
  return sql<TeamScheduleRow[]>`
    SELECT g.short_code AS "shortCode", g.local_date::text AS "localDate",
           g.status, me.role = 'home' AS "isHome", g.neutral_site AS "neutralSite",
           osc.name AS "opponentName", osc.slug AS "opponentSlug",
           me.score::int AS "teamScore", opp.score::int AS "opponentScore",
           CASE WHEN me.score IS NULL OR opp.score IS NULL THEN NULL
                WHEN me.score > opp.score THEN 'W'
                WHEN me.score < opp.score THEN 'L' ELSE 'T' END AS result
    FROM game g
    JOIN game_participant me ON me.game_id = g.id AND me.team_id = ${teamId}
    JOIN game_participant opp ON opp.game_id = g.id AND opp.id <> me.id
    JOIN team ot ON ot.id = opp.team_id
    JOIN school osc ON osc.id = ot.school_id
    WHERE g.sport_season_id = ${sportSeasonId}
    ORDER BY g.local_date`;
}

export async function getRoster(teamSeasonId: number): Promise<RosterRow[]> {
  return sql<RosterRow[]>`
    SELECT p.id::int AS "playerId", p.slug,
           p.first_name || ' ' || p.last_name AS name,
           ps.jersey, ps.grade::int, ps.positions
    FROM player_season ps
    JOIN player p ON p.id = ps.player_id
    WHERE ps.team_season_id = ${teamSeasonId}
    ORDER BY nullif(regexp_replace(coalesce(ps.jersey,''), '\D', '', 'g'), '')::int
             NULLS LAST, p.last_name`;
}

export async function getTeamSeasonStats(teamSeasonId: number) {
  return sql<
    {
      playerId: number;
      slug: string;
      name: string;
      jersey: string | null;
      gamesPlayed: number;
      stats: Record<string, number>;
    }[]
  >`
    SELECT p.id::int AS "playerId", p.slug,
           p.first_name || ' ' || p.last_name AS name, ps.jersey,
           max(pss.games_played)::int AS "gamesPlayed",
           jsonb_object_agg(sd.key, pss.value::float8) AS stats
    FROM player_season_stat pss
    JOIN player_season ps ON ps.id = pss.player_season_id
    JOIN player p ON p.id = ps.player_id
    JOIN stat_definition sd ON sd.id = pss.stat_definition_id
    WHERE ps.team_season_id = ${teamSeasonId}
    GROUP BY p.id, p.slug, p.first_name, p.last_name, ps.jersey
    ORDER BY max(pss.value) FILTER (WHERE sd.key = 'pts') DESC NULLS LAST`;
}

/* ------------------------------------------------------------------ game */

export async function getGameByCode(shortCode: string) {
  const rows = await sql<
    {
      id: number;
      shortCode: string;
      localDate: string;
      status: GameStatus;
      stage: string;
      neutralSite: boolean;
      eventName: string | null;
      periodsPlayed: number | null;
      sportSlug: string;
      sportName: string;
      periodNoun: string;
      regulationPeriods: number;
      urlYear: number;
      venueName: string | null;
    }[]
  >`
    SELECT g.id::int, g.short_code AS "shortCode", g.local_date::text AS "localDate",
           g.status, g.stage, g.neutral_site AS "neutralSite",
           g.event_name AS "eventName", g.periods_played::int AS "periodsPlayed",
           sp.slug AS "sportSlug", sp.name AS "sportName",
           sp.period_noun AS "periodNoun", sp.regulation_periods::int AS "regulationPeriods",
           ss.url_year::int AS "urlYear", v.name AS "venueName"
    FROM game g
    JOIN sport_season ss ON ss.id = g.sport_season_id
    JOIN sport sp ON sp.id = ss.sport_id
    LEFT JOIN venue v ON v.id = g.venue_id
    WHERE g.short_code = ${shortCode}
    LIMIT 1`;
  return rows[0] ?? null;
}

export async function getGameSides(gameId: number) {
  return sql<
    {
      participantId: number;
      role: "home" | "away";
      teamId: number;
      schoolSlug: string;
      schoolName: string;
      shortName: string | null;
      score: number | null;
      periods: number[];
    }[]
  >`
    SELECT gp.id::int AS "participantId", gp.role, gp.team_id::int AS "teamId",
           sc.slug AS "schoolSlug", sc.name AS "schoolName", sc.short_name AS "shortName",
           gp.score::int,
           coalesce(
             (SELECT array_agg(ps.score::int ORDER BY ps.period_number)
              FROM game_period_score ps WHERE ps.game_participant_id = gp.id),
             '{}') AS periods
    FROM game_participant gp
    JOIN team t ON t.id = gp.team_id
    JOIN school sc ON sc.id = t.school_id
    WHERE gp.game_id = ${gameId}
    ORDER BY gp.role DESC`;
}

export async function getBoxScore(
  participantId: number
): Promise<BoxScoreRow[]> {
  return sql<BoxScoreRow[]>`
    SELECT p.id::int AS "playerId", p.slug,
           p.first_name || ' ' || p.last_name AS name,
           sl.jersey, sl.started,
           jsonb_object_agg(sd.key, sv.value::float8) AS stats
    FROM stat_line sl
    JOIN player p ON p.id = sl.player_id
    JOIN stat_value sv ON sv.stat_line_id = sl.id
    JOIN stat_definition sd ON sd.id = sv.stat_definition_id
    WHERE sl.game_participant_id = ${participantId}
    GROUP BY p.id, p.slug, p.first_name, p.last_name, sl.jersey, sl.started
    ORDER BY sl.started DESC NULLS LAST,
             max(sv.value) FILTER (WHERE sd.key = 'pts') DESC NULLS LAST`;
}

export async function getStatColumns(sportSlug: string, category?: string) {
  return sql<
    { key: string; abbrev: string; name: string; isDerived: boolean }[]
  >`
    SELECT sd.key, sd.abbrev, sd.name, sd.is_derived AS "isDerived"
    FROM stat_definition sd
    JOIN sport sp ON sp.id = sd.sport_id
    WHERE sp.slug = ${sportSlug} AND sd.scope = 'player'
      ${category ? sql`AND sd.category = ${category}` : sql``}
    ORDER BY sd.display_order`;
}

/* ---------------------------------------------------------- teams / stats */

export async function listTeams(sportSeasonId: number) {
  return sql<
    {
      schoolSlug: string;
      schoolName: string;
      mascot: string | null;
      city: string | null;
      regionName: string | null;
      wins: number;
      losses: number;
    }[]
  >`
    SELECT sc.slug AS "schoolSlug", sc.name AS "schoolName", sc.mascot, sc.city,
           r.name AS "regionName",
           coalesce(rec.wins, 0)::int AS wins, coalesce(rec.losses, 0)::int AS losses
    FROM team_season ts
    JOIN team t ON t.id = ts.team_id
    JOIN school sc ON sc.id = t.school_id
    LEFT JOIN alignment d ON d.id = ts.alignment_id
    LEFT JOIN alignment r ON r.id = d.parent_id
    LEFT JOIN team_season_record rec ON rec.team_season_id = ts.id
    WHERE ts.sport_season_id = ${sportSeasonId}
    ORDER BY sc.name`;
}

export async function listLeaderboardStats(sportSlug: string) {
  return sql<{ key: string; name: string; abbrev: string }[]>`
    SELECT sd.key, sd.name, sd.abbrev
    FROM stat_definition sd
    JOIN sport sp ON sp.id = sd.sport_id
    WHERE sp.slug = ${sportSlug} AND sd.leaderboard_eligible
    ORDER BY sd.display_order`;
}

/**
 * Statewide leaderboard for one stat. `qualifier` on the definition gates
 * entry so a 1-for-1 shooter cannot top a percentage board; the minimum is
 * applied here rather than baked into the rollup, so changing it is a config
 * change and not a recompute.
 */
export async function getLeaderboard(
  sportSeasonId: number,
  statKey: string,
  limit = 25
) {
  return sql<
    {
      rank: number;
      playerName: string;
      playerSlug: string;
      schoolName: string;
      schoolSlug: string;
      value: number;
      gamesPlayed: number;
      perGame: number;
    }[]
  >`
    WITH def AS (
      SELECT sd.id, sd.key, sd.qualifier, sd.season_aggregation, sd.is_derived
      FROM stat_definition sd
      JOIN sport_season ss ON ss.id = ${sportSeasonId}
      WHERE sd.sport_id = ss.sport_id AND sd.key = ${statKey}
    ),
    eligible AS (
      SELECT pss.player_season_id, pss.value::float8 AS value,
             pss.games_played::int AS games_played
      FROM player_season_stat pss, def
      WHERE pss.stat_definition_id = def.id
        AND pss.sport_season_id = ${sportSeasonId}
        AND pss.games_played >= coalesce((def.qualifier ->> 'min_games')::int, 0)
        AND (
          def.qualifier -> 'min' IS NULL
          OR EXISTS (
            SELECT 1
            FROM player_season_stat gate
            JOIN stat_definition gsd ON gsd.id = gate.stat_definition_id
            WHERE gate.player_season_id = pss.player_season_id
              AND gsd.key = (def.qualifier -> 'min' ->> 'key')
              AND gate.value >= (def.qualifier -> 'min' ->> 'per_game')::numeric
                                * pss.games_played
          )
        )
    )
    SELECT (row_number() OVER (ORDER BY e.value DESC))::int AS rank,
           p.first_name || ' ' || p.last_name AS "playerName",
           p.slug AS "playerSlug",
           sc.name AS "schoolName", sc.slug AS "schoolSlug",
           e.value, e.games_played AS "gamesPlayed",
           round((e.value / nullif(e.games_played, 0))::numeric, 1)::float8 AS "perGame"
    FROM eligible e
    JOIN player_season ps ON ps.id = e.player_season_id
    JOIN player p ON p.id = ps.player_id
    JOIN team_season ts ON ts.id = ps.team_season_id
    JOIN team t ON t.id = ts.team_id
    JOIN school sc ON sc.id = t.school_id
    ORDER BY e.value DESC
    LIMIT ${limit}`;
}

export async function searchAll(query: string, limit = 20) {
  const q = query.trim();
  if (q.length < 2) return [];
  return sql<
    { entityType: string; title: string; subtitle: string; slug: string; score: number }[]
  >`
    SELECT entity_type AS "entityType", title, subtitle, slug,
           similarity(title, ${q})::float8 AS score
    FROM search_document
    WHERE title % ${q} OR title ILIKE ${"%" + q + "%"}
    ORDER BY similarity(title, ${q}) DESC, title
    LIMIT ${limit}`;
}

/**
 * Which sport `/` should land on. Prefer one whose season is running right
 * now, then the one starting soonest, then display order. In August this
 * means football rather than an empty basketball scoreboard.
 */
export async function getDefaultSportSlug(): Promise<string> {
  const rows = await sql<{ slug: string }[]>`
    SELECT sp.slug
    FROM sport_season ss
    JOIN sport sp ON sp.id = ss.sport_id
    WHERE sp.is_active AND ss.is_current
    ORDER BY
      (CURRENT_DATE BETWEEN ss.starts_on AND ss.ends_on) DESC,
      CASE WHEN ss.starts_on >= CURRENT_DATE THEN ss.starts_on - CURRENT_DATE
           ELSE CURRENT_DATE - ss.ends_on END,
      sp.display_order
    LIMIT 1`;
  return rows[0]?.slug ?? "basketball";
}
