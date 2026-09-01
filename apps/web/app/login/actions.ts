"use server";

import { redirect } from "next/navigation";
import {
  burnVerifyTime,
  createSession,
  findCredentialByEmail,
  hashToken,
  newSessionToken,
  recentFailureCount,
  recordLoginAttempt,
  revokeSession,
  verifyPassword,
} from "@kyboxscore/db";
import {
  clearSessionCookie,
  clientIp,
  sessionExpiry,
  setSessionCookie,
  setWhoCookie,
  SESSION_COOKIE,
} from "../../lib/auth";
import { cookies } from "next/headers";

export type LoginState = { error?: string };

// Phase one has no public signup, so a human hitting these limits is rare and
// a script hitting them is the point.
const WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_EMAIL = 10;
const MAX_FAILURES_PER_IP = 25;

/** Deliberately identical for every failure mode. Never say which part was wrong. */
const GENERIC = "Email or password is incorrect.";

export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  if (!email || !password) return { error: "Enter your email and password." };

  const ip = await clientIp();
  const failures = await recentFailureCount(email, ip, WINDOW_MINUTES);
  if (
    failures.byEmail >= MAX_FAILURES_PER_EMAIL ||
    failures.byIp >= MAX_FAILURES_PER_IP
  ) {
    // Not counted as another attempt: a lockout must not extend itself.
    return {
      error: "Too many attempts. Wait a few minutes and try again.",
    };
  }

  const cred = await findCredentialByEmail(email);

  // Unknown email and wrong password must cost the same time.
  if (!cred) {
    await burnVerifyTime();
    await recordLoginAttempt(email, ip, false);
    return { error: GENERIC };
  }

  const ok = await verifyPassword(password, cred.passwordHash);
  // An inactive account verifies normally and is refused afterwards, so a
  // disabled coach cannot be distinguished from a wrong password.
  if (!ok || !cred.isActive) {
    await recordLoginAttempt(email, ip, false);
    return { error: GENERIC };
  }

  const token = newSessionToken();
  const expires = sessionExpiry();
  await createSession(cred.id, hashToken(token), expires);
  await setSessionCookie(token, expires);
  await setWhoCookie(cred.role, expires);
  await recordLoginAttempt(email, ip, true);

  // Only relative paths: an open redirect here would be a phishing primitive.
  const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/coach";
  redirect(dest);
}

export async function logout() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(hashToken(token));
  await clearSessionCookie();
  redirect("/");
}
