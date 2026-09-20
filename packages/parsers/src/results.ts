/**
 * Results paste parser.
 *
 * Reads the nightly scores document as it is actually written: a markdown
 * document with a date in the heading and one pipe table per section. It is
 * the counterpart to the schedule parser, and the two differ in one important
 * way, so it is worth saying plainly:
 *
 *   the schedule paste is HOME first, this one is AWAY first,
 *
 * because that is the order the scores document uses and rewriting the
 * document to suit the parser is the wrong way round.
 *
 * Shapes it reads, away team always first:
 *
 *   | Warren Central | 47 | Ohio County | 7 |          a final
 *   | Atherton | 7 | Eastern | 0 | Suspended; ... |    a score with a status
 *   | Ballard | Fern Creek | Postponed |               a status, no score
 *   | Seneca | North Oldham | Rescheduled for September 21 at 6:00 p.m. |
 *   | Fairdale | Spencer County | Played September 19; Fairdale won 35-34 |
 *   | Hazard | Campbellsville | 6:00 p.m. |            an upcoming kick-off
 *   | Bellevue | Iroquois |                            named, no result yet
 *
 * A row that moves to another date says so in its own text, which is why a
 * single paste can both settle last night and rearrange the week.
 *
 * Anything it cannot read with confidence becomes an issue on that line. It
 * never guesses a score, a date or a winner.
 */

export type ResultOutcome =
  | { kind: "score"; awayScore: number; homeScore: number; final: boolean }
  | { kind: "status"; status: "postponed" | "canceled" | "forfeit" | "scheduled" }
  | { kind: "none" };

export type ResultRow = {
  lineNumber: number;
  awayName: string;
  homeName: string;
  /** An ISO date the row says the game moved to, or null to leave it alone. */
  moveTo: string | null;
  /** A kick-off time as HH:MM:SS, or null. */
  time: string | null;
  outcome: ResultOutcome;
  /** The status prose as written, kept so the preview can show the source. */
  note: string | null;
  raw: string;
};

export type ResultIssue = {
  lineNumber: number;
  message: string;
  raw: string;
};

export type ResultParseResult = {
  /** The date in the document heading. Rows use it unless they move. */
  date: string | null;
  rows: ResultRow[];
  issues: ResultIssue[];
};

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "September 19, 2026" and "September 19". Without a year it takes the fallback. */
export function parseLongDate(raw: string, fallbackYear: number | null): string | null {
  const m = /([a-z]+)\s+(\d{1,2})(?:\s*,\s*(\d{4}))?/i.exec(raw);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month < 0) return null;
  const year = m[3] ? Number(m[3]) : fallbackYear;
  if (!year) return null;
  return iso(year, month + 1, Number(m[2]));
}

/**
 * Finds a time of day inside prose, as "rescheduled for September 21 at 6:30
 * p.m." writes it, and returns it as HH:MM:SS.
 *
 * Distinct from parseClockTime in the schedule sheet parser, which reads a
 * whole cell that is nothing but a time.
 */
export function findClockTime(raw: string): string | null {
  const m = /(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?/i.exec(raw);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  const pm = m[3].toLowerCase() === "p";
  if (hour === 12) hour = 0;
  if (pm) hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[.\u2019']/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Is this the table's own header or its |---| rule? */
function isTableFurniture(cells: string[]): boolean {
  if (cells.every((c) => /^:?-{2,}:?$/.test(c))) return true;
  const first = norm(cells[0] ?? "");
  return first === "away team" || first === "away" || first === "team";
}

/**
 * Reads the status prose. Returns what to do with the game, plus any date or
 * time it mentions. The winner-named form carries the score by team name
 * rather than by side, so both names are needed to place it.
 */
function readStatus(
  text: string,
  awayName: string,
  homeName: string,
  fallbackYear: number | null
): { outcome: ResultOutcome; moveTo: string | null; time: string | null } | { error: string } {
  const t = text.trim();
  const lower = t.toLowerCase();
  const time = findClockTime(t);

  // "Played September 19; Fairdale won 35-34"
  const played = /\bplayed\b([^;]*);?\s*(.*?)\s+won\s+(\d{1,3})\s*[-\u2013]\s*(\d{1,3})/i.exec(t);
  if (played) {
    const when = parseLongDate(played[1], fallbackYear);
    const winner = norm(played[2]);
    const a = norm(awayName);
    const h = norm(homeName);
    const high = Number(played[3]);
    const low = Number(played[4]);
    if (high < low) {
      return { error: `"${t}" puts the winner's score second. Write the winning score first.` };
    }
    let awayScore: number, homeScore: number;
    if (winner === a || winner.startsWith(a) || a.startsWith(winner)) {
      awayScore = high;
      homeScore = low;
    } else if (winner === h || winner.startsWith(h) || h.startsWith(winner)) {
      homeScore = high;
      awayScore = low;
    } else {
      return { error: `"${played[2].trim()}" is neither team on this line.` };
    }
    return {
      outcome: { kind: "score", awayScore, homeScore, final: true },
      moveTo: when,
      time,
    };
  }

  // A date the row moves to, however it is introduced.
  const moved = /\b(?:postponed to|rescheduled (?:for|to)|moved to|played)\b\s*([a-z]+\s+\d{1,2}(?:\s*,\s*\d{4})?)/i.exec(t);
  const moveTo = moved ? parseLongDate(moved[1], fallbackYear) : null;
  if (moved && !moveTo) {
    return { error: `"${moved[1].trim()}" is not a date I can read.` };
  }

  // Order matters: "canceled; ruled no contest" is a cancellation, and
  // "suspended" outranks the resume date that follows it.
  if (/\bno contest\b|\bcancell?ed\b/.test(lower)) {
    return { outcome: { kind: "status", status: "canceled" }, moveTo: null, time: null };
  }
  if (/\bforfeit/.test(lower)) {
    return { outcome: { kind: "status", status: "forfeit" }, moveTo, time };
  }
  if (/\bsuspended\b/.test(lower)) {
    // No "suspended" status exists; a suspended game is one still in progress.
    return { outcome: { kind: "none" }, moveTo: null, time: null };
  }
  if (/\bpostponed\b/.test(lower)) {
    // Postponed with a new date is a rearrangement, so it goes back on the
    // calendar as scheduled rather than sitting there saying postponed.
    return {
      outcome: { kind: "status", status: moveTo ? "scheduled" : "postponed" },
      moveTo,
      time,
    };
  }
  if (/\brescheduled\b|\bmoved to\b/.test(lower)) {
    return { outcome: { kind: "status", status: "scheduled" }, moveTo, time };
  }
  // A bare kick-off time, as the upcoming table writes it.
  if (time && /^[\d:\s.apm]+$/i.test(t)) {
    return { outcome: { kind: "none" }, moveTo: null, time };
  }
  if (/\bresult pending\b|\bnot confirmed\b|\bnot reported\b|\bin progress\b/.test(lower)) {
    return { outcome: { kind: "none" }, moveTo, time };
  }

  return { error: `I cannot tell what "${t}" means for this game.` };
}

function parseScore(raw: string): number | null {
  return /^\d{1,3}$/.test(raw.trim()) ? Number(raw.trim()) : null;
}

export function parseResultsText(
  text: string,
  options: { defaultYear?: number } = {}
): ResultParseResult {
  const rows: ResultRow[] = [];
  const issues: ResultIssue[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  // The heading date is the document's subject and every row's default.
  let docDate: string | null = null;
  for (const line of lines) {
    if (/^#\s/.test(line.trim())) {
      docDate = parseLongDate(line, options.defaultYear ?? null);
      if (docDate) break;
    }
  }
  const year = docDate ? Number(docDate.slice(0, 4)) : options.defaultYear ?? null;

  // Rows under this heading are in progress rather than final.
  let sectionIsLive = false;

  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    const line = raw.trim();
    if (line === "") return;

    if (line.startsWith("#")) {
      sectionIsLive = /\bin progress\b|\bsuspended\b/i.test(line);
      return;
    }
    // Only pipe tables carry games. Prose, counts and bylines are ignored.
    if (!line.startsWith("|")) return;

    const cells = line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());

    if (isTableFurniture(cells)) return;

    const push = (
      awayName: string,
      homeName: string,
      outcome: ResultOutcome,
      moveTo: string | null,
      time: string | null,
      note: string | null
    ) => {
      if (!awayName || !homeName) {
        issues.push({ lineNumber, raw: line, message: "Both team names are required." });
        return;
      }
      if (norm(awayName) === norm(homeName)) {
        issues.push({ lineNumber, raw: line, message: "A team cannot play itself." });
        return;
      }
      rows.push({ lineNumber, awayName, homeName, moveTo, time, outcome, note, raw: line });
    };

    // | Away | 7 | Home | 0 | and | Away | 7 | Home | 0 | status |
    if (cells.length >= 4) {
      const awayScore = parseScore(cells[1]);
      const homeScore = parseScore(cells[3]);
      if (awayScore !== null && homeScore !== null) {
        const trailing = cells.slice(4).join("; ").trim();
        let outcome: ResultOutcome = {
          kind: "score",
          awayScore,
          homeScore,
          final: !sectionIsLive,
        };
        let moveTo: string | null = null;
        let time: string | null = null;
        if (trailing) {
          const read = readStatus(trailing, cells[0], cells[2], year);
          if ("error" in read) {
            issues.push({ lineNumber, raw: line, message: read.error });
            return;
          }
          moveTo = read.moveTo;
          time = read.time;
          // A trailing status that names its own result wins; otherwise the
          // scores stand and the status only says how finished they are.
          if (read.outcome.kind === "score") {
            outcome = read.outcome;
          } else if (read.outcome.kind === "status") {
            outcome = read.outcome;
          } else {
            outcome = { kind: "score", awayScore, homeScore, final: false };
          }
        }
        push(cells[0], cells[2], outcome, moveTo, time, trailing || null);
        return;
      }
      // Four or more cells where the score positions are not numbers is a
      // malformed score row, not a status row.
      issues.push({
        lineNumber,
        raw: line,
        message: "This looks like a score row, but the scores are not whole numbers.",
      });
      return;
    }

    // | Away | Home | status |
    if (cells.length === 3) {
      const read = readStatus(cells[2], cells[0], cells[1], year);
      if ("error" in read) {
        issues.push({ lineNumber, raw: line, message: read.error });
        return;
      }
      push(cells[0], cells[1], read.outcome, read.moveTo, read.time, cells[2] || null);
      return;
    }

    // | Away | Home |  - named with nothing to record.
    if (cells.length === 2) {
      push(cells[0], cells[1], { kind: "none" }, null, null, null);
      return;
    }

    issues.push({
      lineNumber,
      raw: line,
      message: "I need an away team and a home team on each row.",
    });
  });

  return { date: docDate, rows, issues };
}
