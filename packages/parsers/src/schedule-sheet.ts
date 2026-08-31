import { parseScheduleDate } from "./schedule.ts";

/**
 * A whole-state schedule export: one row per team per game.
 *
 * This is the shape a schedule system exports rather than the shape a web page
 * prints. Every game appears twice - once on each team's rows - which is
 * expected and handled by the natural key at commit time.
 *
 * Columns are matched by header name, not position, because a spreadsheet
 * gains and loses columns between exports.
 */

export type SheetGame = {
  rowNumber: number;
  school: string;
  opponent: string;
  date: string;
  time: string | null;
  isHome: boolean;
  /** From the export's own result column; cross-checked against the scores. */
  won: boolean | null;
  teamScore: number | null;
  opponentScore: number | null;
  status: "scheduled" | "final" | "canceled" | "forfeit";
  stage: "regular_season" | "scrimmage";
  title: string | null;
};

export type SheetIssue = {
  rowNumber: number;
  severity: "error" | "info";
  code: string;
  message: string;
};

export type SheetParseResult = {
  games: SheetGame[];
  issues: SheetIssue[];
  /** Header names that were found, for showing the user what was understood. */
  headers: Record<string, number>;
};

/** Splits one CSV line, honouring quoted fields containing commas. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(field); field = ""; }
    else field += ch;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

export function parseCsv(text: string): string[][] {
  // A quoted field may contain newlines, so lines cannot simply be split.
  const rows: string[][] = [];
  let line = "";
  let quotes = 0;
  for (const ch of text.replace(/\r\n?/g, "\n")) {
    if (ch === "\n" && quotes % 2 === 0) {
      rows.push(splitCsvLine(line));
      line = "";
      continue;
    }
    if (ch === '"') quotes++;
    line += ch;
  }
  if (line.trim() !== "") rows.push(splitCsvLine(line));
  return rows;
}

/** Header aliases, so a renamed column does not break the import. */
const HEADERS: Record<string, string[]> = {
  school: ["school", "team", "school name"],
  date: ["date", "game date"],
  time: ["time", "game time"],
  venue: ["home/away", "home away", "site", "location"],
  opponent: ["opponent", "opponent name", "vs"],
  result: ["result", "w/l", "outcome"],
  teamScore: ["school score", "team score", "our score", "score for"],
  opponentScore: ["opponent score", "opp score", "score against"],
  status: ["game status", "status"],
  title: ["game title", "title", "notes", "description"],
};

function mapHeaders(header: string[]): Record<string, number> {
  const found: Record<string, number> = {};
  header.forEach((raw, index) => {
    const name = raw.trim().toLowerCase();
    for (const [key, aliases] of Object.entries(HEADERS)) {
      if (found[key] === undefined && aliases.includes(name)) found[key] = index;
    }
  });
  return found;
}

/** Excel writes dates as a day count from 1899-12-30 when saved unformatted. */
function fromExcelSerial(value: string): string | null {
  if (!/^\d{5}(\.\d+)?$/.test(value)) return null;
  const days = Math.floor(Number(value));
  const ms = Date.UTC(1899, 11, 30) + days * 86400000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

const num = (raw: string): number | null => {
  const t = raw.trim();
  return /^\d{1,3}$/.test(t) ? Number(t) : null;
};

export function parseScheduleSheet(text: string): SheetParseResult {
  const rows = parseCsv(text).filter((r) => r.some((c) => c !== ""));
  const issues: SheetIssue[] = [];
  const games: SheetGame[] = [];

  if (rows.length === 0) return { games, issues, headers: {} };

  const headers = mapHeaders(rows[0]);
  for (const required of ["school", "date", "opponent"]) {
    if (headers[required] === undefined) {
      issues.push({
        rowNumber: 1,
        severity: "error",
        code: "missing_column",
        message: `No "${required}" column found. Headers seen: ${rows[0].join(", ")}`,
      });
      return { games, issues, headers };
    }
  }

  const at = (row: string[], key: string) => {
    const i = headers[key];
    return i === undefined ? "" : (row[i] ?? "").trim();
  };

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2; // 1-based, and the header is row 1
    const school = at(row, "school");
    const opponent = at(row, "opponent");
    if (!school) return;

    if (!opponent) {
      issues.push({
        rowNumber, severity: "info", code: "no_opponent",
        message: `${school}: no opponent listed, skipped.`,
      });
      return;
    }
    // "Garrard County / Green County / Southwestern" is a multi-team scrimmage.
    // It is a real event but not a game between two teams, and inventing three
    // pairings would put results in the record that never happened.
    if (opponent.includes("/")) {
      issues.push({
        rowNumber, severity: "info", code: "multi_team",
        message: `${school} vs "${opponent}" lists several opponents, so it is not one game. Skipped.`,
      });
      return;
    }

    const rawDate = at(row, "date");
    const date = fromExcelSerial(rawDate) ?? parseScheduleDate(rawDate);
    if (!date) {
      issues.push({
        rowNumber, severity: "error", code: "bad_date",
        message: `${school}: "${rawDate}" is not a date I can read.`,
      });
      return;
    }

    const venue = at(row, "venue").toLowerCase();
    if (venue !== "vs" && venue !== "at" && venue !== "home" && venue !== "away") {
      issues.push({
        rowNumber, severity: "error", code: "no_venue",
        message: `${school}: "${at(row, "venue")}" is not home or away, so the sides cannot be told apart.`,
      });
      return;
    }
    const isHome = venue === "vs" || venue === "home";

    const teamScore = num(at(row, "teamScore"));
    const opponentScore = num(at(row, "opponentScore"));
    const resultLetter = at(row, "result").toUpperCase();
    let won: boolean | null =
      resultLetter === "W" ? true : resultLetter === "L" ? false : null;

    if (teamScore !== null && opponentScore !== null && teamScore !== opponentScore) {
      const impliedWin = teamScore > opponentScore;
      if (won !== null && won !== impliedWin) {
        issues.push({
          rowNumber, severity: "error", code: "result_disagrees",
          message: `${school} vs ${opponent}: marked "${resultLetter}" but the score is ${teamScore}-${opponentScore}.`,
        });
        return;
      }
      won = impliedWin;
    }

    const rawStatus = at(row, "status").toLowerCase();
    const title = at(row, "title");
    // The export's own word is the only reliable scrimmage marker there is.
    const stage = /scrimmage/i.test(`${title} ${opponent}`) ? "scrimmage" : "regular_season";

    let status: SheetGame["status"];
    if (rawStatus.startsWith("cancel")) status = "canceled";
    else if (rawStatus.startsWith("forfeit")) status = "forfeit";
    else if (teamScore !== null && opponentScore !== null) status = "final";
    else status = "scheduled";

    games.push({
      rowNumber, school, opponent, date,
      time: at(row, "time") || null,
      isHome, won,
      teamScore: status === "canceled" ? null : teamScore,
      opponentScore: status === "canceled" ? null : opponentScore,
      status, stage,
      title: title || null,
    });
  });

  return { games, issues, headers };
}
