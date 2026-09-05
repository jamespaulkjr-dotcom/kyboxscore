"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addRosterPlayer,
  createGame,
  createTeam,
  createOutOfStateOpponent,
  deleteGame,
  setGameStage,
  setTeamSeasonAlignment,
  getTeamAdmin,
  removeRosterEntry,
  updateRosterEntry,
} from "@kyboxscore/db";
import { parseGrade } from "@kyboxscore/parsers";
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
  // "Sr" and "12" both mean the same thing to the person typing it.
  const grade = gradeRaw === "" ? null : parseGrade(gradeRaw);
  if (gradeRaw !== "" && grade === null) {
    return { error: "Grade should be Fr, So, Jr, Sr — or a number from 6 to 12." };
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
  const grade = gradeRaw === "" ? null : parseGrade(gradeRaw);
  if (gradeRaw !== "" && grade === null) return;

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

/* ---------------------------------------------------------- schedule */

const STATUSES = new Set(["scheduled", "in_progress", "final", "postponed", "cancelled"]);

export type GameState = { error?: string; added?: string };

export async function addGameAction(
  _prev: GameState,
  formData: FormData
): Promise<GameState> {
  await requireAdmin("/admin/teams");

  const teamId = Number(formData.get("teamId"));
  const opponentTeamId = Number(formData.get("opponentTeamId"));
  const localDate = String(formData.get("localDate") ?? "").trim();
  const isHome = String(formData.get("venue") ?? "home") === "home";
  const status = String(formData.get("status") ?? "scheduled");
  const ourRaw = String(formData.get("ourScore") ?? "").trim();
  const theirRaw = String(formData.get("theirScore") ?? "").trim();

  if (!Number.isInteger(opponentTeamId) || opponentTeamId <= 0) {
    return { error: "Choose an opponent." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    return { error: "Enter the date as YYYY-MM-DD." };
  }
  if (!STATUSES.has(status)) return { error: "Choose a valid status." };

  const num = (raw: string) => (raw === "" ? null : Number(raw));
  const ourScore = num(ourRaw);
  const theirScore = num(theirRaw);
  for (const v of [ourScore, theirScore]) {
    if (v !== null && (!Number.isInteger(v) || v < 0)) {
      return { error: "Scores must be whole numbers, or left blank." };
    }
  }
  // A final game without a score cannot produce a record or an RPI, so say so
  // now rather than letting it sit wrong.
  if (status === "final" && (ourScore === null || theirScore === null)) {
    return { error: "A final game needs both scores." };
  }

  const team = await getTeamAdmin(teamId);
  if (!team?.teamSeasonId) {
    return { error: "This team has no season open, so it cannot be scheduled." };
  }

  const result = await createGame({
    teamSeasonId: team.teamSeasonId,
    opponentTeamId,
    localDate,
    isHome,
    status,
    ourScore,
    theirScore,
  });
  if (!result.ok) return { error: result.reason };

  revalidatePath(`/admin/teams/${teamId}`);
  return { added: `Game on ${localDate} added.` };
}

export async function deleteGameAction(formData: FormData) {
  const user = await requireAdmin("/admin/teams");
  const teamId = Number(formData.get("teamId"));
  const gameId = Number(formData.get("gameId"));
  if (!Number.isInteger(gameId)) return;
  await deleteGame(gameId, user.id);
  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath("/admin/deleted-games");
}

/* -------------------------------------------------------- alignments */

export async function setAlignmentAction(formData: FormData) {
  await requireAdmin("/admin/teams");
  const teamId = Number(formData.get("teamId"));
  const raw = String(formData.get("alignmentId") ?? "");
  const alignmentId = raw === "" ? null : Number(raw);
  if (alignmentId !== null && !Number.isInteger(alignmentId)) return;

  const team = await getTeamAdmin(teamId);
  if (!team?.teamSeasonId) return;

  await setTeamSeasonAlignment(team.teamSeasonId, alignmentId);
  revalidatePath(`/admin/teams/${teamId}`);
}

const STAGES = new Set(["regular_season", "preseason", "scrimmage", "district_tournament"]);

export async function setGameStageAction(formData: FormData) {
  await requireAdmin("/admin/teams");
  const teamId = Number(formData.get("teamId"));
  const gameId = Number(formData.get("gameId"));
  const stage = String(formData.get("stage") ?? "");
  if (!Number.isInteger(gameId) || !STAGES.has(stage)) return;

  await setGameStage(gameId, stage as "regular_season" | "preseason" | "scrimmage");
  revalidatePath(`/admin/teams/${teamId}`);
}

export type OpponentState = { error?: string; added?: string };

/**
 * Add a school from outside Kentucky so a game can be scheduled against it.
 * Its record is not tracked by us; the official RPI gives it a flat .500 and
 * Shadow RPI uses a real record only if one is entered on the out-of-state
 * page.
 */
export async function createOpponentAction(
  _prev: OpponentState,
  formData: FormData
): Promise<OpponentState> {
  await requireAdmin("/admin/teams");

  const name = String(formData.get("name") ?? "");
  const state = String(formData.get("state") ?? "");
  const sportId = Number(formData.get("sportId"));
  const gender = String(formData.get("gender") ?? "boys");
  const level = String(formData.get("level") ?? "varsity");
  if (!Number.isInteger(sportId)) return { error: "Choose a sport." };

  const result = await createOutOfStateOpponent({
    name,
    state,
    sportId,
    gender,
    level,
  });
  if (!result.ok) return { error: result.reason ?? "That did not save." };

  revalidatePath("/admin/teams");
  return { added: `${name.trim()} (${state}) added.` };
}
