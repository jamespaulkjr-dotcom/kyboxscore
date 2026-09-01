"use server";

import { commitSchedule, matchSchoolNames, type SchoolMatch } from "@kyboxscore/db";
import { parseScheduleSheet, type SheetIssue } from "@kyboxscore/parsers";
import { requireAdmin } from "../../../../lib/auth";

const GENDERS = new Set(["boys", "girls", "coed"]);
const LEVELS = new Set(["varsity", "jv", "freshman", "middle_school"]);
// A whole state's schedule is a few hundred kilobytes. Well past that is not one.
const MAX_BYTES = 8 * 1024 * 1024;

export type SheetState = {
  error?: string;
  sportId?: number;
  gender?: string;
  level?: string;
  fileName?: string;
  /** Held so commit works on exactly what was previewed. */
  csv?: string;
  summary?: {
    rows: number;
    ready: number;
    unknownSchool: number;
    skipped: number;
    scrimmages: number;
    canceled: number;
    withScores: number;
    unmatched: { name: string; games: number; candidates: string[] }[];
    issues: SheetIssue[];
  };
  committed?: { created: number; duplicates: number; teamsCreated: number; failed: number };
};

async function analyse(csv: string) {
  const parsed = parseScheduleSheet(csv);
  const names = [...new Set(parsed.games.flatMap((g) => [g.school, g.opponent]))];
  const matches = await matchSchoolNames(names);
  const byName = new Map<string, SchoolMatch>(
    matches.map((m) => [m.input.toLowerCase(), m])
  );

  const unmatchedCounts = new Map<string, { games: number; candidates: string[] }>();
  const rows = [];
  for (const g of parsed.games) {
    const school = byName.get(g.school.toLowerCase());
    const opponent = byName.get(g.opponent.toLowerCase());
    for (const [m, raw] of [[school, g.school], [opponent, g.opponent]] as const) {
      if (!m?.schoolId) {
        const entry = unmatchedCounts.get(raw) ?? {
          games: 0,
          candidates: m?.candidates.slice(0, 2).map((c) => c.name) ?? [],
        };
        entry.games++;
        unmatchedCounts.set(raw, entry);
      }
    }
    if (!school?.schoolId || !opponent?.schoolId) continue;

    rows.push({
      lineNumber: g.rowNumber,
      date: g.date,
      homeSchoolId: g.isHome ? school.schoolId : opponent.schoolId,
      awaySchoolId: g.isHome ? opponent.schoolId : school.schoolId,
      homeScore: g.teamScore === null ? null : g.isHome ? g.teamScore : g.opponentScore,
      awayScore: g.teamScore === null ? null : g.isHome ? g.opponentScore : g.teamScore,
      stage: g.stage,
      status: g.status,
      time: g.time,
    });
  }

  return {
    parsed,
    rows,
    summary: {
      rows: parsed.games.length + parsed.issues.length,
      ready: rows.length,
      unknownSchool: parsed.games.length - rows.length,
      skipped: parsed.issues.filter((i) => i.severity === "info").length,
      scrimmages: parsed.games.filter((g) => g.stage === "scrimmage").length,
      canceled: parsed.games.filter((g) => g.status === "canceled").length,
      withScores: parsed.games.filter((g) => g.teamScore !== null).length,
      unmatched: [...unmatchedCounts]
        .map(([name, v]) => ({ name, games: v.games, candidates: v.candidates }))
        .sort((a, b) => b.games - a.games),
      issues: parsed.issues.filter((i) => i.severity === "error").slice(0, 40),
    },
  };
}

function readCommon(formData: FormData) {
  return {
    sportId: Number(formData.get("sportId")),
    gender: String(formData.get("gender") ?? "boys"),
    level: String(formData.get("level") ?? "varsity"),
  };
}

export async function previewSheetAction(
  _prev: SheetState,
  formData: FormData
): Promise<SheetState> {
  await requireAdmin("/admin/schedule/sheet");
  const { sportId, gender, level } = readCommon(formData);
  const file = formData.get("file");

  if (!Number.isInteger(sportId) || sportId <= 0) return { error: "Choose a sport." };
  if (!GENDERS.has(gender) || !LEVELS.has(level)) return { error: "Choose a valid gender and level." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
  if (file.size > MAX_BYTES) return { error: "That file is larger than 8 MB." };

  const csv = await file.text();
  const { summary } = await analyse(csv);
  return { sportId, gender, level, fileName: file.name, csv, summary };
}

export async function commitSheetAction(
  _prev: SheetState,
  formData: FormData
): Promise<SheetState> {
  await requireAdmin("/admin/schedule/sheet");
  const { sportId, gender, level } = readCommon(formData);
  const csv = String(formData.get("csv") ?? "");
  if (!csv) return { error: "Nothing to import — preview a file first." };

  const { rows, summary } = await analyse(csv);
  if (rows.length === 0) return { error: "No row resolves to two known schools.", summary };

  const result = await commitSchedule(rows, sportId, gender, level);
  return {
    sportId, gender, level, summary,
    committed: {
      created: result.created,
      duplicates: result.duplicates,
      teamsCreated: result.teamsCreated,
      failed: result.failed.length,
    },
  };
}
