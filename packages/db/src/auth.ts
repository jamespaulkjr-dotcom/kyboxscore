import { sql } from "./client.ts";

export type UserRole = "admin" | "staff" | "athletic_director" | "coach";

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  coachId: number | null;
};

type Credential = SessionUser & {
  passwordHash: string | null;
  isActive: boolean;
};

/**
 * Looked up by email for the login form. Returns inactive users too, so the
 * caller can burn the same password-verification time on a disabled account as
 * on a live one and not leak which is which through response timing.
 */
export async function findCredentialByEmail(
  email: string
): Promise<Credential | null> {
  const rows = await sql<Credential[]>`
    SELECT id::int, email, name, role, coach_id::int AS "coachId",
           password_hash AS "passwordHash", is_active AS "isActive"
    FROM app_user
    WHERE email = ${email}
    LIMIT 1`;
  return rows[0] ?? null;
}

export async function recordLoginAttempt(
  email: string,
  ip: string | null,
  succeeded: boolean
) {
  await sql`
    INSERT INTO login_attempt (email, ip, succeeded)
    VALUES (${email}, ${ip}, ${succeeded})`;
}

/**
 * Failures in the trailing window, counted per email and per source address.
 * Both matter: one attacker against many accounts looks fine per-email, and
 * one account attacked from many addresses looks fine per-ip.
 */
export async function recentFailureCount(
  email: string,
  ip: string | null,
  windowMinutes: number
): Promise<{ byEmail: number; byIp: number }> {
  const rows = await sql<{ byEmail: number; byIp: number }[]>`
    SELECT
      count(*) FILTER (WHERE email = ${email})::int AS "byEmail",
      count(*) FILTER (WHERE ${ip}::inet IS NOT NULL AND ip = ${ip})::int AS "byIp"
    FROM login_attempt
    WHERE NOT succeeded
      AND attempted_at > now() - make_interval(mins => ${windowMinutes})`;
  return rows[0] ?? { byEmail: 0, byIp: 0 };
}

export async function createSession(
  userId: number,
  tokenHash: string,
  expiresAt: Date
) {
  await sql`
    INSERT INTO user_session (user_id, token_hash, expires_at)
    VALUES (${userId}, ${tokenHash}, ${expiresAt})`;
  await sql`UPDATE app_user SET last_login_at = now() WHERE id = ${userId}`;
}

/**
 * Resolves a cookie token to a user. Every guarded request pays for this, which
 * is the deliberate cost of being able to revoke a session instantly.
 */
export async function findSessionUser(
  tokenHash: string
): Promise<SessionUser | null> {
  const rows = await sql<SessionUser[]>`
    SELECT u.id::int, u.email, u.name, u.role, u.coach_id::int AS "coachId"
    FROM user_session s
    JOIN app_user u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash}
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
      AND u.is_active
    LIMIT 1`;
  return rows[0] ?? null;
}

/** Fire-and-forget freshness stamp; never block a page render on it. */
export async function touchSession(tokenHash: string) {
  await sql`
    UPDATE user_session SET last_seen_at = now()
    WHERE token_hash = ${tokenHash}
      AND last_seen_at < now() - interval '5 minutes'`;
}

export async function revokeSession(tokenHash: string) {
  await sql`
    UPDATE user_session SET revoked_at = now()
    WHERE token_hash = ${tokenHash} AND revoked_at IS NULL`;
}

export async function revokeAllSessions(userId: number) {
  await sql`
    UPDATE user_session SET revoked_at = now()
    WHERE user_id = ${userId} AND revoked_at IS NULL`;
}

export async function setPassword(userId: number, passwordHash: string) {
  await sql`
    UPDATE app_user
    SET password_hash = ${passwordHash}, password_set_at = now()
    WHERE id = ${userId}`;
}

/** The teams this user may enter statistics for. Empty for a new account. */
export async function listGrantedTeams(userId: number) {
  return sql<
    {
      teamId: number;
      schoolName: string;
      sportSlug: string;
      sportName: string;
      gender: string;
      level: string;
    }[]
  >`
    SELECT t.id::int AS "teamId", sc.name AS "schoolName",
           sp.slug AS "sportSlug", sp.name AS "sportName",
           t.gender::text AS gender, t.level::text AS level
    FROM user_team_grant g
    JOIN team t   ON t.id = g.team_id
    JOIN school sc ON sc.id = t.school_id
    JOIN sport sp  ON sp.id = t.sport_id
    WHERE g.user_id = ${userId}
    ORDER BY sp.display_order, sc.name`;
}
