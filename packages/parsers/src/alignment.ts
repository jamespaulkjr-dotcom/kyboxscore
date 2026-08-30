/**
 * KHSAA football alignment parser.
 *
 * Reads the block format KHSAA publishes and coaches circulate:
 *
 *   Class 1A
 *   District 1- Ballard Memorial, Caverna, Fulton County, Russellville
 *   District 2- Bethlehem, Campbellsville, ...
 *
 * KHSAA realigns every two years on school population, so this block is
 * re-pasted each cycle rather than entered once. It arrives with prose mixed
 * in - playoff cross-bracketing notes, withdrawal lists - and with typos:
 * "District -8" for "District 8-" is in the real 2026 document.
 *
 * Anything not recognised is reported rather than dropped, so a school cannot
 * go missing silently between the paste and the database.
 */

export type AlignmentRow = {
  lineNumber: number;
  schoolName: string;
  classOrdinal: number;
  districtNumber: number;
  raw: string;
};

export type AlignmentIssue = {
  lineNumber: number;
  severity: "error" | "info";
  message: string;
  raw: string;
};

export type AlignmentParseResult = {
  rows: AlignmentRow[];
  issues: AlignmentIssue[];
  /** Schools listed as not fielding a team this cycle. */
  withdrawn: string[];
};

const CLASS_LINE = /^class\s*([1-6])\s*a\s*$/i;
// Tolerates "District 1-", "District 1 -", "District -8", "District 8:".
const DISTRICT_LINE = /^district\s*-?\s*([0-9]{1,2})\s*[-:]?\s*(.+)$/i;
const WITHDRAWN_LINE = /^withdrawn\s+from\s+play\s*[-:]?\s*(.+)$/i;

/** "3A", "Class 3A", "3" -> 3. KHSAA football is 1A through 6A only. */
export function parseClass(raw: string): number | null {
  const m = /^(?:class\s*)?([1-6])\s*a?$/i.exec(raw.trim());
  return m ? Number(m[1]) : null;
}

/** "District 4", "D4", "4" -> 4 */
export function parseDistrict(raw: string): number | null {
  const m = /^(?:d(?:ist(?:rict)?)?\.?\s*)?([1-9][0-9]?)$/i.exec(raw.trim());
  return m ? Number(m[1]) : null;
}

function splitSchools(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

export function parseAlignmentText(text: string): AlignmentParseResult {
  const rows: AlignmentRow[] = [];
  const issues: AlignmentIssue[] = [];
  const withdrawn: string[] = [];

  let currentClass: number | null = null;

  for (const [index, rawLine] of text.replace(/\r\n?/g, "\n").split("\n").entries()) {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const classMatch = CLASS_LINE.exec(line);
    if (classMatch) {
      currentClass = Number(classMatch[1]);
      continue;
    }

    const withdrawnMatch = WITHDRAWN_LINE.exec(line);
    if (withdrawnMatch) {
      const names = splitSchools(withdrawnMatch[1]);
      withdrawn.push(...names);
      issues.push({
        lineNumber,
        severity: "info",
        raw: line,
        message: `${names.length} school${names.length === 1 ? "" : "s"} withdrawn from play; not assigned.`,
      });
      continue;
    }

    const districtMatch = DISTRICT_LINE.exec(line);
    if (districtMatch) {
      if (currentClass === null) {
        issues.push({
          lineNumber,
          severity: "error",
          raw: line,
          message: "A district appeared before any class heading.",
        });
        continue;
      }
      const districtNumber = Number(districtMatch[1]);
      const schools = splitSchools(districtMatch[2]);
      if (schools.length === 0) {
        issues.push({
          lineNumber,
          severity: "error",
          raw: line,
          message: "District line lists no schools.",
        });
        continue;
      }
      for (const schoolName of schools) {
        rows.push({
          lineNumber,
          schoolName,
          classOrdinal: currentClass,
          districtNumber,
          raw: line,
        });
      }
      continue;
    }

    // Prose: cross-bracketing notes and the like. Reported, never silently
    // swallowed, so nothing can go missing between the paste and the database.
    issues.push({
      lineNumber,
      severity: "info",
      raw: line,
      message: "Not a class or district line; ignored.",
    });
  }

  return { rows, issues, withdrawn };
}
