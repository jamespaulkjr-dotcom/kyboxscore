"use server";

import { previewResults, commitResults, type ResultPlan } from "@kyboxscore/db";
import { parseResultsText, type ResultIssue } from "@kyboxscore/parsers";
import { requireAdmin } from "../../../lib/auth";

export type ResultsState = {
  error?: string;
  text?: string;
  sportId?: number;
  date?: string | null;
  plans?: ResultPlan[];
  issues?: ResultIssue[];
  committed?: {
    applied: number;
    skipped: number;
    failed: { lineNumber: number; reason: string }[];
  };
};

function read(formData: FormData) {
  return {
    text: String(formData.get("text") ?? ""),
    sportId: Number(formData.get("sportId")),
  };
}

async function plan(text: string, sportId: number): Promise<ResultsState> {
  if (!text.trim()) return { error: "Paste a results document first.", text };
  if (!Number.isInteger(sportId) || sportId <= 0) {
    return { error: "Choose a sport.", text };
  }

  const parsed = parseResultsText(text);
  // A date has to come from somewhere: either the heading, or a date column on
  // every row. A table spanning several nights has no single heading date.
  const undated = parsed.rows.filter((r) => !r.date);
  if (!parsed.date && undated.length > 0) {
    return {
      error:
        "I cannot find the date. Either keep the heading line, like “# Kentucky High School Football Scores — September 19, 2026”, or give every row a date in its first column.",
      text,
      sportId,
    };
  }

  const preview = await previewResults(parsed.rows, sportId, parsed.date);
  if ("error" in preview) return { error: preview.error, text, sportId };

  return {
    text,
    sportId,
    date: parsed.date,
    plans: preview.plans,
    issues: parsed.issues,
  };
}

export async function previewResultsAction(
  _prev: ResultsState,
  formData: FormData
): Promise<ResultsState> {
  await requireAdmin("/admin/results");
  const { text, sportId } = read(formData);
  return await plan(text, sportId);
}

export async function commitResultsAction(
  _prev: ResultsState,
  formData: FormData
): Promise<ResultsState> {
  await requireAdmin("/admin/results");
  const { text, sportId } = read(formData);

  // Re-read and re-plan rather than trusting anything the browser sends back:
  // what gets written has to come from the text on the screen.
  const state = await plan(text, sportId);
  if (state.error || !state.plans) return state;

  const committed = await commitResults(state.plans);
  return { ...state, committed };
}
