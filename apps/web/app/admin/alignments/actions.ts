"use server";

import {
  commitAlignments,
  matchSchoolNames,
  type SchoolMatch,
} from "@kyboxscore/db";
import {
  parseAlignmentText,
  type AlignmentIssue,
} from "@kyboxscore/parsers";
import { requireAdmin } from "../../../lib/auth";

const GENDERS = new Set(["boys", "girls", "coed"]);
const LEVELS = new Set(["varsity", "jv", "freshman", "middle_school"]);

export type AlignPreviewRow = {
  lineNumber: number;
  classOrdinal: number;
  districtNumber: number;
  match: SchoolMatch;
};

export type AlignState = {
  error?: string;
  text?: string;
  sportId?: number;
  gender?: string;
  level?: string;
  rows?: AlignPreviewRow[];
  issues?: AlignmentIssue[];
  withdrawn?: string[];
  committed?: {
    assigned: number;
    unchanged: number;
    teamsCreated: number;
    failed: { lineNumber: number; schoolName: string; reason: string }[];
  };
};

function readCommon(formData: FormData) {
  return {
    text: String(formData.get("text") ?? ""),
    sportId: Number(formData.get("sportId")),
    gender: String(formData.get("gender") ?? "boys"),
    level: String(formData.get("level") ?? "varsity"),
  };
}

export async function previewAlignmentsAction(
  _prev: AlignState,
  formData: FormData
): Promise<AlignState> {
  await requireAdmin("/admin/alignments");
  const { text, sportId, gender, level } = readCommon(formData);

  if (!text.trim()) return { error: "Paste an alignment first.", text };
  if (!Number.isInteger(sportId) || sportId <= 0) return { error: "Choose a sport.", text };
  if (!GENDERS.has(gender) || !LEVELS.has(level)) {
    return { error: "Choose a valid gender and level.", text };
  }

  const parsed = parseAlignmentText(text);
  const matches = await matchSchoolNames(parsed.rows.map((r) => r.schoolName));
  const byInput = new Map(matches.map((m) => [m.input.toLowerCase(), m]));

  const rows: AlignPreviewRow[] = parsed.rows.map((r) => ({
    lineNumber: r.lineNumber,
    classOrdinal: r.classOrdinal,
    districtNumber: r.districtNumber,
    match:
      byInput.get(r.schoolName.trim().toLowerCase()) ?? {
        input: r.schoolName,
        schoolId: null,
        schoolName: null,
        method: "unmatched" as const,
        confidence: null,
        candidates: [],
      },
  }));

  return {
    text, sportId, gender, level, rows,
    issues: parsed.issues,
    withdrawn: parsed.withdrawn,
  };
}

export async function commitAlignmentsAction(
  _prev: AlignState,
  formData: FormData
): Promise<AlignState> {
  await requireAdmin("/admin/alignments");
  const { text, sportId, gender, level } = readCommon(formData);
  if (!Number.isInteger(sportId) || sportId <= 0) return { error: "Choose a sport.", text };

  // Re-parse and re-match rather than trusting a round trip through the
  // browser: what gets written comes from the text the user can see.
  const parsed = parseAlignmentText(text);
  const matches = await matchSchoolNames(parsed.rows.map((r) => r.schoolName));
  const byInput = new Map(matches.map((m) => [m.input.toLowerCase(), m]));

  const targets = parsed.rows.flatMap((r) => {
    const m = byInput.get(r.schoolName.trim().toLowerCase());
    if (!m?.schoolId) return [];
    return [{
      lineNumber: r.lineNumber,
      schoolId: m.schoolId,
      schoolName: m.schoolName ?? r.schoolName,
      classOrdinal: r.classOrdinal,
      districtNumber: r.districtNumber,
    }];
  });

  if (targets.length === 0) {
    return { error: "Nothing here resolves to a known school.", text, sportId, gender, level };
  }

  const committed = await commitAlignments(targets, sportId, gender, level);
  return { text, sportId, gender, level, committed };
}
