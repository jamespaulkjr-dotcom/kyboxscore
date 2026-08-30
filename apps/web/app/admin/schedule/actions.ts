"use server";

import {
  commitSchedule,
  matchSchoolNames,
  type SchoolMatch,
} from "@kyboxscore/db";
import { parseScheduleText, type ScheduleIssue } from "@kyboxscore/parsers";
import { requireAdmin } from "../../../lib/auth";

const GENDERS = new Set(["boys", "girls", "coed"]);
const LEVELS = new Set(["varsity", "jv", "freshman", "middle_school"]);

export type PreviewRow = {
  lineNumber: number;
  date: string;
  home: SchoolMatch;
  away: SchoolMatch;
  homeScore: number | null;
  awayScore: number | null;
};

export type ScheduleState = {
  error?: string;
  text?: string;
  sportId?: number;
  gender?: string;
  level?: string;
  rows?: PreviewRow[];
  issues?: ScheduleIssue[];
  committed?: {
    created: number;
    duplicates: number;
    teamsCreated: number;
    failed: { lineNumber: number; reason: string }[];
  };
};

function readCommon(formData: FormData) {
  const text = String(formData.get("text") ?? "");
  const sportId = Number(formData.get("sportId"));
  const gender = String(formData.get("gender") ?? "boys");
  const level = String(formData.get("level") ?? "varsity");
  return { text, sportId, gender, level };
}

export async function previewScheduleAction(
  _prev: ScheduleState,
  formData: FormData
): Promise<ScheduleState> {
  await requireAdmin("/admin/schedule");
  const { text, sportId, gender, level } = readCommon(formData);

  if (!text.trim()) return { error: "Paste a schedule first.", text };
  if (!Number.isInteger(sportId) || sportId <= 0) return { error: "Choose a sport.", text };
  if (!GENDERS.has(gender) || !LEVELS.has(level)) {
    return { error: "Choose a valid gender and level.", text };
  }

  const parsed = parseScheduleText(text);
  const names = parsed.rows.flatMap((r) => [r.homeName, r.awayName]);
  const matches = await matchSchoolNames(names);
  const byInput = new Map(matches.map((m) => [m.input.toLowerCase(), m]));

  const unmatchedFallback = (input: string): SchoolMatch => ({
    input,
    schoolId: null,
    schoolName: null,
    method: "unmatched",
    confidence: null,
    candidates: [],
  });

  const rows: PreviewRow[] = parsed.rows.map((r) => ({
    lineNumber: r.lineNumber,
    date: r.date,
    home: byInput.get(r.homeName.trim().toLowerCase()) ?? unmatchedFallback(r.homeName),
    away: byInput.get(r.awayName.trim().toLowerCase()) ?? unmatchedFallback(r.awayName),
    homeScore: r.homeScore,
    awayScore: r.awayScore,
  }));

  return { text, sportId, gender, level, rows, issues: parsed.issues };
}

export async function commitScheduleAction(
  _prev: ScheduleState,
  formData: FormData
): Promise<ScheduleState> {
  await requireAdmin("/admin/schedule");
  const { text, sportId, gender, level } = readCommon(formData);

  if (!Number.isInteger(sportId) || sportId <= 0) return { error: "Choose a sport.", text };
  if (!GENDERS.has(gender) || !LEVELS.has(level)) {
    return { error: "Choose a valid gender and level.", text };
  }

  // Re-parse and re-match rather than trusting anything round-tripped through
  // the browser: what gets written must come from the text the user can see.
  const parsed = parseScheduleText(text);
  const matches = await matchSchoolNames(
    parsed.rows.flatMap((r) => [r.homeName, r.awayName])
  );
  const byInput = new Map(matches.map((m) => [m.input.toLowerCase(), m]));

  const commitRows = [];
  for (const r of parsed.rows) {
    const home = byInput.get(r.homeName.trim().toLowerCase());
    const away = byInput.get(r.awayName.trim().toLowerCase());
    // Only fully resolved games are written. An unmatched school is reported
    // in the preview and skipped here; it is never guessed.
    if (!home?.schoolId || !away?.schoolId) continue;
    commitRows.push({
      lineNumber: r.lineNumber,
      date: r.date,
      homeSchoolId: home.schoolId,
      awaySchoolId: away.schoolId,
      homeScore: r.homeScore,
      awayScore: r.awayScore,
    });
  }

  if (commitRows.length === 0) {
    return { error: "Nothing here resolves to two known schools.", text, sportId, gender, level };
  }

  const result = await commitSchedule(commitRows, sportId, gender, level);
  return { text, sportId, gender, level, committed: result };
}
