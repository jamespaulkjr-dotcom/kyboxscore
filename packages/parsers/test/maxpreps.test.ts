import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  parseMaxPrepsTxt,
  inningsPitched,
  formatInningsPitched,
  parseFilename,
} from "../src/maxpreps.ts";

const FIXTURE = readFileSync(
  path.join(import.meta.dirname, "../fixtures/gamechanger-baseball-game.txt"),
  "utf8"
);

/*
 * Expected values below are taken from the PDF box score of the same game
 * (Caverna at John Hardin, 13 May 2024), not from the .txt. If the parser
 * and the printed box score ever disagree, the parser is wrong.
 */

test("reads the vendor game id from the first line", () => {
  const r = parseMaxPrepsTxt(FIXTURE);
  assert.equal(r.vendorGameId, "11d15b49-4552-4200-a133-09abe6d95d55");
  assert.equal(r.ok, true);
});

test("parses every roster row with no errors", () => {
  const r = parseMaxPrepsTxt(FIXTURE);
  assert.equal(r.rows.length, 11);
  assert.deepEqual(
    r.rows.map((x) => x.jersey).sort(),
    ["00", "1", "7", "10", "12", "13", "22", "23", "24", "3", "44"].sort()
  );
  assert.deepEqual(r.issues.filter((i) => i.severity === "error"), []);
});

test("jersey 00 survives as a string and is not collapsed to 0", () => {
  const r = parseMaxPrepsTxt(FIXTURE);
  const jerseys = r.rows.map((x) => x.jersey);
  assert.ok(jerseys.includes("00"));
  assert.ok(!jerseys.includes(0 as unknown as string));
});

test("batting line matches the printed box score (B Sanderson #3)", () => {
  const r = parseMaxPrepsTxt(FIXTURE);
  const s = r.rows.find((x) => x.jersey === "3")!;
  assert.equal(s.values.AtBats, 2);
  assert.equal(s.values.Runs, 1);
  assert.equal(s.values.Hits, 1);
  assert.equal(s.values.RunsBattedIn, 0);
  assert.equal(s.values.BaseOnBalls, 1);
  assert.equal(s.values.StruckOut, 1);
  assert.equal(s.values.Triples, 1); // PDF: "3B: B Sanderson"
});

test("pitching line matches the printed box score (#3: 1.1 IP, 3 H, 9 R, 7 ER)", () => {
  const r = parseMaxPrepsTxt(FIXTURE);
  const s = r.rows.find((x) => x.jersey === "3")!;
  assert.equal(s.pitched, true);
  assert.equal(formatInningsPitched(s), "1.1");
  assert.ok(Math.abs(inningsPitched(s)! - (1 + 1 / 3)) < 1e-9);
  assert.equal(s.values.HitsAgainst, 3);
  assert.equal(s.values.RunsAgainst, 9);
  assert.equal(s.values.EarnedRuns, 7);
  assert.equal(s.values.BaseOnBallsAgainst, 2);
  assert.equal(s.values.BattersStruckOut, 0);
  assert.equal(s.values.HomeRunsAgainst, 0);
  assert.equal(s.values.NumberOfPitches, 52);
});

test("non-pitchers carry no pitching block", () => {
  const r = parseMaxPrepsTxt(FIXTURE);
  const pitchers = r.rows.filter((x) => x.pitched).map((x) => x.jersey).sort();
  // PDF pitching table lists exactly #00, #3 and #22 for Caverna.
  assert.deepEqual(pitchers, ["00", "22", "3"].sort());
});

test("a jersey-only row is reported as did not play, not as zeroes", () => {
  const r = parseMaxPrepsTxt(FIXTURE);
  const dnp = r.rows.find((x) => x.jersey === "13")!;
  assert.equal(dnp.didNotPlay, true);
  assert.deepEqual(dnp.values, {});
  // PDF shows T Alexander #13 with 0 AB - absent is not the same as zero,
  // and the importer must not invent a 0-for-0 line.
  assert.equal(dnp.values.AtBats, undefined);
});

test("blank cells are absent rather than zero", () => {
  const r = parseMaxPrepsTxt(FIXTURE);
  const batterOnly = r.rows.find((x) => x.jersey === "44")!;
  assert.equal(batterOnly.values.AtBats, 2);
  assert.equal(batterOnly.values.EarnedRuns, undefined);
});

test("a short row is skipped with an error, never silently", () => {
  const broken = FIXTURE.split("\n").slice(0, 3).join("\n") + "\n9|1|2";
  const r = parseMaxPrepsTxt(broken);
  const err = r.issues.find((i) => i.code === "column_count_mismatch");
  assert.ok(err, "expected a column_count_mismatch issue");
  assert.equal(err!.severity, "error");
  assert.ok(!r.rows.some((x) => x.jersey === "9"));
});

test("a non-numeric cell is reported and the row is dropped", () => {
  const lines = FIXTURE.split("\n");
  lines[2] = lines[2].replace(/^3\|1\|/, "3|x|");
  const r = parseMaxPrepsTxt(lines.join("\n"));
  assert.ok(r.issues.some((i) => i.code === "non_numeric_value"));
  assert.ok(!r.rows.some((x) => x.jersey === "3"));
});

test("duplicate jerseys are flagged for the coach rather than merged", () => {
  const lines = FIXTURE.split("\n");
  const r = parseMaxPrepsTxt([...lines, lines[2]].join("\n"));
  const dup = r.issues.find((i) => i.code === "duplicate_jersey");
  assert.ok(dup);
  assert.equal(dup!.severity, "warning");
  assert.equal(r.rows.length, 12, "both rows are kept for the coach to resolve");
});

test("CRLF and a BOM are handled", () => {
  const r = parseMaxPrepsTxt("﻿" + FIXTURE.replace(/\n/g, "\r\n"));
  assert.equal(r.rows.length, 11);
  assert.equal(r.vendorGameId, "11d15b49-4552-4200-a133-09abe6d95d55");
});

test("an empty or headerless file fails loudly", () => {
  assert.equal(parseMaxPrepsTxt("").ok, false);
  const r = parseMaxPrepsTxt("someid\nName|Points\nfoo|1");
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "unexpected_header"));
});

test("team names are recovered from the filename", () => {
  assert.deepEqual(
    parseFilename("Caverna Colonels Varsity_vs_John Hardin Bulldogs.txt"),
    { away: "Caverna Colonels", home: "John Hardin Bulldogs" }
  );
  assert.deepEqual(parseFilename("nonsense.txt"), { away: null, home: null });
});

/* ------------------------------------------------------------ mapping */

import {
  mapBaseballRow,
  BASEBALL_COLUMN_MAP,
  reconcileTeamPitching,
  outsToInnings,
} from "../src/mapping.ts";

test("every export column is mapped to a stat key", () => {
  const r = parseMaxPrepsTxt(FIXTURE);
  const innings = ["Jersey", "InningsPitched", "PartialInningPitched"];
  const unmapped = r.columns.filter(
    (c) => !innings.includes(c) && !BASEBALL_COLUMN_MAP[c]
  );
  assert.deepEqual(unmapped, [], `unmapped export columns: ${unmapped.join(", ")}`);
});

test("innings become exact outs, not a lossy decimal", () => {
  const r = parseMaxPrepsTxt(FIXTURE);
  // #3 pitched 1.1 innings per the PDF: one inning plus one out = 4 outs.
  assert.equal(mapBaseballRow(r.rows.find((x) => x.jersey === "3")!).stats.ip_outs, 4);
  // #00 pitched 2.0 = 6 outs.
  assert.equal(mapBaseballRow(r.rows.find((x) => x.jersey === "00")!).stats.ip_outs, 6);
});

/*
 * The export is not always internally consistent, and the parser must report
 * what the file says rather than what it ought to say.
 *
 * Jersey 22 is a real defect in the first export we received: the .txt has
 * InningsPitched=0 and PartialInningPitched=0, while GameChanger's own PDF
 * box score for the same game shows 0.2 IP for that pitcher. Every other
 * column for #22 (4 H, 4 R, 4 ER, 1 BB, 0 SO, 1 HR) matches the PDF exactly.
 *
 * Do not "fix" this test by making the parser infer the missing outs. Which
 * pitcher the outs belong to is not knowable from the file.
 */
test("a missing innings value is reported as zero, not inferred", () => {
  const r = parseMaxPrepsTxt(FIXTURE);
  const m = mapBaseballRow(r.rows.find((x) => x.jersey === "22")!);
  assert.equal(m.stats.ip_outs, 0, "the export really does say 0.0 IP here");
  assert.equal(m.stats.er, 4, "while every counting stat is present and correct");
  assert.equal(m.stats.h_allowed, 4);
});

test("team pitching reconciles against innings actually batted, and flags the gap", () => {
  const r = parseMaxPrepsTxt(FIXTURE);
  const rows = r.rows.map(mapBaseballRow);
  // John Hardin batted 4 complete innings (linescore 1|1|3|12|0, home team).
  const rec = reconcileTeamPitching(rows, 4);
  assert.equal(rec.outsRecorded, 10, "the file only accounts for 10 outs");
  assert.equal(rec.outsExpected, 12);
  assert.equal(rec.discrepancy, -2, "two outs unaccounted for - surface to the coach");
  assert.equal(outsToInnings(rec.outsRecorded), "3.1");
});

test("reconciliation is skipped when the innings batted are unknown", () => {
  const r = parseMaxPrepsTxt(FIXTURE);
  const rec = reconcileTeamPitching(r.rows.map(mapBaseballRow), null);
  assert.equal(rec.discrepancy, null);
});

test("mapping renames columns to our keys and drops nothing", () => {
  const r = parseMaxPrepsTxt(FIXTURE);
  const m = mapBaseballRow(r.rows.find((x) => x.jersey === "3")!);
  assert.equal(m.stats.ab, 2);
  assert.equal(m.stats.h, 1);
  assert.equal(m.stats.triples, 1);
  assert.equal(m.stats.er, 7);
  assert.equal(m.stats.k, 0);
  assert.deepEqual(m.unmapped, []);
});
