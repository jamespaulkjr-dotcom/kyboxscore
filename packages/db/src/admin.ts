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
