import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  parseResultsText,
  parseLongDate,
  findClockTime,
  looksLikeForfeitScore,
  type ResultRow,
} from "../src/results.ts";

const fixture = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)),
    "utf8"
  );

const find = (rows: ResultRow[], away: string) => {
  const row = rows.find((r) => r.awayName === away);
  assert.ok(row, `no row for ${away}`);
  return row;
};

test("reads the date out of the document heading", () => {
  const { date } = parseResultsText(fixture("results-2026-09-19.md"));
  assert.equal(date, "2026-09-19");
});

test("reads a night of finals, away team first", () => {
  const { rows, issues } = parseResultsText(fixture("results-2026-09-19.md"));
  assert.deepEqual(issues, []);

  const shelby = find(rows, "Shelby County");
  assert.equal(shelby.homeName, "Franklin County");
  assert.deepEqual(shelby.outcome, {
    kind: "score",
    awayScore: 6,
    homeScore: 42,
    final: true,
  });
});

test("a game under an in-progress heading is not final", () => {
  const { rows } = parseResultsText(fixture("results-2026-09-19.md"));
  assert.deepEqual(find(rows, "Lexington Christian").outcome, {
    kind: "score",
    awayScore: 6,
    homeScore: 0,
    final: false,
  });
});

test("an upcoming row carries its kick-off time and no result", () => {
  const { rows } = parseResultsText(fixture("results-2026-09-19.md"));
  const hazard = find(rows, "Hazard");
  assert.equal(hazard.time, "18:00:00");
  assert.equal(hazard.outcome.kind, "none");
  assert.equal(hazard.moveTo, null);
});

test("table headers and rules are not games", () => {
  const { rows } = parseResultsText(fixture("results-2026-09-19.md"));
  assert.equal(rows.length, 8);
  assert.ok(!rows.some((r) => r.awayName.toLowerCase().includes("away team")));
});

test("reads the revisions document, including every move", () => {
  const { rows, issues } = parseResultsText(
    fixture("results-2026-09-18-revisions.md")
  );
  assert.deepEqual(issues, []);

  // Postponed with no new date stays postponed.
  const ballard = find(rows, "Ballard");
  assert.deepEqual(ballard.outcome, { kind: "status", status: "postponed" });
  assert.equal(ballard.moveTo, null);

  // Rescheduled to a date and time goes back on the calendar.
  const seneca = find(rows, "Seneca");
  assert.deepEqual(seneca.outcome, { kind: "status", status: "scheduled" });
  assert.equal(seneca.moveTo, "2026-09-20");
  assert.equal(seneca.time, "18:00:00");

  // Played elsewhere: the winner is named, so the score has to be placed.
  const fairdale = find(rows, "Fairdale");
  assert.equal(fairdale.moveTo, "2026-09-19");
  assert.deepEqual(fairdale.outcome, {
    kind: "score",
    awayScore: 35,
    homeScore: 34,
    final: true,
  });

  // The same form with the HOME team winning.
  const shelby = find(rows, "Shelby County");
  assert.deepEqual(shelby.outcome, {
    kind: "score",
    awayScore: 6,
    homeScore: 42,
    final: true,
  });

  // Moved with no result yet.
  const southOldham = find(rows, "South Oldham");
  assert.equal(southOldham.moveTo, "2026-09-19");
  assert.equal(southOldham.time, "19:30:00");
  assert.deepEqual(southOldham.outcome, { kind: "status", status: "scheduled" });

  // A morning kick-off, to prove a.m. is not silently turned into p.m.
  const bath = find(rows, "Bath County");
  assert.equal(bath.moveTo, "2026-09-21");
  assert.equal(bath.time, "18:30:00");
});

test("no contest is a cancellation, not a forfeit", () => {
  const { rows } = parseResultsText(fixture("results-2026-09-18-revisions.md"));
  assert.deepEqual(find(rows, "Corbin").outcome, {
    kind: "status",
    status: "canceled",
  });
});

test("a suspended game keeps its score and does not go final", () => {
  const { rows } = parseResultsText(fixture("results-2026-09-18-revisions.md"));
  const atherton = find(rows, "Atherton");
  assert.deepEqual(atherton.outcome, {
    kind: "score",
    awayScore: 7,
    homeScore: 0,
    final: false,
  });
  // The resume date must not be read as the game moving there.
  assert.equal(atherton.moveTo, null);
});

test("a row with only two names records nothing", () => {
  const { rows } = parseResultsText(fixture("results-2026-09-18-revisions.md"));
  const bellevue = find(rows, "Bellevue");
  assert.deepEqual(bellevue.outcome, { kind: "none" });
  assert.equal(bellevue.moveTo, null);
});

test("a winner who is neither team is an issue, not a guess", () => {
  const { rows, issues } = parseResultsText(
    "# Scores — September 19, 2026\n\n| Fairdale | Spencer County | Played September 19; Atherton won 35-34 |"
  );
  assert.equal(rows.length, 0);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /neither team/);
});

test("an unreadable status is an issue, not a guess", () => {
  const { rows, issues } = parseResultsText(
    "# Scores — September 19, 2026\n\n| Fairdale | Spencer County | weather |"
  );
  assert.equal(rows.length, 0);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /cannot tell/);
});

test("a score row whose scores are not numbers is an issue", () => {
  const { issues } = parseResultsText(
    "# Scores — September 19, 2026\n\n| Fairdale | x | Spencer County | 34 |"
  );
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /not whole numbers|score row/);
});

test("a team cannot play itself", () => {
  const { issues } = parseResultsText(
    "# Scores — September 19, 2026\n\n| Fairdale | 7 | Fairdale | 0 |"
  );
  assert.equal(issues.length, 1);
});

test("a year is required somewhere", () => {
  const { date } = parseResultsText("| Fairdale | 7 | Spencer County | 0 |");
  assert.equal(date, null);
});

test("long dates and clock times", () => {
  assert.equal(parseLongDate("September 19, 2026", null), "2026-09-19");
  assert.equal(parseLongDate("September 19", 2026), "2026-09-19");
  assert.equal(parseLongDate("Septembre 19", 2026), null);
  assert.equal(parseLongDate("February 30, 2026", null), null);
  assert.equal(findClockTime("6:00 p.m."), "18:00:00");
  assert.equal(findClockTime("8:30 a.m."), "08:30:00");
  assert.equal(findClockTime("12:15 a.m."), "00:15:00");
  assert.equal(findClockTime("12:15 p.m."), "12:15:00");
  assert.equal(findClockTime("nope"), null);
});

test("reads a table whose first column is the date", () => {
  const { date, rows, issues } = parseResultsText(
    fixture("results-2026-09-25-dated.md")
  );
  assert.deepEqual(issues, []);
  // No heading, so no document date. Every row carries its own instead.
  assert.equal(date, null);
  assert.equal(rows.length, 6);

  const north = find(rows, "North Oldham");
  assert.equal(north.date, "2026-09-24");
  assert.equal(north.homeName, "Doss");
  assert.deepEqual(north.outcome, {
    kind: "score",
    awayScore: 49,
    homeScore: 0,
    final: true,
  });

  assert.equal(find(rows, "LaRue County").date, "2026-09-25");
  // A row missing its closing pipe still reads.
  assert.deepEqual(find(rows, "Spencer County").outcome, {
    kind: "score",
    awayScore: 55,
    homeScore: 21,
    final: true,
  });
  // An out-of-state suffix survives the date column.
  assert.equal(find(rows, "Lake County (TN)").homeName, "Fulton County");
});

test("the date column's own header is not a game", () => {
  const { rows } = parseResultsText(fixture("results-2026-09-25-dated.md"));
  assert.ok(!rows.some((r) => r.awayName.toLowerCase() === "away team"));
});

test("an unreadable date column blames the date, not the scores", () => {
  const { rows, issues } = parseResultsText(
    "| Date | Away Team | Away | Home Team | Home |\n| lastefriday | Doss | 0 | Male | 7 |"
  );
  assert.equal(rows.length, 0);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /is not a date I can read/);
});

test("dates in other styles work in the first column", () => {
  const { rows } = parseResultsText(
    "| 9/25/2026 | Doss | 0 | Male | 7 |\n| September 25, 2026 | Butler | 3 | Ballard | 9 |"
  );
  assert.equal(rows.length, 2);
  assert.equal(find(rows, "Doss").date, "2026-09-25");
  assert.equal(find(rows, "Butler").date, "2026-09-25");
});

test("a heading date still applies when rows have no date column", () => {
  const { date, rows } = parseResultsText(fixture("results-2026-09-19.md"));
  assert.equal(date, "2026-09-19");
  assert.ok(rows.every((r) => r.date === null));
});

test("1-0 in football is the forfeit convention, either way round", () => {
  assert.equal(looksLikeForfeitScore("football", 0, 1), true);
  assert.equal(looksLikeForfeitScore("football", 1, 0), true);
  assert.equal(looksLikeForfeitScore("FOOTBALL", 1, 0), true);
});

test("1-0 is an ordinary score in other sports", () => {
  for (const sport of ["soccer", "baseball", "softball", "hockey"]) {
    assert.equal(looksLikeForfeitScore(sport, 1, 0), false, sport);
  }
});

test("only 1-0 is the convention, not every low football score", () => {
  assert.equal(looksLikeForfeitScore("football", 0, 0), false);
  assert.equal(looksLikeForfeitScore("football", 2, 0), false);
  assert.equal(looksLikeForfeitScore("football", 1, 1), false);
  assert.equal(looksLikeForfeitScore("football", 7, 0), false);
});
