import type { Sheet } from "./xlsx.ts";

/**
 * A roster workbook: one tab per school.
 *
 * Each tab carries a title row, a player count, a header row, then players.
 * The header is located by name rather than by position, because a hand-built
 * workbook grows a column sooner or later.
 */

export type RosterPlayer = {
  firstName: string;
  lastName: string;
  jersey: string | null;
  grade: number | null;
  positions: string[];
  heightInches: number | null;
  weightLb: number | null;
  rowNumber: number;
};

export type RosterTeam = {
  sheetName: string;
  /** The school as written in the tab, which may differ from the tab name. */
  schoolName: string;
  players: RosterPlayer[];
  issues: { rowNumber: number; message: string }[];
};

export type RosterParseResult = {
  teams: RosterTeam[];
  skippedSheets: string[];
};

const HEADERS: Record<string, string[]> = {
  firstName: ["first name", "first"],
  lastName: ["last name", "last", "surname"],
  jersey: ["jersey", "no", "no.", "number", "#"],
  grade: ["class", "grade", "year"],
  positions: ["position(s)", "positions", "position", "pos"],
  heightInches: ["height inches", "height (in)", "height in"],
  weightLb: ["weight (lb)", "weight", "weight lb", "wt"],
};

/** "Senior" -> 12. Numeric grades pass through when in range. */
export function parseGrade(raw: string): number | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  const named: Record<string, number> = {
    freshman: 9, fresh: 9, fr: 9,
    sophomore: 10, soph: 10, so: 10,
    junior: 11, jr: 11,
    senior: 12, sr: 12,
    "8th": 8, "8th grade": 8, "7th": 7, "6th": 6,
  };
  if (named[t] !== undefined) return named[t];
  const n = Number(t.replace(/(st|nd|rd|th)\s*grade?$/, "").trim());
  return Number.isInteger(n) && n >= 6 && n <= 12 ? n : null;
}

/** "WR / DB" -> ["WR", "DB"] */
export function parsePositions(raw: string): string[] {
  return raw
    .split(/[/,|]/)
    .map((p) => p.trim().toUpperCase())
    .filter((p) => p !== "" && p.length <= 6);
}

function mapHeaders(row: string[]): Record<string, number> | null {
  const found: Record<string, number> = {};
  row.forEach((raw, i) => {
    const name = raw.trim().toLowerCase();
    for (const [key, aliases] of Object.entries(HEADERS)) {
      if (found[key] === undefined && aliases.includes(name)) found[key] = i;
    }
  });
  // A tab is only a roster if it names people.
  return found.firstName !== undefined && found.lastName !== undefined ? found : null;
}

/** 0 is how these exports write "not recorded"; a 0lb player does not exist. */
const measurement = (raw: string | undefined, min: number, max: number) => {
  const n = Number((raw ?? "").trim());
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null;
};

export function parseRosterWorkbook(sheets: Sheet[]): RosterParseResult {
  const teams: RosterTeam[] = [];
  const skippedSheets: string[] = [];

  for (const sheet of sheets) {
    let headerIndex = -1;
    let headers: Record<string, number> | null = null;
    // The header is within the first few rows: title, count, then headers.
    for (let i = 0; i < Math.min(sheet.rows.length, 8); i++) {
      const mapped = mapHeaders(sheet.rows[i]);
      if (mapped) {
        headerIndex = i;
        headers = mapped;
        break;
      }
    }
    if (!headers || headerIndex === -1) {
      skippedSheets.push(sheet.name);
      continue;
    }

    // The tab's own first cell usually repeats the school name; fall back to
    // the tab name, which is what the directory refers to.
    const titleCell = sheet.rows[0]?.[0]?.trim() ?? "";
    const schoolName =
      titleCell && !mapHeaders(sheet.rows[0]) && !/^player count$/i.test(titleCell)
        ? titleCell
        : sheet.name;

    const players: RosterPlayer[] = [];
    const issues: RosterTeam["issues"] = [];

    for (let i = headerIndex + 1; i < sheet.rows.length; i++) {
      const row = sheet.rows[i];
      const at = (key: string) => {
        const idx = headers![key];
        return idx === undefined ? "" : (row[idx] ?? "").trim();
      };
      const firstName = at("firstName");
      const lastName = at("lastName");
      if (!firstName && !lastName) continue;
      if (!firstName || !lastName) {
        issues.push({
          rowNumber: i + 1,
          message: `Row has only "${firstName || lastName}" — both names are needed.`,
        });
        continue;
      }

      const jersey = at("jersey");
      players.push({
        firstName,
        lastName,
        // Jersey stays a string: "00" and "0" are different players.
        jersey: jersey === "" ? null : jersey,
        grade: parseGrade(at("grade")),
        positions: parsePositions(at("positions")),
        heightInches: measurement(at("heightInches"), 36, 96),
        weightLb: measurement(at("weightLb"), 60, 500),
        rowNumber: i + 1,
      });
    }

    if (players.length === 0) {
      skippedSheets.push(sheet.name);
      continue;
    }
    teams.push({ sheetName: sheet.name, schoolName, players, issues });
  }

  return { teams, skippedSheets };
}
