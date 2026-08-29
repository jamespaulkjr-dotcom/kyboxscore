/**
 * MaxPreps .txt parser.
 *
 * Written against a real GameChanger export
 * (fixtures/gamechanger-baseball-game.txt, cross-validated field by field
 * against the PDF box score of the same game). Hudl emits the same format.
 *
 * Shape:
 *   line 1  vendor game id (a UUID)
 *   line 2  pipe-delimited column names
 *   line 3+ one pipe-delimited row per player, keyed by JERSEY
 *
 * Three properties drive the whole import design:
 *
 *   1. There are no player names. Rows are identified by jersey number only,
 *      so matching is jersey-to-roster, not fuzzy name matching. A file
 *      cannot create players; the roster has to exist first.
 *   2. There is no team, opponent or date anywhere in the file. One file is
 *      ONE team's half of the box score. Which game it belongs to has to come
 *      from the filename or from the coach at upload time.
 *   3. Jerseys are strings. "00" and "0" are different players.
 */

export type Severity = "info" | "warning" | "error";

export type ParseIssue = {
  severity: Severity;
  code: string;
  message: string;
  line?: number;
};

export type PlayerRow = {
  lineNumber: number;
  jersey: string;
  /** Column name -> value. Blank cells are absent, not zero. */
  values: Record<string, number>;
  /** True when the row carried a jersey and nothing else. */
  didNotPlay: boolean;
  /** Pitching block present (the trailing columns are filled). */
  pitched: boolean;
  raw: string;
};

export type ParseResult = {
  vendorGameId: string | null;
  columns: string[];
  rows: PlayerRow[];
  issues: ParseIssue[];
  /** False when nothing usable came out; the caller must not commit. */
  ok: boolean;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Columns from index 18 on are the pitching block in the observed export. */
const PITCHING_COLUMNS = new Set([
  "EarnedRuns",
  "RunsAgainst",
  "HomeRunsAgainst",
  "BattersFaced",
  "BattersStruckOut",
  "BaseOnBallsAgainst",
  "HitsAgainst",
  "HitBatter",
  "WildPitches",
  "Appearances",
  "InningsPitched",
  "PartialInningPitched",
  "NumberOfPitches",
]);

export function parseMaxPrepsTxt(input: string): ParseResult {
  const issues: ParseIssue[] = [];
  const add = (severity: Severity, code: string, message: string, line?: number) =>
    issues.push({ severity, code, message, line });

  // Strip a BOM and normalise line endings; exports have been seen with both.
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");

  // Trailing blank lines are normal and are not worth reporting.
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();

  if (lines.length < 2) {
    add("error", "empty_file", "File has no header row.");
    return { vendorGameId: null, columns: [], rows: [], issues, ok: false };
  }

  let cursor = 0;
  let vendorGameId: string | null = null;
  if (!lines[0].includes("|")) {
    const candidate = lines[0].trim();
    if (UUID_RE.test(candidate)) {
      vendorGameId = candidate;
    } else if (candidate) {
      add(
        "warning",
        "unrecognised_id_line",
        `First line is not a vendor game id and has no columns: ${truncate(candidate)}`,
        1
      );
    }
    cursor = 1;
  }

  const columns = lines[cursor].split("|").map((c) => c.trim());
  const headerLine = cursor + 1;
  cursor += 1;

  if (columns[0] !== "Jersey") {
    add(
      "error",
      "unexpected_header",
      `Expected the first column to be "Jersey", found "${columns[0]}".`,
      headerLine
    );
    return { vendorGameId, columns, rows: [], issues, ok: false };
  }

  const seen = new Map<string, number>();
  const rows: PlayerRow[] = [];

  for (let i = cursor; i < lines.length; i++) {
    const raw = lines[i];
    const lineNumber = i + 1;
    if (raw.trim() === "") continue;

    const cells = raw.split("|");
    if (cells.length !== columns.length) {
      add(
        "error",
        "column_count_mismatch",
        `Row has ${cells.length} fields, header has ${columns.length}. Row skipped.`,
        lineNumber
      );
      continue;
    }

    // Jersey stays a string: "00" is not "0".
    const jersey = cells[0].trim();
    if (jersey === "") {
      add("error", "missing_jersey", "Row has no jersey number. Row skipped.", lineNumber);
      continue;
    }

    const previous = seen.get(jersey);
    if (previous !== undefined) {
      add(
        "warning",
        "duplicate_jersey",
        `Jersey ${jersey} already appeared on line ${previous}. Both rows need a coach to resolve which player is which.`,
        lineNumber
      );
    } else {
      seen.set(jersey, lineNumber);
    }

    const values: Record<string, number> = {};
    let bad = false;
    for (let c = 1; c < columns.length; c++) {
      const cell = cells[c].trim();
      if (cell === "") continue; // blank is absent, not zero
      const n = Number(cell);
      if (!Number.isFinite(n)) {
        add(
          "error",
          "non_numeric_value",
          `Jersey ${jersey}: column "${columns[c]}" is "${truncate(cell)}", which is not a number.`,
          lineNumber
        );
        bad = true;
        continue;
      }
      if (n < 0) {
        add(
          "warning",
          "negative_value",
          `Jersey ${jersey}: column "${columns[c]}" is negative (${n}).`,
          lineNumber
        );
      }
      values[columns[c]] = n;
    }
    if (bad) continue;

    const pitched = Object.keys(values).some((k) => PITCHING_COLUMNS.has(k));
    rows.push({
      lineNumber,
      jersey,
      values,
      didNotPlay: Object.keys(values).length === 0,
      pitched,
      raw,
    });
  }

  if (rows.length === 0) {
    add("error", "no_rows", "No usable player rows were found.");
  }

  return { vendorGameId, columns, rows, issues, ok: rows.length > 0 };
}

/** Innings pitched are split across two columns: 6 and 2 means 6.2, i.e. 6⅔. */
export function inningsPitched(row: PlayerRow): number | null {
  const whole = row.values["InningsPitched"];
  const partial = row.values["PartialInningPitched"];
  if (whole === undefined && partial === undefined) return null;
  return (whole ?? 0) + (partial ?? 0) / 3;
}

/** "6.2" as a box score prints it, rather than 6.667. */
export function formatInningsPitched(row: PlayerRow): string | null {
  const whole = row.values["InningsPitched"];
  const partial = row.values["PartialInningPitched"];
  if (whole === undefined && partial === undefined) return null;
  return `${whole ?? 0}.${partial ?? 0}`;
}

/**
 * Best-effort team names from the filename, which is the only place they
 * appear. GameChanger writes "<Away> Varsity_vs_<Home>.txt". This is a hint
 * for the import preview, never a source of truth - the coach confirms.
 */
export function parseFilename(filename: string): {
  away: string | null;
  home: string | null;
} {
  const base = filename.replace(/\.[^.]+$/, "");
  const m = base.split(/_vs_?/i);
  if (m.length !== 2) return { away: null, home: null };
  const clean = (s: string) =>
    s.replace(/\b(varsity|jv|junior varsity|freshman)\b/gi, "").replace(/\s+/g, " ").trim() ||
    null;
  return { away: clean(m[0]), home: clean(m[1]) };
}

function truncate(s: string, n = 40) {
  return s.length > n ? `${s.slice(0, n)}...` : s;
}
