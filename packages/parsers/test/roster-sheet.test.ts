import test from "node:test";
import assert from "node:assert/strict";
import {
  parseRosterWorkbook,
  parseGrade,
  parsePositions,
} from "../src/roster-sheet.ts";

const tab = (name: string, rows: string[][]) => ({ name, rows });
const HEADER = ["First Name", "Last Name", "Jersey", "Class", "Position(s)", "Height", "Height Inches", "Weight (lb)"];

test("reads a school tab in the shape the real workbook uses", () => {
  const { teams } = parseRosterWorkbook([
    tab("Directory", [["KHSAA Player Rosters"], ["Schools", "220"], ["School", "Tab Name", "Player Count"]]),
    tab("Adair County", [
      ["Adair County"],
      ["Player count", "36"],
      HEADER,
      ["Madden", "Moye", "0", "Senior", "WR / DB", "6'0\"", "72", "155"],
      ["Matthew", "MeJean", "1", "Senior", "WR / PK", "6'3\"", "75", "180"],
    ]),
  ]);
  assert.equal(teams.length, 1, "the directory tab is not a roster");
  assert.equal(teams[0].schoolName, "Adair County");
  assert.deepEqual(teams[0].players.map((p) => p.jersey), ["0", "1"]);
  assert.deepEqual(teams[0].players[0].positions, ["WR", "DB"]);
  assert.equal(teams[0].players[0].grade, 12);
  assert.deepEqual(
    [teams[0].players[0].heightInches, teams[0].players[0].weightLb],
    [72, 155]
  );
});

test("jersey stays a string, so 00 and 0 remain different players", () => {
  const { teams } = parseRosterWorkbook([
    tab("X", [["X"], HEADER, ["A", "One", "0", "", "", "", "", ""], ["B", "Two", "00", "", "", "", "", ""]]),
  ]);
  assert.deepEqual(teams[0].players.map((p) => p.jersey), ["0", "00"]);
});

test("a missing jersey is null rather than an empty string", () => {
  const { teams } = parseRosterWorkbook([
    tab("X", [["X"], HEADER, ["A", "One", "", "Junior", "QB", "", "", ""]]),
  ]);
  assert.equal(teams[0].players[0].jersey, null);
});

test("zero height or weight means not recorded, not a real measurement", () => {
  const { teams } = parseRosterWorkbook([
    tab("X", [["X"], HEADER, ["A", "One", "5", "Senior", "WR", "", "0", "0"]]),
  ]);
  assert.equal(teams[0].players[0].heightInches, null);
  assert.equal(teams[0].players[0].weightLb, null);
});

test("class names and numeric grades both work", () => {
  for (const [input, expected] of [
    ["Senior", 12], ["senior", 12], ["Sr", 12], ["Junior", 11],
    ["Sophomore", 10], ["Freshman", 9], ["9", 9], ["12", 12], ["8th", 8],
  ] as const) {
    assert.equal(parseGrade(input), expected, input);
  }
  assert.equal(parseGrade(""), null);
  assert.equal(parseGrade("Postgrad"), null);
  assert.equal(parseGrade("13"), null, "no grade 13 in high school");
});

test("positions split on several separators and uppercase", () => {
  assert.deepEqual(parsePositions("WR / DB"), ["WR", "DB"]);
  assert.deepEqual(parsePositions("rb,lb"), ["RB", "LB"]);
  assert.deepEqual(parsePositions("QB"), ["QB"]);
  assert.deepEqual(parsePositions(""), []);
});

test("columns are found by name, so a reordered sheet still reads", () => {
  const { teams } = parseRosterWorkbook([
    tab("X", [["X"], ["Jersey", "Last Name", "First Name", "Class"], ["7", "Smith", "Sam", "Junior"]]),
  ]);
  assert.equal(teams[0].players[0].firstName, "Sam");
  assert.equal(teams[0].players[0].lastName, "Smith");
  assert.equal(teams[0].players[0].jersey, "7");
});

test("a half-named row is reported, not imported as a person", () => {
  const { teams } = parseRosterWorkbook([
    tab("X", [["X"], HEADER, ["Sam", "", "7", "", "", "", "", ""], ["A", "One", "8", "", "", "", "", ""]]),
  ]);
  assert.equal(teams[0].players.length, 1);
  assert.equal(teams[0].issues.length, 1);
  assert.match(teams[0].issues[0].message, /both names/i);
});

test("a sheet with no roster columns is skipped, not treated as empty", () => {
  const { teams, skippedSheets } = parseRosterWorkbook([
    tab("Notes", [["Some notes"], ["about the data"]]),
  ]);
  assert.equal(teams.length, 0);
  assert.deepEqual(skippedSheets, ["Notes"]);
});
