"use server";

import { revalidatePath } from "next/cache";
import { grantTeam, revokeTeam } from "@kyboxscore/db";
import { requireAdmin } from "../../lib/auth";

/**
 * Grants and revocations are plain form posts rather than a client-side
 * widget: each one is a single deliberate decision about who may enter
 * statistics, and it should work without JavaScript like the rest of the site.
 */
export async function grant(formData: FormData) {
  const admin = await requireAdmin("/admin/users");
  const userId = Number(formData.get("userId"));
  const teamId = Number(formData.get("teamId"));
  if (!Number.isInteger(userId) || !Number.isInteger(teamId)) return;
  if (userId <= 0 || teamId <= 0) return;

  await grantTeam(userId, teamId, admin.id);
  revalidatePath(`/admin/users/${userId}`);
}

export async function revoke(formData: FormData) {
  await requireAdmin("/admin/users");
  const userId = Number(formData.get("userId"));
  const teamId = Number(formData.get("teamId"));
  if (!Number.isInteger(userId) || !Number.isInteger(teamId)) return;

  await revokeTeam(userId, teamId);
  revalidatePath(`/admin/users/${userId}`);
}
