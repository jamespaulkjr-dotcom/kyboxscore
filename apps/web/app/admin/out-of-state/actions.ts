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
import { nameWithoutState, parseTeamRecords } from "@kyboxscore/parsers";
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

  // Takes it however it is written: commas, tabs, "Elder 3-0", a pasted
  // markdown table, a trailing "(OH)". The old parser accepted strictly
  // "name, wins, losses" and rejected everything else as an unknown school.
  const { records, issues } = parseTeamRecords(text);

  // Match on the name as written, and again with any "(OH)" removed, because
  // our own display names carry the state now and a source's will not.
  const names = records.flatMap((r) => [r.name, nameWithoutState(r.name)]);
  const matches = await matchSchoolNames([...new Set(names)]);
  const bySchool = new Map(matches.map((m) => [m.input.toLowerCase(), m]));

  // school_id -> team_id for the out-of-state teams in this season.
  const known = await listOutOfStateTeams(sportSeasonId);
  const teamBySchool = new Map(known.map((k) => [k.schoolId, k.teamId]));

  const entries: OutOfStateEntry[] = [];
  // Lines that could not be read at all are reported alongside names that
  // could: never fail silently, and never make somebody diff two lists to
  // work out what was skipped.
  const unmatched: string[] = issues.map((i) => `${i.line} (${i.reason})`);
  for (const r of records) {
    const schoolId =
      bySchool.get(r.name.toLowerCase())?.schoolId ??
      bySchool.get(nameWithoutState(r.name).toLowerCase())?.schoolId;
    const teamId = schoolId ? teamBySchool.get(schoolId) : undefined;
    if (!teamId) {
      unmatched.push(r.name);
      continue;
    }
    entries.push({ teamId, wins: r.wins, losses: r.losses, ties: r.ties });
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
