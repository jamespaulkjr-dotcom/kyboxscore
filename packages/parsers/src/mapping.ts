import type { PlayerRow } from "./maxpreps.ts";

/**
 * MaxPreps export column -> our stat_definition key.
 *
 * Everything the export provides is mapped. Columns we cannot yet place go to
 * `UNMAPPED` so an import reports them rather than dropping them silently.
 */
export const BASEBALL_COLUMN_MAP: Record<string, string> = {
  // batting
  Hits: "h",
  Singles: "singles",
  Doubles: "doubles",
  Triples: "triples",
  HomeRuns: "hr",
  RunsBattedIn: "rbi",
  Runs: "r",
  AtBats: "ab",
  BaseOnBalls: "bb",
  StruckOut: "so",
  HitByPitch: "hbp",
  FieldersChoice: "fc",
  StolenBase: "sb",
  StolenBaseAttempts: "sb_att",
  ReachedOnError: "roe",
  SacrificeBunt: "sac_bunt",
  SacrificeFly: "sac_fly",
  // pitching
  EarnedRuns: "er",
  RunsAgainst: "r_allowed",
  HomeRunsAgainst: "hr_allowed",
  BattersFaced: "bf",
  BattersStruckOut: "k",
  BaseOnBallsAgainst: "bb_allowed",
  HitsAgainst: "h_allowed",
  HitBatter: "hbp_allowed",
  WildPitches: "wp",
  Appearances: "appearances",
  NumberOfPitches: "pitches",
  // InningsPitched and PartialInningPitched are combined into ip_outs below
  // rather than mapped one for one.
};

const INNINGS_COLUMNS = new Set(["InningsPitched", "PartialInningPitched"]);

export type MappedRow = {
  jersey: string;
  lineNumber: number;
  stats: Record<string, number>;
  didNotPlay: boolean;
  unmapped: string[];
};

/**
 * Convert a parsed row into our stat keys.
 *
 * Innings become outs: "6.2" in a box score means six innings and two thirds,
 * so 6 * 3 + 2 = 20 outs. Storing outs keeps ERA and WHIP exact and lets the
 * display convert back; storing 6.2 as a decimal would be arithmetically
 * wrong and storing 6.667 would drift.
 */
export function mapBaseballRow(row: PlayerRow): MappedRow {
  const stats: Record<string, number> = {};
  const unmapped: string[] = [];

  for (const [column, value] of Object.entries(row.values)) {
    if (INNINGS_COLUMNS.has(column)) continue;
    const key = BASEBALL_COLUMN_MAP[column];
    if (!key) {
      unmapped.push(column);
      continue;
    }
    stats[key] = value;
  }

  const whole = row.values["InningsPitched"];
  const partial = row.values["PartialInningPitched"];
  if (whole !== undefined || partial !== undefined) {
    stats.ip_outs = (whole ?? 0) * 3 + (partial ?? 0);
  }

  return {
    jersey: row.jersey,
    lineNumber: row.lineNumber,
    stats,
    didNotPlay: row.didNotPlay,
    unmapped,
  };
}

/**
 * Team-level sanity check on innings pitched.
 *
 * Observed in the very first real export we received: GameChanger wrote
 * InningsPitched=0, PartialInningPitched=0 for a relief pitcher whose own PDF
 * box score shows 0.2 IP. Every other column for that pitcher matched the PDF
 * exactly, so the counting stats are trustworthy and the innings are not.
 *
 * The reconciliation is against the innings the OPPOSING team actually batted,
 * which comes from the game, not the file. A mismatch is surfaced to the coach
 * in the import preview; it is never silently corrected, because we cannot know
 * which pitcher the missing outs belong to.
 */
export function reconcileTeamPitching(
  rows: MappedRow[],
  opponentInningsBatted: number | null
): { outsRecorded: number; outsExpected: number | null; discrepancy: number | null } {
  const outsRecorded = rows.reduce((s, r) => s + (r.stats.ip_outs ?? 0), 0);
  if (opponentInningsBatted === null) {
    return { outsRecorded, outsExpected: null, discrepancy: null };
  }
  const outsExpected = Math.round(opponentInningsBatted * 3);
  return { outsRecorded, outsExpected, discrepancy: outsRecorded - outsExpected };
}

/** Innings as a box score prints them: 20 outs -> "6.2". */
export function outsToInnings(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}
