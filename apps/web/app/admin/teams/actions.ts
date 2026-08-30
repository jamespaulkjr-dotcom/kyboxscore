"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addRosterPlayer,
  createTeam,
  getTeamAdmin,
  removeRosterEntry,
  updateRosterEntry,
} from "@kyboxscore/db";
import { requireAdmin } from "../../../lib/auth";

const GENDERS = new Set(["boys", "girls", "coed"]);
const LEVELS = new Set(["varsity", "jv", "freshman", "middle_school"]);

export type TeamState = { error?: string };

export async function createTeamAction(
  _prev: TeamState,
  formData: FormData
): Promise<TeamState> {
  await requireAdmin("/admin/teams");

  const schoolId = Number(formData.get("schoolId"));
  const sportId = Number(formData.get("sportId"));
  const gender = String(formData.get("gender") ?? "");
  const level = String(formData.get("level") ?? "varsity");

  if (!Number.isInteger(schoolId) || schoolId <= 0) return { error: "Choose a school." };
  if (!Number.isInteger(sportId) || sportId <= 0) return { error: "Choose a sport." };
  if (!GENDERS.has(gender)) return { error: "Choose boys, girls or coed." };
  if (!LEVELS.has(level)) return { error: "Choose a level." };

  const { teamId } = await createTeam(schoolId, sportId, gender, level);
  redirect(`/admin/teams/${teamId}`);
}

export type RosterState = { error?: string; added?: string };

export async function addPlayerAction(
  _prev: RosterState,
  formData: FormData
): Promise<RosterState> {
  await requireAdmin("/admin/teams");

  const teamId = Number(formData.get("teamId"));
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const jerseyRaw = String(formData.get("jersey") ?? "").trim();
  const gradeRaw = String(formData.get("grade") ?? "").trim();

  if (!firstName || !lastName) return { error: "First and last name are both required." };
  // Jerseys are text on purpose: '00' is not '0'.
  if (jerseyRaw.length > 4) return { error: "That jersey number looks too long." };
  const grade = gradeRaw === "" ? null : Number(gradeRaw);
  if (grade !== null && (!Number.isInteger(grade) || grade < 6 || grade > 12)) {
    return { error: "Grade must be between 6 and 12, or left blank." };
  }

  const team = await getTeamAdmin(teamId);
  if (!team) return { error: "That team no longer exists." };
  if (team.teamSeasonId === null) {
    return { error: "This team has no season open, so it cannot hold a roster yet." };
  }

  const result = await addRosterPlayer({
    teamSeasonId: team.teamSeasonId,
    firstName,
    lastName,
    jersey: jerseyRaw === "" ? null : jerseyRaw,
    grade,
  });

  if (result.duplicate) {
    return {
      error:
        `${firstName} ${lastName} is already on this roster wearing that ` +
        `number. If these are two different students, give the second one ` +
        `their own jersey number.`,
    };
  }

  revalidatePath(`/admin/teams/${teamId}`);
  return { added: `${firstName} ${lastName} added.` };
}

export async function updateRosterAction(formData: FormData) {
  await requireAdmin("/admin/teams");
  const teamId = Number(formData.get("teamId"));
  const playerSeasonId = Number(formData.get("playerSeasonId"));
  const jersey = String(formData.get("jersey") ?? "").trim();
  const gradeRaw = String(formData.get("grade") ?? "").trim();
  const grade = gradeRaw === "" ? null : Number(gradeRaw);
  if (grade !== null && (!Number.isInteger(grade) || grade < 6 || grade > 12)) return;

  const team = await getTeamAdmin(teamId);
  if (!team?.teamSeasonId) return;

  await updateRosterEntry(
    team.teamSeasonId,
    playerSeasonId,
    jersey === "" ? null : jersey,
    grade
  );
  revalidatePath(`/admin/teams/${teamId}`);
}

export async function removeRosterAction(formData: FormData) {
  await requireAdmin("/admin/teams");
  const teamId = Number(formData.get("teamId"));
  const playerSeasonId = Number(formData.get("playerSeasonId"));

  const team = await getTeamAdmin(teamId);
  if (!team?.teamSeasonId) return;

  await removeRosterEntry(team.teamSeasonId, playerSeasonId);
  revalidatePath(`/admin/teams/${teamId}`);
}
