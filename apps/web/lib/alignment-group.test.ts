import { test } from "node:test";
import assert from "node:assert/strict";
import { findGroup, groupNoun, groupParam, groupRows } from "./alignment-group.ts";

const football = [
  { groupName: "3A", groupSlug: "class-3a", groupKind: "classification" as const, groupOrdinal: 3, id: 1 },
  { groupName: "1A", groupSlug: "class-1a", groupKind: "classification" as const, groupOrdinal: 1, id: 2 },
  { groupName: "3A", groupSlug: "class-3a", groupKind: "classification" as const, groupOrdinal: 3, id: 3 },
];

const basketball = [
  { groupName: "Region 5", groupSlug: "region-5", groupKind: "region" as const, groupOrdinal: 5, id: 4 },
];

test("classes come back in ordinal order, not first-seen order", () => {
  const groups = groupRows(football);
  assert.deepEqual(groups.map((g) => g.name), ["1A", "3A"]);
  assert.deepEqual(groups[1].rows.map((r) => r.id), [1, 3]);
});

test("a classification is labelled Class 1A, a region only Region 5", () => {
  // "Class Region 5" is the bug this guards.
  assert.equal(groupRows(football)[0].label, "Class 1A");
  assert.equal(groupRows(basketball)[0].label, "Region 5");
  assert.equal(groupRows(basketball)[0].noun, "region");
});

test("the URL carries the form somebody would type", () => {
  assert.equal(groupParam("class-3a"), "3a");
  // A region's slug is already what a reader would guess.
  assert.equal(groupParam("region-5"), "region-5");
});

test("either form of the parameter finds the group", () => {
  const groups = groupRows(football);
  assert.equal(findGroup(groups, "3a")?.slug, "class-3a");
  assert.equal(findGroup(groups, "class-3a")?.slug, "class-3a");
  assert.equal(findGroup(groups, "3A")?.slug, "class-3a");
  assert.equal(findGroup(groups, "9z"), undefined);
});

test("teams with no alignment are left out rather than grouped as null", () => {
  const unassigned = [
    { groupName: null, groupSlug: null, groupKind: null, groupOrdinal: null, id: 9 },
    ...football,
  ];
  const groups = groupRows(unassigned);
  assert.equal(groups.length, 2);
  assert.ok(!groups.some((g) => g.rows.some((r) => r.id === 9)));
});

test("an empty season still has a word for the thing", () => {
  assert.equal(groupNoun([]), "class");
  assert.equal(groupNoun(groupRows(basketball)), "region");
});
