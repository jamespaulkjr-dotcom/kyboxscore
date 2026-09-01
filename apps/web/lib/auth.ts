import { cookies, headers } from "next/headers";
import { WHO_COOKIE } from "./who";
import { redirect } from "next/navigation";
import {
  findSessionUser,
  hashToken,
  touchSession,
  type SessionUser,
} from "@kyboxscore/db";

export const SESSION_COOKIE = "kbs_session";

/**
 * A hint, not a credential.
 *
 * The header cannot read the session: doing so would opt every public page
 * into dynamic rendering and cost the edge cache on the scoreboard, which is
 * the one page that has to be fast. But a signed-in coach browsing the site
 * then sees "Sign in" on every page and reasonably concludes they have been
 * logged out.
 *
 * So this carries the one bit the header actually needs - what kind of account
 * is signed in - and nothing else. No token, no name, no id: it is readable by
 * JavaScript by design, so it must be worthless if read. It is a label on the
 * outside of the box, and the box is still locked.
 */
export { WHO_COOKIE } from "./who";
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
  store.delete(WHO_COOKIE);
}

/** Set alongside the session, and expiring with it, so the two never disagree. */
export async function setWhoCookie(role: string, expires: Date) {
  const store = await cookies();
  store.set(WHO_COOKIE, role, {
    // Read by the header in the browser. Deliberately not httpOnly - and
    // deliberately holding nothing worth stealing.
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
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
