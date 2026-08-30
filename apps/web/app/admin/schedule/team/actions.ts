"use server";

import {
  commitSchedule,
  matchSchoolNames,
  type SchoolMatch,
} from "@kyboxscore/db";
import {
  inferYear,
  parseTeamSchedules,
  type TeamScheduleGame,
} from "@kyboxscore/parsers";
import { requireAdmin } from "../../../../lib/auth";

const GENDERS = new Set(["boys", "girls", "coed"]);
const LEVELS = new Set(["varsity", "jv", "freshman", "middle_school"]);

export type TeamPreviewGame = TeamScheduleGame & { opponent: SchoolMatch };

export type TeamBlock = {
  subject: SchoolMatch | null;
  subjectInput: string | null;
  year: number | null;
  yearCandidates: number[];
  games: TeamPreviewGame[];
  errors: { lineNumber: number; message: string }[];
};

export type TeamScheduleState = {
  error?: string;
  text?: string;
  sportId?: number;
  gender?: string;
  level?: string;
  year?: number;
  blocks?: TeamBlock[];
  committed?: { created: number; duplicates: number; teamsCreated: number; skipped: number };
};

function readCommon(formData: FormData) {
  const yearRaw = String(formData.get("year") ?? "").trim();
  return {
    text: String(formData.get("text") ?? ""),
    sportId: Number(formData.get("sportId")),
    gender: String(formData.get("gender") ?? "boys"),
    level: String(formData.get("level") ?? "varsity"),
    year: yearRaw === "" ? null : Number(yearRaw),
  };
}

/** Years a published schedule could plausibly belong to. */
function candidateYears(): number[] {
  const now = new Date().getUTCFullYear();
  return [now - 2, now - 1, now, now + 1];
}

async function buildBlocks(text: string, forcedYear: number | null) {
  const parsed = parseTeamSchedules(text);

  const names = new Set<string>();
  for (const block of parsed) {
    if (block.subjectTeam) names.add(block.subjectTeam);
    for (const g of block.games) names.add(g.opponentName);
  }
  const matches = await matchSchoolNames([...names]);
  const byName = new Map(matches.map((m) => [m.input.toLowerCase(), m]));

  return parsed.map((block): TeamBlock => {
    const inferred = inferYear(block.games, candidateYears());
    return {
      subjectInput: block.subjectTeam,
      subject: block.subjectTeam
        ? byName.get(block.subjectTeam.toLowerCase()) ?? null
        : null,
      year: forcedYear ?? inferred.year,
      yearCandidates: inferred.candidates,
      games: block.games.map((g) => ({
        ...g,
        opponent: byName.get(g.opponentName.toLowerCase()) ?? {
          input: g.opponentName,
          schoolId: null,
          schoolName: null,
          method: "unmatched" as const,
          confidence: null,
          candidates: [],
        },
      })),
      errors: block.issues
        .filter((i) => i.severity === "error")
        .map((i) => ({ lineNumber: i.lineNumber, message: i.message })),
    };
  });
}

export async function previewTeamScheduleAction(
  _prev: TeamScheduleState,
  formData: FormData
): Promise<TeamScheduleState> {
  await requireAdmin("/admin/schedule/team");
  const { text, sportId, gender, level, year } = readCommon(formData);

  if (!text.trim()) return { error: "Paste a schedule first.", text };
  if (!Number.isInteger(sportId) || sportId <= 0) return { error: "Choose a sport.", text };
  if (!GENDERS.has(gender) || !LEVELS.has(level)) {
    return { error: "Choose a valid gender and level.", text };
  }

  const blocks = await buildBlocks(text, year);
  return { text, sportId, gender, level, year: year ?? undefined, blocks };
}

export async function commitTeamScheduleAction(
  _prev: TeamScheduleState,
  formData: FormData
): Promise<TeamScheduleState> {
  await requireAdmin("/admin/schedule/team");
  const { text, sportId, gender, level, year } = readCommon(formData);
  if (!Number.isInteger(sportId) || sportId <= 0) return { error: "Choose a sport.", text };

  const blocks = await buildBlocks(text, year);

  const rows = [];
  let skipped = 0;
  for (const block of blocks) {
    // Without a resolved subject school and a year, a game cannot be placed.
    if (!block.subject?.schoolId || block.year === null) {
      skipped += block.games.length;
      continue;
    }
    for (const g of block.games) {
      if (!g.opponent.schoolId) {
        skipped++;
        continue;
      }
      const date = `${block.year}-${String(g.month).padStart(2, "0")}-${String(g.day).padStart(2, "0")}`;
      const home = g.isHome ? block.subject.schoolId : g.opponent.schoolId;
      const away = g.isHome ? g.opponent.schoolId : block.subject.schoolId;
      const homeScore = g.teamScore === null ? null : g.isHome ? g.teamScore : g.opponentScore;
      const awayScore = g.teamScore === null ? null : g.isHome ? g.opponentScore : g.teamScore;

      rows.push({
        lineNumber: g.lineNumber,
        date,
        homeSchoolId: home,
        awaySchoolId: away,
        homeScore,
        awayScore,
        // A scrimmage must never reach the RPI, which counts regular season only.
        stage: g.gameType === "scrimmage" ? ("scrimmage" as const) : ("regular_season" as const),
      });
    }
  }

  if (rows.length === 0) {
    return { error: "Nothing here resolves to two known schools.", text, sportId, gender, level };
  }

  const result = await commitSchedule(rows, sportId, gender, level);
  return {
    text, sportId, gender, level, year: year ?? undefined,
    committed: {
      created: result.created,
      duplicates: result.duplicates,
      teamsCreated: result.teamsCreated,
      skipped,
    },
  };
}
