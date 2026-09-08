import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTeamRecords, nameWithoutState } from "../src/team-records.ts";

/** Every shape a person actually pastes has to work. */
test("reads a record however it is written", () => {
  const { records, issues } = parseTeamRecords(`
    Elder, 3, 0
    Jo Byrns 2-1
    Moeller (OH) 4-0
    Northeast\t1\t2
    Jellico 3 - 0
    Wheelersburg: 2-1
    Ironton 3–0
    Lake County 1-2-1
    Station Camp  2  1
  `);
  assert.equal(issues.length, 0, JSON.stringify(issues));
  assert.deepEqual(
    records.map((r) => `${r.name} ${r.wins}-${r.losses}-${r.ties}`),
    [
      "Elder 3-0-0",
      "Jo Byrns 2-1-0",
      "Moeller (OH) 4-0-0",
      "Northeast 1-2-0",
      "Jellico 3-0-0",
      "Wheelersburg 2-1-0",
      "Ironton 3-0-0",
      "Lake County 1-2-1",
      "Station Camp 2-1-0",
    ]
  );
});

test("reads a pasted markdown table, header and rule included", () => {
  const { records, issues } = parseTeamRecords(`
| School | Record |
|---|---|
| Elder | 3-0 |
| Jo Byrns | 2-1 |
  `);
  assert.equal(issues.length, 0);
  assert.deepEqual(records.map((r) => r.name), ["Elder", "Jo Byrns"]);
  assert.equal(records[0].wins, 3);
});

test("a school with a number in its name still parses", () => {
  const { records } = parseTeamRecords("Region 7 Academy 2-1");
  assert.equal(records[0].name, "Region 7 Academy");
  assert.equal(records[0].wins, 2);
});

test("reports a line it cannot read rather than dropping it", () => {
  const { records, issues } = parseTeamRecords(`
    Elder 3-0
    Jo Byrns is doing well this year
    4-0
  `);
  assert.equal(records.length, 1);
  assert.equal(issues.length, 2);
  assert.match(issues[0].reason, /no record/);
  assert.match(issues[1].reason, /no school name/);
});

test("refuses numbers that are not a record", () => {
  // A season span is not a record, and neither is a scoreline that ran away.
  const year = parseTeamRecords("Elder 2026-2027");
  assert.equal(year.records.length, 0);
  assert.equal(year.issues.length, 1);

  const silly = parseTeamRecords("Elder 300-400");
  assert.equal(silly.records.length, 0);
  assert.equal(silly.issues.length, 1);
  assert.match(silly.issues[0].reason, /not a record/);
});

test("the state marker can be dropped for matching", () => {
  assert.equal(nameWithoutState("Moeller (OH)"), "Moeller");
  assert.equal(nameWithoutState("Elder"), "Elder");
  assert.equal(nameWithoutState("Holy Cross (Louisville)"), "Holy Cross (Louisville)");
});
