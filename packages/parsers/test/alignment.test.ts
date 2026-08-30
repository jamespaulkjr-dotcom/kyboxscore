import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAlignmentText,
  parseClass,
  parseDistrict,
} from "../src/alignment.ts";

const REAL = `Class 1A
District 1- Ballard Memorial, Caverna, Fulton County, Russellville
District 7- Harlan, Lynn Camp, Middlesboro, Pineville, Williamsburg

For postseason competition, in Class 1A, for 2025 and 2026, the fifth-place team in District 7 will become the fourth-place team in District 8.

Class 2A
District 1- Caldwell County, Crittenden County, Fort Campbell
District -8 Belfry, Betsy Layne, East Ridge

WITHDRAWN FROM PLAY- Holmes, Ohio County, Phelps, Thomas Nelson`;

test("reads the real KHSAA block format", () => {
  const { rows } = parseAlignmentText(REAL);
  // 1A: 4 + 5, 2A: 3 + 3
  assert.equal(rows.length, 15);
  assert.deepEqual(rows[0], {
    lineNumber: 2,
    schoolName: "Ballard Memorial",
    classOrdinal: 1,
    districtNumber: 1,
    raw: "District 1- Ballard Memorial, Caverna, Fulton County, Russellville",
  });
});

test("a class heading applies to every district under it", () => {
  const { rows } = parseAlignmentText(REAL);
  assert.equal(rows.find((r) => r.schoolName === "Harlan")?.classOrdinal, 1);
  assert.equal(rows.find((r) => r.schoolName === "Belfry")?.classOrdinal, 2);
});

test("the real document's 'District -8' typo still parses", () => {
  const { rows } = parseAlignmentText("Class 2A\nDistrict -8 Belfry, Betsy Layne");
  assert.deepEqual(
    rows.map((r) => [r.schoolName, r.districtNumber]),
    [["Belfry", 8], ["Betsy Layne", 8]]
  );
});

test("prose is reported as ignored rather than swallowed or misread", () => {
  const { rows, issues } = parseAlignmentText(REAL);
  // The cross-bracketing paragraph mentions District 7 and District 8 but must
  // not produce assignments.
  assert.ok(!rows.some((r) => r.schoolName.includes("postseason")));
  const ignored = issues.filter((i) => i.message.includes("ignored"));
  assert.equal(ignored.length, 1);
  assert.equal(ignored[0].severity, "info");
});

test("withdrawn schools are captured, not assigned", () => {
  const { rows, withdrawn } = parseAlignmentText(REAL);
  assert.deepEqual(withdrawn, ["Holmes", "Ohio County", "Phelps", "Thomas Nelson"]);
  assert.ok(!rows.some((r) => r.schoolName === "Holmes"));
});

test("a district before any class heading is an error, not a guess", () => {
  const { rows, issues } = parseAlignmentText("District 1- Somebody");
  assert.equal(rows.length, 0);
  assert.equal(issues[0].severity, "error");
});

test("class accepts the forms a human types and rejects impossible ones", () => {
  for (const [input, expected] of [
    ["3A", 3], ["3a", 3], ["3", 3], ["Class 3A", 3], ["class 6a", 6],
  ] as const) {
    assert.equal(parseClass(input), expected, input);
  }
  assert.equal(parseClass("7A"), null, "KHSAA football is 1A through 6A");
  assert.equal(parseClass("AAA"), null);
});

test("district accepts the forms a human types", () => {
  for (const [input, expected] of [
    ["District 4", 4], ["D4", 4], ["4", 4], ["12", 12],
  ] as const) {
    assert.equal(parseDistrict(input), expected, input);
  }
  assert.equal(parseDistrict("Fourth"), null);
});

test("school names keep their parenthetical disambiguators", () => {
  const { rows } = parseAlignmentText(
    "Class 1A\nDistrict 2- Holy Cross (Louisville), Kentucky Country Day"
  );
  assert.equal(rows[0].schoolName, "Holy Cross (Louisville)");
  assert.equal(rows[1].schoolName, "Kentucky Country Day");
});
