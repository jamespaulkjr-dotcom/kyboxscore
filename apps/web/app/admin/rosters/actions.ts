"use server";

import {
  ensureTeamSeasonForSchool,
  importRoster,
  matchSchoolNames,
  refreshSearchIndex,
} from "@kyboxscore/db";
import { parseRosterWorkbook, readXlsx } from "@kyboxscore/parsers";
import { requireAdmin } from "../../../lib/auth";

const GENDERS = new Set(["boys", "girls", "coed"]);
const LEVELS = new Set(["varsity", "jv", "freshman", "middle_school"]);
const MAX_BYTES = 20 * 1024 * 1024;

export type RosterState = {
  error?: string;
  fileName?: string;
  summary?: {
    teams: number;
    players: number;
    matchedTeams: number;
    unmatched: { name: string; players: number }[];
    withoutJersey: number;
    skippedSheets: string[];
  };
  committed?: { teams: number; added: number; refreshed: number };
};

export async function importRostersAction(
  _prev: RosterState,
  formData: FormData
): Promise<RosterState> {
  await requireAdmin("/admin/rosters");

  const sportId = Number(formData.get("sportId"));
  const gender = String(formData.get("gender") ?? "boys");
  const level = String(formData.get("level") ?? "varsity");
  const commit = formData.get("commit") === "yes";
  const file = formData.get("file");

  if (!Number.isInteger(sportId) || sportId <= 0) return { error: "Choose a sport." };
  if (!GENDERS.has(gender) || !LEVELS.has(level)) return { error: "Choose a valid gender and level." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a roster workbook." };
  if (file.size > MAX_BYTES) return { error: "That file is larger than 20 MB." };

  let parsed;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    parsed = parseRosterWorkbook(readXlsx(buffer));
  } catch (err) {
    return { error: `That file could not be read as a workbook: ${err instanceof Error ? err.message : err}` };
  }

  if (parsed.teams.length === 0) {
    return { error: "No sheet in that workbook looks like a roster. Each tab needs First Name and Last Name columns." };
  }

  const matches = await matchSchoolNames(parsed.teams.map((t) => t.schoolName));
  const bySchool = new Map(matches.map((m) => [m.input.toLowerCase(), m]));

  const unmatched = parsed.teams
    .filter((t) => !bySchool.get(t.schoolName.toLowerCase())?.schoolId)
    .map((t) => ({ name: t.schoolName, players: t.players.length }));

  const summary = {
    teams: parsed.teams.length,
    players: parsed.teams.reduce((n, t) => n + t.players.length, 0),
    matchedTeams: parsed.teams.length - unmatched.length,
    unmatched,
    withoutJersey: parsed.teams.reduce(
      (n, t) => n + t.players.filter((p) => !p.jersey).length,
      0
    ),
    skippedSheets: parsed.skippedSheets,
  };

  if (!commit) return { fileName: file.name, summary };

  let teams = 0;
  let added = 0;
  let refreshed = 0;
  for (const team of parsed.teams) {
    const schoolId = bySchool.get(team.schoolName.toLowerCase())?.schoolId;
    if (!schoolId) continue;
    const teamSeasonId = await ensureTeamSeasonForSchool(schoolId, sportId, gender, level);
    if (teamSeasonId === null) continue;
    const result = await importRoster(teamSeasonId, team.players);
    teams++;
    added += result.added;
    refreshed += result.alreadyPresent;
  }

  // Players are searchable, and search_document is a materialized view that
  // does not update itself. Without this the roster imports fine and nobody
  // can find a single player.
  if (added > 0) await refreshSearchIndex();

  return { fileName: file.name, summary, committed: { teams, added, refreshed } };
}
