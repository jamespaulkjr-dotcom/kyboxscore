import test from "node:test";
import assert from "node:assert/strict";
import { parseScheduleText, parseScheduleDate } from "../src/schedule.ts";

test("reads a comma separated schedule", () => {
  const { rows, issues } = parseScheduleText(
    "2026-08-21, John Hardin, Central Hardin\n2026-08-28, Male, Trinity (Louisville)"
  );
  assert.equal(issues.length, 0);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => [r.date, r.homeName, r.awayName]),
    [
      ["2026-08-21", "John Hardin", "Central Hardin"],
      ["2026-08-28", "Male", "Trinity (Louisville)"],
    ]
  );
});

test("reads tab and pipe separated text, because paste is unpredictable", () => {
  const tabbed = parseScheduleText("2026-08-21\tJohn Hardin\tCentral Hardin");
  assert.equal(tabbed.rows.length, 1);
  assert.equal(tabbed.rows[0].awayName, "Central Hardin");

  const piped = parseScheduleText("2026-08-21 | John Hardin | Central Hardin");
  assert.equal(piped.rows.length, 1);
  assert.equal(piped.rows[0].homeName, "John Hardin");
});

test("a school name containing a comma still works when tabs are used", () => {
  // Comma-separated text cannot express "Trinity, Louisville" as one field;
  // tabs can, and a paste from a spreadsheet will be tabbed.
  const { rows } = parseScheduleText("2026-08-21\tTrinity, Louisville\tMale");
  assert.equal(rows[0].homeName, "Trinity, Louisville");
});

test("accepts US dates and rejects two-digit years", () => {
  assert.equal(parseScheduleDate("8/21/2026"), "2026-08-21");
  assert.equal(parseScheduleDate("08-21-2026"), "2026-08-21");
  assert.equal(parseScheduleDate("2026-8-1"), "2026-08-01");
  // Could be 1926. A schedule in the wrong century beats no schedule.
  assert.equal(parseScheduleDate("8/21/26"), null);
});

test("rejects dates that do not exist", () => {
  assert.equal(parseScheduleDate("2026-02-31"), null);
  assert.equal(parseScheduleDate("2026-13-01"), null);
});

test("scores are optional but must come in pairs", () => {
  const ok = parseScheduleText("2026-08-21, John Hardin, Central Hardin, 21, 14");
  assert.equal(ok.issues.length, 0);
  assert.deepEqual([ok.rows[0].homeScore, ok.rows[0].awayScore], [21, 14]);

  const half = parseScheduleText("2026-08-21, John Hardin, Central Hardin, 21");
  assert.equal(half.rows.length, 0);
  assert.match(half.issues[0].message, /both scores or neither/i);
});

test("blank lines and comments are skipped, not reported", () => {
  const { rows, issues } = parseScheduleText(
    "# week 1\n\n2026-08-21, John Hardin, Central Hardin\n\n"
  );
  assert.equal(rows.length, 1);
  assert.equal(issues.length, 0);
});

test("a bad line is reported with its number and never guessed at", () => {
  const { rows, issues } = parseScheduleText(
    "2026-08-21, John Hardin, Central Hardin\nnot a schedule line at all\n2026-08-28, Male, Trinity"
  );
  assert.equal(rows.length, 2, "good lines still import");
  assert.equal(issues.length, 1);
  assert.equal(issues[0].lineNumber, 2);
});

test("a team cannot play itself", () => {
  const { rows, issues } = parseScheduleText("2026-08-21, Male, male");
  assert.equal(rows.length, 0);
  assert.match(issues[0].message, /cannot play itself/i);
});

test("line numbers refer to the pasted text, so a human can find the line", () => {
  const { issues } = parseScheduleText("\n\n\nbroken line");
  assert.equal(issues[0].lineNumber, 4);
});
