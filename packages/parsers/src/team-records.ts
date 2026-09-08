/**
 * Records pasted by a person, in whatever shape they arrive.
 *
 * The out-of-state box asked for "name, wins, losses" and accepted literally
 * that and nothing else. Somebody copying a state association's standings, or
 * typing what they can see, writes "Elder 3-0" or pastes a table row, and got
 * their whole paste rejected as one unrecognised name.
 *
 * So: find the record at the end of the line, and everything before it is the
 * school. That one rule covers commas, tabs, runs of spaces, hyphens, en
 * dashes, markdown table pipes and a trailing note.
 */

export type ParsedRecord = {
  /** As written, so the caller can report it back if it does not match. */
  name: string;
  wins: number;
  losses: number;
  ties: number;
  line: string;
};

export type RecordParseIssue = { line: string; reason: string };

export type TeamRecordParse = {
  records: ParsedRecord[];
  issues: RecordParseIssue[];
};

/** 3-0, 3–0, 3-0-1, 3 - 0, and the same with a colon in front. */
const TRAILING_RECORD =
  /[\s,:|]*(\d{1,3})\s*[-–—/]\s*(\d{1,3})(?:\s*[-–—/]\s*(\d{1,3}))?\s*$/;

/** Name then two or three separate numbers: "Elder, 3, 0" or "Elder 3 0 1". */
const TRAILING_COLUMNS =
  /[\s,|]+(\d{1,3})[\s,|]+(\d{1,3})(?:[\s,|]+(\d{1,3}))?\s*$/;

export function parseTeamRecords(text: string): TeamRecordParse {
  const records: ParsedRecord[] = [];
  const issues: RecordParseIssue[] = [];

  for (const raw of text.split(/\r?\n/)) {
    // Markdown table furniture, and the |---|---| separator row.
    const line = raw.trim().replace(/^\|/, "").replace(/\|$/, "").trim();
    if (!line) continue;
    if (/^[\s|:-]+$/.test(line)) continue;

    // A header row is not a school. Recognised rather than reported, because
    // pasting a table with its header is the normal thing to do.
    if (/^(school|team|name)\b/i.test(line) && !/\d/.test(line)) continue;

    let m = line.match(TRAILING_RECORD);
    if (!m) m = line.match(TRAILING_COLUMNS);
    if (!m) {
      issues.push({ line: raw.trim(), reason: "no record found on this line" });
      continue;
    }

    const name = line.slice(0, m.index).replace(/[\s,:|]+$/, "").trim();
    if (!name) {
      issues.push({ line: raw.trim(), reason: "a record with no school name" });
      continue;
    }

    const wins = Number(m[1]);
    const losses = Number(m[2]);
    const ties = m[3] === undefined ? 0 : Number(m[3]);
    if (wins > 200 || losses > 200 || ties > 200) {
      issues.push({ line: raw.trim(), reason: "those numbers are not a record" });
      continue;
    }

    records.push({ name, wins, losses, ties, line: raw.trim() });
  }

  return { records, issues };
}

/**
 * The name with any trailing state marker removed, so "Elder (OH)" matches a
 * school stored either way. Callers should try the written name first and this
 * as a fallback.
 */
export function nameWithoutState(name: string): string {
  return name.replace(/\s*\([A-Z]{2}\)\s*$/, "").trim();
}
