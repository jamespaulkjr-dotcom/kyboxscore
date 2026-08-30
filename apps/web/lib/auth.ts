import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  findSessionUser,
  hashToken,
  touchSession,
  type SessionUser,
} from "@kyboxscore/db";

export const SESSION_COOKIE = "kbs_session";
const SESSION_DAYS = 30;

export function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

export async function setSessionCookie(token: string, expires: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Off in development, where there is no TLS and the cookie would be dropped.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * The current user, or null. Reading cookies opts a route into dynamic
 * rendering, so call this only on pages that are genuinely per-user - never in
 * the public scoreboard path, which must stay cacheable.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const user = await findSessionUser(tokenHash);
  if (!user) return null;

  // Best effort. A failed freshness stamp must not fail the request.
  void touchSession(tokenHash).catch(() => {});
  return user;
}

/**
 * Guard for pages behind the login. Sends an anonymous visitor to /login with
 * a return path, so a bookmarked deep link survives signing in.
 */
export async function requireUser(returnTo: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  // redirect() returns never, so `user` is non-null past this point.
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}

/** Roles that may administer accounts and team grants. */
export const ADMIN_ROLES = ["admin", "staff"] as const;

export function isAdmin(user: SessionUser): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(user.role);
}

/**
 * Guard for staff-only pages. A signed-in coach who guesses the URL gets a
 * 404 rather than a 403: there is no reason to confirm the page exists.
 */
export async function requireAdmin(returnTo: string): Promise<SessionUser> {
  const user = await requireUser(returnTo);
  if (!isAdmin(user)) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  return user;
}

/** Client address for rate limiting, honouring the Caddy/Cloudflare chain. */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || null;
  return h.get("x-real-ip");
}

export type { SessionUser };
