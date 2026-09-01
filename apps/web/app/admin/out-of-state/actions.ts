"use server";

import { revalidatePath } from "next/cache";
import {
  listOutOfStateTeams,
  matchSchoolNames,
  refreshSportSeasonRollups,
  runRpi,
  setOutOfStateRecords,
  type OutOfStateEntry,
} from "@kyboxscore/db";
import { parseCsv } from "@kyboxscore/parsers";
import { requireAdmin } from "../../../lib/auth";

export type OosState = {
  error?: string;
  saved?: { written: number; unmatched: string[]; recomputed: boolean };
};

/**
 * Accepts "School, wins, losses[, ties]" per line.
 *
 * Deliberately a paste rather than a fetch. These records live on other state
 * associations' sites, and pulling them automatically is extraction from
 * somewhere we have no agreement with — the same reason KHSAA is off limits.
 * Pasted from a source the user is entitled to read, with the source recorded,
 * it is staff entry: a permitted channel.
 */
export async function saveOutOfStateAction(
  _prev: OosState,
  formData: FormData
): Promise<OosState> {
  await requireAdmin("/admin/out-of-state");

  const text = String(formData.get("text") ?? "");
  const sourceName = String(formData.get("sourceName") ?? "").trim();
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim() || null;
  const asOf = String(formData.get("asOf") ?? "").trim();
  const sportSeasonId = Number(formData.get("sportSeasonId"));

  if (!text.trim()) return { error: "Paste at least one record." };
  if (!sourceName) {
    return { error: "Name the source. A rating that moves because of these numbers has to be traceable." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return { error: "Give the date these records are accurate as of (YYYY-MM-DD)." };
  }
  if (!Number.isInteger(sportSeasonId) || sportSeasonId <= 0) {
    return { error: "Missing season." };
  }

  const rows = parseCsv(text).filter((r) => r.some((c) => c !== ""));
  const names = rows.map((r) => r[0]?.trim()).filter(Boolean) as string[];
  const matches = await matchSchoolNames(names);
  const bySchool = new Map(matches.map((m) => [m.input.toLowerCase(), m]));

  // school_id -> team_id for the out-of-state teams in this season.
  const known = await listOutOfStateTeams(sportSeasonId);
  const teamBySchool = new Map(known.map((k) => [k.schoolId, k.teamId]));

  const entries: OutOfStateEntry[] = [];
  const unmatched: string[] = [];
  for (const row of rows) {
    const name = (row[0] ?? "").trim();
    if (!name) continue;
    const wins = Number((row[1] ?? "").trim());
    const losses = Number((row[2] ?? "").trim());
    const ties = row[3] === undefined || row[3].trim() === "" ? 0 : Number(row[3].trim());
    if (!Number.isInteger(wins) || !Number.isInteger(losses) || !Number.isInteger(ties)) {
      unmatched.push(`${name} (record not a whole number)`);
      continue;
    }
    const schoolId = bySchool.get(name.toLowerCase())?.schoolId;
    const teamId = schoolId ? teamBySchool.get(schoolId) : undefined;
    if (!teamId) {
      unmatched.push(name);
      continue;
    }
    entries.push({ teamId, wins, losses, ties });
  }

  if (entries.length === 0) {
    return { error: "None of those names is an out-of-state opponent in this season.", saved: { written: 0, unmatched, recomputed: false } };
  }

  const written = await setOutOfStateRecords(sportSeasonId, entries, sourceName, sourceUrl, asOf);

  // Shadow RPI reads these, so leaving the ratings stale would mean the page
  // still shows a zero delta against records we now have.
  await refreshSportSeasonRollups(sportSeasonId);
  await runRpi(sportSeasonId);

  revalidatePath("/admin/out-of-state");
  return { saved: { written, unmatched, recomputed: true } };
}
