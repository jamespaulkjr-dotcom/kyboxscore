/**
 * One team's published schedule, as it comes off a schedule site.
 *
 * The shape is a block per game:
 *
 *   Fri Aug 21 7:30 PM    vs
 *   Hancock County High School
 *   Location: John Hardin High School
 *   Football Stadium    Win
 *   16-3
 *   Non-District Game
 *
 * Two things make this harder than it looks.
 *
 * **"L" is overloaded.** It is the abbreviation for Loss and also the marker
 * for a district (league) game, and both appear in the same block. Position is
 * what disambiguates them, never the letter: a result token always sits on the
 * line immediately before a score line, and the game type is always the last
 * line of the block. A block with no score has no result, whatever letters it
 * contains.
 *
 * **There is no year.** Only a weekday, month and day. `inferYear` resolves it
 * by finding the year where every weekday in the document agrees, and refuses
 * when more than one fits.
 */

export type TeamScheduleGame = {
  lineNumber: number;
  weekday: string;
  month: number;
  day: number;
  /** 24h "HH:MM", or null when the source gave no time. */
  time: string | null;
  isHome: boolean;
  opponentName: string;
  venue: string | null;
  /** null when the game has not been played. */
  won: boolean | null;
  teamScore: number | null;
  opponentScore: number | null;
  gameType: "district" | "non_district" | "scrimmage" | null;
  raw: string;
};

export type TeamScheduleIssue = {
  lineNumber: number;
  severity: "error" | "info";
  message: string;
  raw: string;
};

export type TeamScheduleResult = {
  /** From a "This is for X" heading, when present. */
  subjectTeam: string | null;
  games: TeamScheduleGame[];
  issues: TeamScheduleIssue[];
};

/**
 * Several teams in one paste, split on their "This is for X" headings.
 *
 * There are 219 football teams. Pasting them one at a time is the actual cost
 * of this workflow, so anything that can be pasted together should be.
 */
export function parseTeamSchedules(text: string): TeamScheduleResult[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const starts: number[] = [];
  lines.forEach((line, i) => {
    if (SUBJECT.test(line.trim())) starts.push(i);
  });

  if (starts.length <= 1) return [parseTeamSchedule(text)];

  return starts.map((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1] : lines.length;
    const chunk = lines.slice(start, end).join("\n");
    const parsed = parseTeamSchedule(chunk);
    // Line numbers are relative to the chunk; shift them back to the paste so
    // an error points at the line the human is actually looking at.
    return {
      ...parsed,
      games: parsed.games.map((g) => ({ ...g, lineNumber: g.lineNumber + start })),
      issues: parsed.issues.map((i) => ({ ...i, lineNumber: i.lineNumber + start })),
    };
  });
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const HEADER =
  // The trailing marker cannot use \b: "@" is not a word character, so \b
  // never matches after it and every away game silently failed to parse.
  /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+([a-z]{3})[a-z]*\s+(\d{1,2})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm))?\s*(vs|@|at)?(?=\s|$|\()/i;

const SUBJECT = /^this\s+is\s+for\s+(.+?)\s*$/i;
const SCORE = /^(\d{1,3})\s*[-–]\s*(\d{1,3})$/;

/** Annotations in parentheses are stripped when reading a marker token. */
const bare = (line: string) => line.replace(/\([^)]*\)/g, "").trim();

function gameType(line: string): TeamScheduleGame["gameType"] {
  const t = bare(line).toLowerCase();
  if (/^scrimmage\b/.test(t)) return "scrimmage";
  if (/^non[- ]?district\b/.test(t)) return "non_district";
  if (/^district\b/.test(t)) return "district";
  if (/^n$/.test(t)) return "non_district";
  if (/^l$/.test(t)) return "district"; // league, not loss - see the header note
  return null;
}

/** W / Win / L / Loss as the trailing token of a line. */
function resultToken(line: string): boolean | null {
  const t = bare(line);
  const m = /\b(win|won|w|loss|lost|l)\s*$/i.exec(t);
  if (!m) return null;
  return /^(win|won|w)$/i.test(m[1]);
}

export function parseTeamSchedule(text: string): TeamScheduleResult {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const games: TeamScheduleGame[] = [];
  const issues: TeamScheduleIssue[] = [];
  let subjectTeam: string | null = null;

  // Find each block header, then treat everything up to the next one as its body.
  const starts: number[] = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed === "") return;
    const subject = SUBJECT.exec(trimmed);
    if (subject && subjectTeam === null) {
      subjectTeam = subject[1].replace(/\s+$/, "");
      return;
    }
    if (HEADER.test(trimmed)) starts.push(i);
  });

  starts.forEach((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1] : lines.length;
    const raw = lines[start].trim();
    const header = HEADER.exec(raw)!;

    const [, weekday, monthWord, dayStr, hourStr, minStr, meridiem, venueMarker] = header;
    const month = MONTHS[monthWord.toLowerCase()];
    const day = Number(dayStr);
    if (!month || day < 1 || day > 31) {
      issues.push({ lineNumber: start + 1, severity: "error", raw, message: "Unreadable date." });
      return;
    }

    let time: string | null = null;
    if (hourStr && minStr && meridiem) {
      let hour = Number(hourStr) % 12;
      if (meridiem.toLowerCase() === "pm") hour += 12;
      time = `${String(hour).padStart(2, "0")}:${minStr}`;
    }

    if (!venueMarker) {
      issues.push({
        lineNumber: start + 1,
        severity: "error",
        raw,
        message: "No 'vs' or '@', so home and away cannot be told apart.",
      });
      return;
    }
    const isHome = venueMarker.toLowerCase() === "vs";

    const body = lines
      .slice(start + 1, end)
      .map((l) => l.trim())
      .filter((l) => l !== "" && !/^opponent\s+logo$/i.test(l));

    // Opponent: the first body line that is not a location line.
    const opponentLine = body.find((l) => !/^location\s*:/i.test(l));
    if (!opponentLine) {
      issues.push({
        lineNumber: start + 1,
        severity: "error",
        raw,
        message: "No opponent named in this block.",
      });
      return;
    }
    const opponentName = opponentLine.replace(/^opponent\s*:\s*/i, "").trim();

    const locationLine = body.find((l) => /^location\s*:/i.test(l));
    const venue = locationLine
      ? locationLine.replace(/^location\s*:\s*/i, "").trim()
      : null;

    // A score line means the game was played. The result is the trailing token
    // of the line before it - never the last line of the block, which is the
    // game type and may also read "L".
    const scoreIndex = body.findIndex((l) => SCORE.test(bare(l)));
    let won: boolean | null = null;
    let teamScore: number | null = null;
    let opponentScore: number | null = null;

    if (scoreIndex !== -1) {
      const m = SCORE.exec(bare(body[scoreIndex]))!;
      teamScore = Number(m[1]);
      opponentScore = Number(m[2]);
      won = scoreIndex > 0 ? resultToken(body[scoreIndex - 1]) : null;

      if (won === null) {
        // Fall back to the scores themselves rather than guessing from a letter.
        if (teamScore !== opponentScore) won = teamScore > opponentScore;
        issues.push({
          lineNumber: start + 1,
          severity: "info",
          raw,
          message:
            "No win/loss marker found; the result was taken from the score itself.",
        });
      } else if (teamScore !== opponentScore && won !== teamScore > opponentScore) {
        issues.push({
          lineNumber: start + 1,
          severity: "error",
          raw,
          message: `The result marker and the score disagree (${teamScore}-${opponentScore} marked as a ${won ? "win" : "loss"}).`,
        });
        return;
      }
    }

    const type = body.length > 0 ? gameType(body[body.length - 1]) : null;

    games.push({
      lineNumber: start + 1,
      weekday,
      month,
      day,
      time,
      isHome,
      opponentName,
      venue,
      won,
      teamScore,
      opponentScore,
      gameType: type,
      raw,
    });
  });

  return { subjectTeam, games, issues };
}

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/**
 * Resolves the missing year from the weekdays.
 *
 * A published schedule gives "Fri Aug 21" and nothing else. Across a dozen
 * games only one year usually fits every weekday, which is a check rather than
 * a guess. Ambiguity is returned, never resolved by picking the nearest.
 */
export function inferYear(
  games: TeamScheduleGame[],
  candidates: number[]
): { year: number | null; candidates: number[] } {
  const dated = games.filter((g) => g.weekday);
  if (dated.length === 0) return { year: null, candidates: [] };

  const fits = candidates.filter((year) =>
    dated.every((g) => {
      const d = new Date(Date.UTC(year, g.month - 1, g.day));
      if (d.getUTCMonth() !== g.month - 1 || d.getUTCDate() !== g.day) return false;
      // getUTCDay: 0 = Sunday.
      const index = (d.getUTCDay() + 6) % 7;
      return WEEKDAYS[index] === g.weekday.slice(0, 3).toLowerCase();
    })
  );

  return { year: fits.length === 1 ? fits[0] : null, candidates: fits };
}
