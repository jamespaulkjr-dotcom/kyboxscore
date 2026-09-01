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

/**
 * Admin listings deliberately show the school's full legal name.
 *
 * These are the screens where a person confirms that an import matched the
 * right school, and "Newport" versus "Newport Central Catholic" is exactly the
 * distinction they are checking. Everywhere a reader is simply reading -
 * scoreboards, team pages, game pages, search, the coach's own dashboard -
 * shows short_name.
 */
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

export async function listTeamsAdmin(query?: string, sportId?: number) {
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
    WHERE TRUE
      ${q ? sql`AND (sc.name ILIKE ${"%" + q + "%"} OR sp.name ILIKE ${"%" + q + "%"})` : sql``}
      ${sportId ? sql`AND sp.id = ${sportId}` : sql``}
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
  stage: string;
};

export async function listTeamGames(teamSeasonId: number) {
  return sql<TeamGameRow[]>`
    SELECT g.id::int AS "gameId", g.short_code::text AS "shortCode",
           g.local_date::text AS "localDate", g.status::text AS status,
           (mine.role = 'home') AS "isHome",
           opp_school.name AS "opponentName",
           mine.score::int AS "ourScore", opp.score::int AS "theirScore",
           g.box_score_status AS "boxScoreStatus", g.stage::text AS stage
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
  const [row] = await sql<{ hasStats: boolean; inRpi: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM stat_line WHERE game_id = ${gameId}) AS "hasStats",
           EXISTS (SELECT 1 FROM rpi_input WHERE game_id = ${gameId}) AS "inRpi"`;
  if (row?.hasStats) {
    return {
      ok: false,
      reason: "This game has a box score recorded. Delete the statistics first.",
    };
  }
  // A published RPI run keeps the games it was computed from, because the
  // whole promise is that a past rating can be reproduced. Refusing here beats
  // surfacing a raw foreign key error.
  if (row?.inRpi) {
    return {
      ok: false,
      reason:
        "An RPI run has already been computed from this game. Deleting it " +
        "would make that rating impossible to reproduce.",
    };
  }
  await sql`DELETE FROM game WHERE id = ${gameId}`;
  return { ok: true };
}

/* -------------------------------------------------------- alignments */

export type AlignmentOption = {
  alignmentId: number;
  label: string;
  parentName: string | null;
};

/**
 * Leaf alignments (districts) a team could belong to, for its own sport and
 * gender, still in effect. The parent — class or region — travels with it,
 * because "District 3" is meaningless without knowing which class it is in.
 */
export async function listAlignmentsForTeam(teamSeasonId: number) {
  return sql<AlignmentOption[]>`
    SELECT a.id::int AS "alignmentId", a.name AS label,
           parent.name AS "parentName"
    FROM team_season ts
    JOIN team t ON t.id = ts.team_id
    JOIN alignment a
      ON a.sport_id = t.sport_id
     AND a.gender = t.gender
     AND a.kind = 'district'
     AND a.effective_to IS NULL
    LEFT JOIN alignment parent ON parent.id = a.parent_id
    WHERE ts.id = ${teamSeasonId}
    ORDER BY parent.ordinal NULLS LAST, a.ordinal`;
}

export async function setTeamSeasonAlignment(
  teamSeasonId: number,
  alignmentId: number | null
) {
  await sql`
    UPDATE team_season SET alignment_id = ${alignmentId}
    WHERE id = ${teamSeasonId}`;
}

export async function getTeamSeasonAlignment(teamSeasonId: number) {
  const rows = await sql<
    { alignmentId: number; name: string; parentName: string | null }[]
  >`
    SELECT a.id::int AS "alignmentId", a.name, parent.name AS "parentName"
    FROM team_season ts
    JOIN alignment a ON a.id = ts.alignment_id
    LEFT JOIN alignment parent ON parent.id = a.parent_id
    WHERE ts.id = ${teamSeasonId}`;
  return rows[0] ?? null;
}

/**
 * Changes what kind of game this is.
 *
 * Published schedules mislabel this: the real 2026 John Hardin document marks
 * a pre-season scrimmage as "District Game". Nothing in the file can be
 * trusted to say so, and the difference matters - a scrimmage counts for no
 * record and no RPI - so a human needs to be able to correct it.
 */
export async function setGameStage(
  gameId: number,
  stage: "regular_season" | "preseason" | "scrimmage" | "district_tournament"
): Promise<{ ok: boolean; reason?: string }> {
  const [row] = await sql<{ inRpi: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM rpi_input WHERE game_id = ${gameId}) AS "inRpi"`;
  await sql`
    UPDATE game SET stage = ${stage}::game_stage, updated_at = now()
    WHERE id = ${gameId}`;
  // Not a refusal: correcting a mislabelled game is exactly the point. But the
  // ratings that already counted it are now stale and must be recomputed.
  return {
    ok: true,
    reason: row?.inRpi
      ? "An RPI run already counted this game. Recompute the ratings."
      : undefined,
  };
}

/* ------------------------------------------------ out-of-state records */

export type OutOfStateTeamRow = {
  teamId: number;
  schoolId: number;
  schoolName: string;
  /** How many Kentucky teams have played them: the reason to bother. */
  gamesVsKentucky: number;
  kentuckyOpponents: string;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  sourceName: string | null;
  asOf: string | null;
};

/**
 * Out-of-state opponents and their known record.
 *
 * Shadow RPI is the whole reason this exists: the official formula pins every
 * out-of-state opponent to a flat .500, and Shadow shows what the rating would
 * be with their real record instead. Without a record here the two numbers are
 * identical and the delta is honestly zero.
 */
export async function listOutOfStateTeams(sportSeasonId: number) {
  return sql<OutOfStateTeamRow[]>`
    SELECT t.id::int AS "teamId", sc.id::int AS "schoolId",
           coalesce(sc.short_name, sc.name) AS "schoolName",
           count(DISTINCT g.id)::int AS "gamesVsKentucky",
           string_agg(DISTINCT coalesce(ky_sc.short_name, ky_sc.name), ', ') AS "kentuckyOpponents",
           oos.wins::int, oos.losses::int, oos.ties::int,
           oos.source_name AS "sourceName", oos.as_of::text AS "asOf"
    FROM team t
    JOIN school sc ON sc.id = t.school_id AND sc.state <> 'KY'
    JOIN game_participant gp ON gp.team_id = t.id
    JOIN game g ON g.id = gp.game_id AND g.sport_season_id = ${sportSeasonId}
    JOIN game_participant ky ON ky.game_id = g.id AND ky.id <> gp.id
    JOIN team ky_t ON ky_t.id = ky.team_id
    JOIN school ky_sc ON ky_sc.id = ky_t.school_id AND ky_sc.state = 'KY'
    LEFT JOIN out_of_state_record oos
           ON oos.team_id = t.id AND oos.sport_season_id = ${sportSeasonId}
    GROUP BY t.id, sc.id, sc.short_name, sc.name,
             oos.wins, oos.losses, oos.ties, oos.source_name, oos.as_of
    ORDER BY count(DISTINCT g.id) DESC, "schoolName"`;
}

export type OutOfStateEntry = {
  teamId: number;
  wins: number;
  losses: number;
  ties: number;
};

/**
 * Records a real out-of-state record.
 *
 * `sourceName` is required, not decorative. A rating that moves because of this
 * number has to be traceable to where the number came from — that is the
 * difference between a published rating and an assertion.
 */
export async function setOutOfStateRecords(
  sportSeasonId: number,
  entries: OutOfStateEntry[],
  sourceName: string,
  sourceUrl: string | null,
  asOf: string
): Promise<number> {
  if (entries.length === 0) return 0;
  let written = 0;
  for (const e of entries) {
    await sql`
      INSERT INTO out_of_state_record
        (team_id, sport_season_id, wins, losses, ties, source_name, source_url,
         as_of, data_source_id)
      SELECT ${e.teamId}, ${sportSeasonId}, ${e.wins}, ${e.losses}, ${e.ties},
             ${sourceName}, ${sourceUrl}, ${asOf}::date, ds.id
      FROM data_source ds WHERE ds.slug = 'staff-entry'
      ON CONFLICT (team_id, sport_season_id) DO UPDATE
        SET wins = EXCLUDED.wins,
            losses = EXCLUDED.losses,
            ties = EXCLUDED.ties,
            source_name = EXCLUDED.source_name,
            source_url = EXCLUDED.source_url,
            as_of = EXCLUDED.as_of`;
    written++;
  }
  return written;
}

/* ------------------------------------------------------- time zones */

export type TimeZoneRow = {
  slug: string;
  schoolName: string;
  county: string | null;
  timeZone: string;
};

export async function listSchoolTimeZones() {
  return sql<TimeZoneRow[]>`
    SELECT slug::text AS slug, coalesce(short_name, name) AS "schoolName",
           county, time_zone AS "timeZone"
    FROM school
    WHERE state = 'KY' AND is_active
    ORDER BY time_zone, coalesce(short_name, name)`;
}

/**
 * Moves whole counties to a time zone.
 *
 * Counties rather than schools: the boundary follows county lines, so setting
 * it per school would be 291 chances to be inconsistent. Schools whose name
 * does not state a county are matched by name instead, which is how the towns
 * get handled.
 */
export async function setTimeZoneForCounties(
  counties: string[],
  timeZone: "America/New_York" | "America/Chicago"
): Promise<number> {
  if (counties.length === 0) return 0;
  const res = await sql`
    UPDATE school
    SET time_zone = ${timeZone}, updated_at = now()
    WHERE state = 'KY'
      AND county IS NOT NULL
      AND lower(county) = ANY(${counties.map((c) => c.toLowerCase())}::text[])
      AND time_zone <> ${timeZone}`;
  return res.count;
}

/** For town-named schools, which state no county of their own. */
export async function setTimeZoneForSchools(
  slugs: string[],
  timeZone: "America/New_York" | "America/Chicago"
): Promise<number> {
  if (slugs.length === 0) return 0;
  const res = await sql`
    UPDATE school
    SET time_zone = ${timeZone}, updated_at = now()
    WHERE slug = ANY(${slugs}::citext[]) AND time_zone <> ${timeZone}`;
  return res.count;
}

/* ---------------------------------------------------------- rosters */

export type RosterImportPlayer = {
  firstName: string;
  lastName: string;
  jersey: string | null;
  grade: number | null;
  positions: string[];
  heightInches: number | null;
  weightLb: number | null;
};

export type RosterImportResult = {
  added: number;
  alreadyPresent: number;
  updated: number;
};

/**
 * Loads a whole roster for one team season.
 *
 * Idempotent by name and jersey, matching the single-player guard: re-running
 * a roster import must not double it. An existing player has their details
 * refreshed instead, so a corrected height or a grade rolling over lands
 * without creating a second person.
 */
export async function importRoster(
  teamSeasonId: number,
  players: RosterImportPlayer[]
): Promise<RosterImportResult> {
  const existing = await sql<
    { playerSeasonId: number; first: string; last: string; jersey: string | null }[]
  >`
    SELECT ps.id::int AS "playerSeasonId", p.first_name AS first,
           p.last_name AS last, ps.jersey
    FROM player_season ps
    JOIN player p ON p.id = ps.player_id
    WHERE ps.team_season_id = ${teamSeasonId}`;

  const key = (f: string, l: string, j: string | null) =>
    `${f.trim().toLowerCase()}|${l.trim().toLowerCase()}|${(j ?? "").trim()}`;
  const byKey = new Map(
    existing.map((e) => [key(e.first, e.last, e.jersey), e.playerSeasonId])
  );

  let added = 0;
  let updated = 0;
  let alreadyPresent = 0;

  for (const p of players) {
    const found = byKey.get(key(p.firstName, p.lastName, p.jersey));
    if (found !== undefined) {
      await sql`
        UPDATE player_season
        SET grade = ${p.grade},
            positions = ${p.positions.length ? p.positions : null},
            height_inches = ${p.heightInches},
            weight_lb = ${p.weightLb}
        WHERE id = ${found}`;
      alreadyPresent++;
      continue;
    }

    await sql.begin(async (tx) => {
      const base =
        `${p.firstName} ${p.lastName}`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "player";
      let slug = base;
      for (let n = 2; n < 200; n++) {
        const [taken] = await tx<{ one: number }[]>`
          SELECT 1 AS one FROM player WHERE slug = ${slug}`;
        if (!taken) break;
        slug = `${base}-${n}`;
      }

      const [player] = await tx<{ id: number }[]>`
        INSERT INTO player (slug, first_name, last_name, data_source_id)
        SELECT ${slug}, ${p.firstName}, ${p.lastName}, ds.id
        FROM data_source ds WHERE ds.slug = 'staff-entry'
        RETURNING id::int`;

      await tx`
        INSERT INTO player_season
          (player_id, team_season_id, jersey, grade, positions, height_inches,
           weight_lb, data_source_id)
        SELECT ${player.id}, ${teamSeasonId}, ${p.jersey}, ${p.grade},
               ${p.positions.length ? p.positions : null},
               ${p.heightInches}, ${p.weightLb}, ds.id
        FROM data_source ds WHERE ds.slug = 'staff-entry'
        ON CONFLICT (team_season_id, player_id) DO NOTHING`;
      added++;
    });
  }

  return { added, alreadyPresent, updated };
}

/** The team season for a school in a sport, creating it if needed. */
export async function ensureTeamSeasonForSchool(
  schoolId: number,
  sportId: number,
  gender: string,
  level: string
): Promise<number | null> {
  const [ss] = await sql<{ id: number }[]>`
    SELECT id::int FROM sport_season WHERE sport_id = ${sportId} AND is_current`;
  if (!ss) return null;

  const [t] = await sql<{ id: number }[]>`
    INSERT INTO team (school_id, sport_id, gender, level)
    VALUES (${schoolId}, ${sportId}, ${gender}::gender, ${level}::team_level)
    ON CONFLICT (school_id, sport_id, gender, level) DO UPDATE SET level = EXCLUDED.level
    RETURNING id::int`;
  const [ts] = await sql<{ id: number }[]>`
    INSERT INTO team_season (team_id, sport_season_id)
    VALUES (${t.id}, ${ss.id})
    ON CONFLICT (team_id, sport_season_id) DO UPDATE SET team_id = EXCLUDED.team_id
    RETURNING id::int`;
  return ts.id;
}

/**
 * How many teams exist per sport, so the admin list can say what it is showing.
 *
 * With one sport loaded, a list of 225 rows each reading "Football" is noise.
 * With two, it is a hazard: nothing distinguishes a basketball team from a
 * football one at a glance.
 */
export async function countTeamsBySport() {
  return sql<
    { sportId: number; sportSlug: string; sportName: string; teams: number }[]
  >`
    SELECT sp.id::int AS "sportId", sp.slug::text AS "sportSlug",
           sp.name AS "sportName", count(t.id)::int AS teams
    FROM sport sp
    LEFT JOIN team t ON t.sport_id = sp.id
    WHERE sp.is_active
    GROUP BY sp.id, sp.slug, sp.name, sp.display_order
    HAVING count(t.id) > 0
    ORDER BY sp.display_order`;
}
