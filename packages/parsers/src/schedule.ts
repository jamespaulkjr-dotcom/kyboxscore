/**
 * Schedule paste parser.
 *
 * Schedules arrive as a block of text a human copied from somewhere they are
 * entitled to use. The format is deliberately forgiving about separators and
 * date styles, and deliberately strict about ambiguity: anything it cannot
 * read with confidence becomes an issue on that line rather than a guess.
 *
 * Expected shape, one game per line:
 *
 *   2026-08-21, John Hardin, Central Hardin
 *   2026-08-21 | John Hardin | Central Hardin | 21 | 14
 *   8/21/2026  John Hardin  TAB  Central Hardin
 *
 * Home team first. Scores optional; both or neither.
 */

export type ScheduleRow = {
  lineNumber: number;
  date: string; // ISO yyyy-mm-dd
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
  raw: string;
};

export type ScheduleIssue = {
  lineNumber: number;
  message: string;
  raw: string;
};

export type ScheduleParseResult = {
  rows: ScheduleRow[];
  issues: ScheduleIssue[];
};

/** Splits on tab, pipe, or comma - whichever the pasted text actually uses. */
function splitFields(line: string): string[] {
  const separator = line.includes("\t") ? "\t" : line.includes("|") ? "|" : ",";
  return line.split(separator).map((f) => f.trim());
}

/**
 * Accepts ISO and US styles. A two-digit year is refused rather than guessed:
 * "8/21/26" could be 1926 and a schedule in the wrong century is worse than a
 * line the human has to fix.
 */
export function parseScheduleDate(raw: string): string | null {
  const s = raw.trim();

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) {
    const [, y, m, d] = iso;
    return valid(Number(y), Number(m), Number(d));
  }

  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (us) {
    const [, m, d, y] = us;
    return valid(Number(y), Number(m), Number(d));
  }

  return null;
}

function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Rejects 31 February and friends: Date rolls them forward silently.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseScore(raw: string | undefined): number | null | "bad" {
  if (raw === undefined || raw === "") return null;
  if (!/^\d{1,3}$/.test(raw)) return "bad";
  return Number(raw);
}

export function parseScheduleText(text: string): ScheduleParseResult {
  const rows: ScheduleRow[] = [];
  const issues: ScheduleIssue[] = [];

  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;

    const fields = splitFields(line).filter((f, i, arr) =>
      // A trailing separator leaves an empty last field; drop only that.
      !(f === "" && i === arr.length - 1)
    );

    if (fields.length < 3) {
      issues.push({
        lineNumber,
        raw: line,
        message: "Needs at least a date, a home team and an away team.",
      });
      return;
    }

    const date = parseScheduleDate(fields[0]);
    if (!date) {
      issues.push({
        lineNumber,
        raw: line,
        message: `"${fields[0]}" is not a date I can read. Use 2026-08-21 or 8/21/2026.`,
      });
      return;
    }

    const homeName = fields[1];
    const awayName = fields[2];
    if (!homeName || !awayName) {
      issues.push({ lineNumber, raw: line, message: "Both team names are required." });
      return;
    }
    if (homeName.toLowerCase() === awayName.toLowerCase()) {
      issues.push({ lineNumber, raw: line, message: "A team cannot play itself." });
      return;
    }

    const homeScore = parseScore(fields[3]);
    const awayScore = parseScore(fields[4]);
    if (homeScore === "bad" || awayScore === "bad") {
      issues.push({
        lineNumber,
        raw: line,
        message: "Scores must be whole numbers.",
      });
      return;
    }
    // One score without the other is a typo, not a result.
    if ((homeScore === null) !== (awayScore === null)) {
      issues.push({
        lineNumber,
        raw: line,
        message: "Give both scores or neither.",
      });
      return;
    }

    rows.push({
      lineNumber,
      date,
      homeName,
      awayName,
      homeScore,
      awayScore,
      raw: line,
    });
  });

  return { rows, issues };
}
