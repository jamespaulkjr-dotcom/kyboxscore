"use server";

import {
  createSession,
  findCredentialByEmail,
  hashPassword,
  hashToken,
  newSessionToken,
  revokeAllSessions,
  setPassword,
  verifyPassword,
} from "@kyboxscore/db";
import {
  requireUser,
  sessionExpiry,
  setSessionCookie,
} from "../../../lib/auth";

export type PasswordState = { error?: string; done?: boolean };

// Length over composition rules. A 12-character passphrase beats an
// eight-character one with a symbol bolted on, and character-class rules
// mostly produce Password1! everywhere.
const MIN_LENGTH = 12;

export async function changePassword(
  _prev: PasswordState,
  formData: FormData
): Promise<PasswordState> {
  const user = await requireUser("/account/password");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!current || !next) return { error: "Fill in every field." };
  if (next !== confirm) return { error: "The new passwords do not match." };
  if (next.length < MIN_LENGTH) {
    return { error: `Use at least ${MIN_LENGTH} characters.` };
  }
  if (next === current) {
    return { error: "The new password is the same as the current one." };
  }

  const cred = await findCredentialByEmail(user.email);
  if (!cred || !(await verifyPassword(current, cred.passwordHash))) {
    return { error: "That is not your current password." };
  }

  await setPassword(user.id, await hashPassword(next));

  // Changing a password must end every other session - that is the entire
  // point when the old one may have leaked. The session doing the change is
  // then reissued, so the person making it is not logged out of their own
  // browser mid-task.
  await revokeAllSessions(user.id);
  const token = newSessionToken();
  const expires = sessionExpiry();
  await createSession(user.id, hashToken(token), expires);
  await setSessionCookie(token, expires);

  return { done: true };
}
