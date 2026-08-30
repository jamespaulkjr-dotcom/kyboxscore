import test from "node:test";
import assert from "node:assert/strict";
import { matchRow, normalizeJersey, summarize, type RosterCandidate } from "../src/matching.ts";

const roster: RosterCandidate[] = [
  { playerId: 1, name: "Alex Adams", jersey: "3" },
  { playerId: 2, name: "Bo Baker", jersey: "44" },
  { playerId: 3, name: "Cy Carter", jersey: "0" },
  { playerId: 4, name: "Dee Dawson", jersey: "00" },
  { playerId: 5, name: "Eli Evans", jersey: "13" },
  { playerId: 6, name: "Fin Fowler", jersey: "13" },
];
const noAliases = new Map<string, number>();

test("a unique jersey matches its player", () => {
  const m = matchRow("44", roster, noAliases);
  assert.equal(m.playerId, 2);
  assert.equal(m.method, "jersey");
  assert.equal(m.confidence, 1);
});

test("'00' and '0' are different players", () => {
  assert.equal(matchRow("0", roster, noAliases).playerId, 3);
  assert.equal(matchRow("00", roster, noAliases).playerId, 4);
});

test("a jersey nobody wears is unmatched, never guessed", () => {
  const m = matchRow("99", roster, noAliases);
  assert.equal(m.playerId, null);
  assert.equal(m.method, "unmatched");
  assert.equal(m.reason, "no_such_jersey");
});

test("a shared jersey goes to a human with both candidates", () => {
  const m = matchRow("13", roster, noAliases);
  assert.equal(m.playerId, null);
  assert.equal(m.reason, "ambiguous_jersey");
  assert.deepEqual(
    m.candidates?.map((c) => c.playerId),
    [5, 6]
  );
});

test("a blank jersey is reported rather than dropped", () => {
  for (const blank of ["", "   ", null]) {
    const m = matchRow(blank, roster, noAliases);
    assert.equal(m.playerId, null);
    assert.equal(m.reason, "blank_jersey");
  }
});

test("a remembered correction beats the roster", () => {
  // The coach previously said #99 is Bo Baker. It must not go unmatched again.
  const aliases = new Map([["99", 2]]);
  const m = matchRow("99", roster, aliases);
  assert.equal(m.playerId, 2);
  assert.equal(m.method, "alias");
});

test("a remembered correction also resolves an ambiguous jersey", () => {
  const aliases = new Map([["13", 6]]);
  const m = matchRow("13", roster, aliases);
  assert.equal(m.playerId, 6);
  assert.equal(m.method, "alias");
});

test("normalizeJersey trims and drops a leading hash, nothing else", () => {
  assert.equal(normalizeJersey(" #7 "), "7");
  assert.equal(normalizeJersey("00"), "00", "leading zeros survive");
  assert.equal(normalizeJersey(null), "");
});

test("the summary counts what the coach needs to see", () => {
  const matches = [
    matchRow("3", roster, noAliases),
    matchRow("13", roster, noAliases),
    matchRow("99", roster, noAliases),
  ];
  const s = summarize(matches, [false, false, true]);
  assert.deepEqual(s, { total: 3, matched: 1, unmatched: 2, didNotPlay: 1 });
});
