import { sql } from "./client.ts";

/**
 * Account and team-grant administration.
 *
 * A grant is what lets a coach import for a team, so this is the gate on every
 * statistic that enters the system. Every grant records who issued it.
 */

export type AdminUserRow = {
  id: number;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  grantCount: number;
  lastLoginAt: string | null;
  hasPassword: boolean;
};

export async function listUsers(query?: string) {
  const q = (query ?? "").trim();
  return sql<AdminUserRow[]>`
    SELECT u.id::int, u.email, u.name, u.role::text AS role,
           u.is_active AS "isActive",
           u.last_login_at::text AS "lastLoginAt",
           (u.password_hash IS NOT NULL) AS "hasPassword",
           count(g.team_id)::int AS "grantCount"
    FROM app_user u
    LEFT JOIN user_team_grant g ON g.user_id = u.id
    ${q ? sql`WHERE u.name ILIKE ${"%" + q + "%"} OR u.email ILIKE ${"%" + q + "%"}` : sql``}
    GROUP BY u.id
    ORDER BY u.is_active DESC, u.name`;
}

export async function getUser(userId: number) {
  const rows = await sql<AdminUserRow[]>`
    SELECT u.id::int, u.email, u.name, u.role::text AS role,
           u.is_active AS "isActive",
           u.last_login_at::text AS "lastLoginAt",
           (u.password_hash IS NOT NULL) AS "hasPassword",
           0 AS "grantCount"
    FROM app_user u WHERE u.id = ${userId}`;
  return rows[0] ?? null;
}

export type GrantRow = {
  teamId: number;
  schoolName: string;
  sportName: string;
  gender: string;
  level: string;
  grantedAt: string;
  grantedByName: string | null;
};

export async function listGrants(userId: number) {
  return sql<GrantRow[]>`
    SELECT t.id::int AS "teamId", sc.name AS "schoolName", sp.name AS "sportName",
           t.gender::text AS gender, t.level::text AS level,
           g.granted_at::text AS "grantedAt",
           granter.name AS "grantedByName"
    FROM user_team_grant g
    JOIN team t    ON t.id = g.team_id
    JOIN school sc ON sc.id = t.school_id
    JOIN sport sp  ON sp.id = t.sport_id
    LEFT JOIN app_user granter ON granter.id = g.granted_by_id
    WHERE g.user_id = ${userId}
    ORDER BY sp.display_order, sc.name`;
}

export type TeamOption = {
  teamId: number;
  schoolName: string;
  sportName: string;
  gender: string;
  level: string;
  hasSeason: boolean;
};

/**
 * Teams available to grant, excluding ones the user already holds.
 *
 * `hasSeason` is surfaced rather than filtered on: a team with no current
 * season can still be granted, it just cannot be imported for yet, and hiding
 * it would look like the team is missing.
 */
export async function listGrantableTeams(userId: number, query?: string) {
  const q = (query ?? "").trim();
  return sql<TeamOption[]>`
    SELECT t.id::int AS "teamId", sc.name AS "schoolName", sp.name AS "sportName",
           t.gender::text AS gender, t.level::text AS level,
           EXISTS (
             SELECT 1 FROM team_season ts
             JOIN sport_season ss ON ss.id = ts.sport_season_id AND ss.is_current
             WHERE ts.team_id = t.id
           ) AS "hasSeason"
    FROM team t
    JOIN school sc ON sc.id = t.school_id
    JOIN sport sp  ON sp.id = t.sport_id
    WHERE NOT EXISTS (
            SELECT 1 FROM user_team_grant g
            WHERE g.user_id = ${userId} AND g.team_id = t.id
          )
      ${q ? sql`AND (sc.name ILIKE ${"%" + q + "%"} OR sp.name ILIKE ${"%" + q + "%"})` : sql``}
    ORDER BY sc.name, sp.display_order
    LIMIT 200`;
}

export async function grantTeam(userId: number, teamId: number, grantedById: number) {
  await sql`
    INSERT INTO user_team_grant (user_id, team_id, granted_by_id)
    VALUES (${userId}, ${teamId}, ${grantedById})
    ON CONFLICT (user_id, team_id) DO NOTHING`;
}

/**
 * Revoking access does not touch statistics the coach already committed. The
 * record stays, with its provenance intact; only the ability to add more goes.
 */
export async function revokeTeam(userId: number, teamId: number) {
  await sql`
    DELETE FROM user_team_grant
    WHERE user_id = ${userId} AND team_id = ${teamId}`;
}

export async function countTeams(): Promise<number> {
  const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM team`;
  return row?.n ?? 0;
}

/* ------------------------------------------------------------ teams */

export type AdminTeamRow = {
  teamId: number;
  schoolName: string;
  schoolSlug: string;
  sportName: string;
  sportSlug: string;
  gender: string;
  level: string;
  teamSeasonId: number | null;
  seasonLabel: string | null;
  rosterCount: number;
};

export async function listTeamsAdmin(query?: string) {
  const q = (query ?? "").trim();
  return sql<AdminTeamRow[]>`
    SELECT t.id::int AS "teamId", sc.name AS "schoolName", sc.slug::text AS "schoolSlug",
           sp.name AS "sportName", sp.slug::text AS "sportSlug",
           t.gender::text AS gender, t.level::text AS level,
           ts.id::int AS "teamSeasonId", se.label AS "seasonLabel",
           count(ps.id)::int AS "rosterCount"
    FROM team t
    JOIN school sc ON sc.id = t.school_id
    JOIN sport sp  ON sp.id = t.sport_id
    LEFT JOIN sport_season ss ON ss.sport_id = t.sport_id AND ss.is_current
    LEFT JOIN team_season ts  ON ts.team_id = t.id AND ts.sport_season_id = ss.id
    LEFT JOIN season se       ON se.id = ss.season_id
    LEFT JOIN player_season ps ON ps.team_season_id = ts.id
    ${q ? sql`WHERE sc.name ILIKE ${"%" + q + "%"} OR sp.name ILIKE ${"%" + q + "%"}` : sql``}
    GROUP BY t.id, sc.name, sc.slug, sp.name, sp.slug, sp.display_order,
             t.gender, t.level, ts.id, se.label
    ORDER BY sc.name, sp.display_order
    LIMIT 300`;
}

/**
 * Creating a team also attaches it to the current season when one exists.
 * A team with no season cannot hold a roster or a game, so leaving that to a
 * second step would just produce dead-end teams.
 */
export async function createTeam(
  schoolId: number,
  sportId: number,
  gender: string,
  level: string
): Promise<{ teamId: number; teamSeasonId: number | null }> {
  return sql.begin(async (tx) => {
    const [t] = await tx<{ id: number }[]>`
      INSERT INTO team (school_id, sport_id, gender, level)
      VALUES (${schoolId}, ${sportId}, ${gender}::gender, ${level}::team_level)
      ON CONFLICT (school_id, sport_id, gender, level)
        DO UPDATE SET level = EXCLUDED.level
      RETURNING id::int`;

    const [ss] = await tx<{ id: number }[]>`
      SELECT id::int FROM sport_season
      WHERE sport_id = ${sportId} AND is_current`;
    if (!ss) return { teamId: t.id, teamSeasonId: null };

    const [ts] = await tx<{ id: number }[]>`
      INSERT INTO team_season (team_id, sport_season_id)
      VALUES (${t.id}, ${ss.id})
      ON CONFLICT (team_id, sport_season_id)
        DO UPDATE SET team_id = EXCLUDED.team_id
      RETURNING id::int`;
    return { teamId: t.id, teamSeasonId: ts.id };
  });
}

export type AdminTeamDetail = {
  teamId: number;
  schoolName: string;
  sportName: string;
  sportSlug: string;
  gender: string;
  level: string;
  teamSeasonId: number | null;
  seasonLabel: string | null;
};

export async function getTeamAdmin(teamId: number) {
  const rows = await sql<AdminTeamDetail[]>`
    SELECT t.id::int AS "teamId", sc.name AS "schoolName",
           sp.name AS "sportName", sp.slug::text AS "sportSlug",
           t.gender::text AS gender, t.level::text AS level,
           ts.id::int AS "teamSeasonId", se.label AS "seasonLabel"
    FROM team t
    JOIN school sc ON sc.id = t.school_id
    JOIN sport sp  ON sp.id = t.sport_id
    LEFT JOIN sport_season ss ON ss.sport_id = t.sport_id AND ss.is_current
    LEFT JOIN team_season ts  ON ts.team_id = t.id AND ts.sport_season_id = ss.id
    LEFT JOIN season se       ON se.id = ss.season_id
    WHERE t.id = ${teamId}`;
  return rows[0] ?? null;
}

/* ----------------------------------------------------------- roster */

export type RosterAdminRow = {
  playerSeasonId: number;
  playerId: number;
  firstName: string;
  lastName: string;
  jersey: string | null;
  grade: number | null;
  hasStats: boolean;
};

export async function listRosterAdmin(teamSeasonId: number) {
  return sql<RosterAdminRow[]>`
    SELECT ps.id::int AS "playerSeasonId", p.id::int AS "playerId",
           p.first_name AS "firstName", p.last_name AS "lastName",
           ps.jersey, ps.grade::int,
           EXISTS (SELECT 1 FROM stat_line sl WHERE sl.player_id = p.id) AS "hasStats"
    FROM player_season ps
    JOIN player p ON p.id = ps.player_id
    WHERE ps.team_season_id = ${teamSeasonId}
    ORDER BY nullif(regexp_replace(coalesce(ps.jersey,''), '\D', '', 'g'), '')::int
             NULLS LAST, p.last_name, p.first_name`;
}

function slugifyName(first: string, last: string): string {
  return `${first} ${last}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Adds a player to a roster.
 *
 * Player slugs are globally unique and two students really can share a name,
 * so a taken slug gets a numeric suffix rather than colliding or silently
 * reusing somebody else's player row.
 */
export async function addRosterPlayer(input: {
  teamSeasonId: number;
  firstName: string;
  lastName: string;
  jersey: string | null;
  grade: number | null;
}): Promise<{ playerId: number | null; duplicate?: boolean }> {
  return sql.begin(async (tx) => {
    // Entering a roster is repetitive and a double-submit is easy. Same name
    // AND same jersey on the same roster is a mistake, not two students.
    // Same name with a different jersey is allowed - siblings exist.
    const [dupe] = await tx<{ one: number }[]>`
      SELECT 1 AS one
      FROM player_season ps
      JOIN player p ON p.id = ps.player_id
      WHERE ps.team_season_id = ${input.teamSeasonId}
        AND lower(p.first_name) = lower(${input.firstName})
        AND lower(p.last_name)  = lower(${input.lastName})
        AND coalesce(ps.jersey, '') = coalesce(${input.jersey}, '')`;
    if (dupe) return { playerId: null, duplicate: true };

    const base = slugifyName(input.firstName, input.lastName) || "player";
    let slug = base;
    for (let n = 2; n < 60; n++) {
      const [taken] = await tx<{ one: number }[]>`
        SELECT 1 AS one FROM player WHERE slug = ${slug}`;
      if (!taken) break;
      slug = `${base}-${n}`;
    }

    const [p] = await tx<{ id: number }[]>`
      INSERT INTO player (slug, first_name, last_name, data_source_id)
      SELECT ${slug}, ${input.firstName}, ${input.lastName}, ds.id
      FROM data_source ds WHERE ds.slug = 'staff-entry'
      RETURNING id::int`;

    await tx`
      INSERT INTO player_season (player_id, team_season_id, jersey, grade, data_source_id)
      SELECT ${p.id}, ${input.teamSeasonId}, ${input.jersey}, ${input.grade}, ds.id
      FROM data_source ds WHERE ds.slug = 'staff-entry'`;

    return { playerId: p.id };
  });
}

export async function updateRosterEntry(
  teamSeasonId: number,
  playerSeasonId: number,
  jersey: string | null,
  grade: number | null
) {
  await sql`
    UPDATE player_season SET jersey = ${jersey}, grade = ${grade}
    WHERE id = ${playerSeasonId} AND team_season_id = ${teamSeasonId}`;
}

/**
 * Removes a player from this roster. The player row itself stays: stat lines
 * reference it, and deleting it would break the record and any URL pointing
 * at it. Refused outright once statistics exist.
 */
export async function removeRosterEntry(
  teamSeasonId: number,
  playerSeasonId: number
): Promise<{ removed: boolean; reason?: string }> {
  const [row] = await sql<{ playerId: number; hasStats: boolean }[]>`
    SELECT ps.player_id::int AS "playerId",
           EXISTS (SELECT 1 FROM stat_line sl WHERE sl.player_id = ps.player_id)
             AS "hasStats"
    FROM player_season ps
    WHERE ps.id = ${playerSeasonId} AND ps.team_season_id = ${teamSeasonId}`;
  if (!row) return { removed: false, reason: "That roster entry no longer exists." };
  if (row.hasStats) {
    return {
      removed: false,
      reason:
        "This player already has statistics recorded, so removing them would " +
        "orphan part of the record. Correct the jersey instead.",
    };
  }
  await sql`DELETE FROM player_season WHERE id = ${playerSeasonId}`;
  return { removed: true };
}

/* ------------------------------------------------- selects for forms */

export async function listSchoolsForSelect() {
  return sql<{ id: number; name: string }[]>`
    SELECT id::int, name FROM school
    WHERE is_active AND state = 'KY'
    ORDER BY name`;
}

/** Only sports with a season open: a team in a closed sport has nowhere to go. */
export async function listSportsForSelect() {
  return sql<{ id: number; name: string; hasSeason: boolean }[]>`
    SELECT sp.id::int, sp.name,
           EXISTS (SELECT 1 FROM sport_season ss
                    WHERE ss.sport_id = sp.id AND ss.is_current) AS "hasSeason"
    FROM sport sp
    WHERE sp.is_active
    ORDER BY sp.display_order`;
}

/* ---------------------------------------------------------- schedule */

export type TeamGameRow = {
  gameId: number;
  shortCode: string;
  localDate: string;
  status: string;
  isHome: boolean;
  opponentName: string;
  ourScore: number | null;
  theirScore: number | null;
  boxScoreStatus: string;
};

export async function listTeamGames(teamSeasonId: number) {
  return sql<TeamGameRow[]>`
    SELECT g.id::int AS "gameId", g.short_code::text AS "shortCode",
           g.local_date::text AS "localDate", g.status::text AS status,
           (mine.role = 'home') AS "isHome",
           opp_school.name AS "opponentName",
           mine.score::int AS "ourScore", opp.score::int AS "theirScore",
           g.box_score_status AS "boxScoreStatus"
    FROM team_season ts
    JOIN game_participant mine ON mine.team_id = ts.team_id
    JOIN game g ON g.id = mine.game_id AND g.sport_season_id = ts.sport_season_id
    JOIN game_participant opp ON opp.game_id = g.id AND opp.id <> mine.id
    JOIN team opp_team     ON opp_team.id = opp.team_id
    JOIN school opp_school ON opp_school.id = opp_team.school_id
    WHERE ts.id = ${teamSeasonId}
    ORDER BY g.local_date DESC`;
}

/** Opponents to schedule against: other teams in the same sport and season. */
export async function listOpponentTeams(teamSeasonId: number) {
  return sql<{ teamId: number; label: string }[]>`
    SELECT other.id::int AS "teamId",
           sc.name || ' (' || other.gender::text || ' ' || other.level::text || ')' AS label
    FROM team_season ts
    JOIN team mine ON mine.id = ts.team_id
    JOIN team other ON other.sport_id = mine.sport_id AND other.id <> mine.id
    JOIN team_season other_ts
      ON other_ts.team_id = other.id AND other_ts.sport_season_id = ts.sport_season_id
    JOIN school sc ON sc.id = other.school_id
    WHERE ts.id = ${teamSeasonId}
    ORDER BY sc.name`;
}

/**
 * Short codes are the shareable permalink component (/baseball/2027/g/7fkq2m).
 * Random rather than sequential so one game's URL does not disclose how many
 * games exist or let someone walk the whole schedule.
 */
function shortCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"; // no look-alikes
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export type CreateGameResult =
  | { ok: true; gameId: number }
  | { ok: false; reason: string };

export async function createGame(input: {
  teamSeasonId: number;
  opponentTeamId: number;
  localDate: string;
  isHome: boolean;
  status: string;
  ourScore: number | null;
  theirScore: number | null;
}): Promise<CreateGameResult> {
  const [ts] = await sql<{ teamId: number; sportSeasonId: number }[]>`
    SELECT team_id::int AS "teamId", sport_season_id::int AS "sportSeasonId"
    FROM team_season WHERE id = ${input.teamSeasonId}`;
  if (!ts) return { ok: false, reason: "That team season no longer exists." };
  if (input.opponentTeamId === ts.teamId) {
    return { ok: false, reason: "A team cannot play itself." };
  }

  try {
    return await sql.begin(async (tx) => {
      let code = shortCode();
      for (let attempt = 0; attempt < 10; attempt++) {
        const [taken] = await tx<{ one: number }[]>`
          SELECT 1 AS one FROM game WHERE short_code = ${code}`;
        if (!taken) break;
        code = shortCode();
      }

      const [g] = await tx<{ id: number }[]>`
        INSERT INTO game (sport_season_id, short_code, local_date, status)
        VALUES (${ts.sportSeasonId}, ${code}, ${input.localDate}::date,
                ${input.status}::game_status)
        RETURNING id::int`;

      // Both participants must land in one transaction: the "exactly two
      // participants" trigger is DEFERRABLE INITIALLY DEFERRED.
      const rows = input.isHome
        ? [
            { team: ts.teamId, role: "home", score: input.ourScore },
            { team: input.opponentTeamId, role: "away", score: input.theirScore },
          ]
        : [
            { team: input.opponentTeamId, role: "home", score: input.theirScore },
            { team: ts.teamId, role: "away", score: input.ourScore },
          ];
      for (const r of rows) {
        await tx`
          INSERT INTO game_participant (game_id, team_id, role, score)
          VALUES (${g.id}, ${r.team}, ${r.role}::participant_role, ${r.score})`;
      }
      return { ok: true as const, gameId: g.id };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // game_natural_key: (team_pair_key, local_date). These two teams already
    // have a game on this date, which is the schema refusing a duplicate.
    if (message.includes("game_natural_key")) {
      return {
        ok: false,
        reason: "These two teams already have a game on that date.",
      };
    }
    return { ok: false, reason: message };
  }
}

export async function deleteGame(gameId: number): Promise<{ ok: boolean; reason?: string }> {
  const [row] = await sql<{ hasStats: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM stat_line WHERE game_id = ${gameId}) AS "hasStats"`;
  if (row?.hasStats) {
    return {
      ok: false,
      reason: "This game has a box score recorded. Delete the statistics first.",
    };
  }
  await sql`DELETE FROM game WHERE id = ${gameId}`;
  return { ok: true };
}
