import test from "node:test";
import assert from "node:assert/strict";
import {
  parseScheduleSheet,
  parseCsv,
  splitCsvLine,
  parseClockTime,
} from "../src/schedule-sheet.ts";

const HEADER =
  "School,Date,Time,Home/Away,Opponent,Result,School Score,Opponent Score,Game Status,Game Title";

const sheet = (...lines: string[]) => parseScheduleSheet([HEADER, ...lines].join("\n"));

test("reads a played game with its score", () => {
  const r = sheet("Adair County,8/21/2026,7:00 PM,at,Russell County,W,37,13,,@ Ron Finley Field");
  assert.equal(r.issues.length, 0);
  const g = r.games[0];
  assert.equal(g.school, "Adair County");
  assert.equal(g.opponent, "Russell County");
  assert.equal(g.date, "2026-08-21");
  assert.equal(g.isHome, false);
  assert.deepEqual([g.teamScore, g.opponentScore, g.won], [37, 13, true]);
  assert.equal(g.status, "final");
  assert.equal(g.stage, "regular_season");
});

test("accepts Excel's raw date serial as well as a written date", () => {
  // 46255 days from 1899-12-30 is Friday 2026-08-21 — a real football night.
  const r = sheet("Adair County,46255,7:00 PM,at,Russell County,W,37,13,,");
  assert.equal(r.games[0].date, "2026-08-21");
});

test("columns are matched by header name, not position", () => {
  const moved = parseScheduleSheet(
    ["Opponent,School,Date,Home/Away", "Russell County,Adair County,8/22/2026,vs"].join("\n")
  );
  assert.equal(moved.games[0].school, "Adair County");
  assert.equal(moved.games[0].opponent, "Russell County");
  assert.equal(moved.games[0].isHome, true);
});

test("a scrimmage is taken from the export's own wording", () => {
  const r = sheet("Atherton,8/7/2026,6:00 PM,vs,North Hardin,,,,,Home Scrimmage");
  assert.equal(r.games[0].stage, "scrimmage");
});

test("a multi-team scrimmage is skipped, not invented into pairings", () => {
  const r = sheet(
    "Adair County,8/7/2026,6:00 PM,at,Garrard County / Green County / Southwestern,,,,,Grid O Rama Scrimmage"
  );
  assert.equal(r.games.length, 0);
  assert.equal(r.issues[0].code, "multi_team");
});

test("canceled and forfeited games keep their status", () => {
  const r = sheet(
    "Adair County,10/9/2026,7:00 PM,at,Taylor County,,,,Canceled,",
    "Bardstown,10/9/2026,7:00 PM,vs,Somebody,,,,Forfeit,"
  );
  assert.deepEqual(r.games.map((g) => g.status), ["canceled", "forfeit"]);
  assert.equal(r.games[0].teamScore, null, "a canceled game carries no score");
});

test("a result letter contradicting the score is refused", () => {
  const r = sheet("Adair County,8/22/2026,7:00 PM,at,Russell County,W,13,37,,");
  assert.equal(r.games.length, 0);
  assert.equal(r.issues[0].code, "result_disagrees");
});

test("the score wins when the result letter is simply missing", () => {
  const r = sheet("Adair County,8/22/2026,7:00 PM,at,Russell County,,37,13,,");
  assert.equal(r.games[0].won, true);
});

test("a row with no opponent is reported, not silently dropped", () => {
  const r = sheet("Adair County,8/22/2026,7:00 PM,at,,,,,,");
  assert.equal(r.games.length, 0);
  assert.equal(r.issues[0].code, "no_opponent");
});

test("a missing home/away marker is an error, because sides cannot be guessed", () => {
  const r = sheet("Adair County,8/22/2026,7:00 PM,,Russell County,,,,,");
  assert.equal(r.games.length, 0);
  assert.equal(r.issues[0].code, "no_venue");
});

test("a missing required column fails loudly rather than importing nothing", () => {
  const r = parseScheduleSheet("School,Date\nAdair County,8/22/2026");
  assert.equal(r.issues[0].code, "missing_column");
  assert.match(r.issues[0].message, /opponent/i);
});

test("quoted fields containing commas survive", () => {
  assert.deepEqual(
    splitCsvLine('Adair County,"Trinity, Louisville",vs'),
    ["Adair County", "Trinity, Louisville", "vs"]
  );
  const rows = parseCsv('a,b\n"multi\nline",c');
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], "multi\nline");
});

test("a canceled game is not left looking like an upcoming fixture", () => {
  // It has no score, so deriving status from the score alone would file it as
  // "scheduled" and it would sit on the schedule forever as a game that never
  // happens. The export says Canceled and that has to survive to the database.
  const r = sheet("Adair County,10/9/2026,7:00 PM,at,Taylor County,,,,Canceled,");
  assert.equal(r.games[0].status, "canceled");
  assert.equal(r.games[0].teamScore, null);
});

test("kick-off times normalise to 24 hour", () => {
  for (const [input, expected] of [
    ["7:00 PM", "19:00"], ["7:30 pm", "19:30"], ["6:00 AM", "06:00"],
    ["12:00 PM", "12:00"], ["12:30 AM", "00:30"], ["19:00", "19:00"],
  ] as const) {
    assert.equal(parseClockTime(input), expected, input);
  }
  for (const bad of ["", "kickoff", "25:00", "7:99 PM"]) {
    assert.equal(parseClockTime(bad), null, bad);
  }
});

test("a game carries its kick-off time through the parse", () => {
  const r = sheet("Adair County,8/21/2026,7:00 PM,vs,Russell County,,,,,");
  assert.equal(r.games[0].time, "19:00");
});
