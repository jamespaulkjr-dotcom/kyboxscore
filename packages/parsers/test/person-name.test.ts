import test from "node:test";
import assert from "node:assert/strict";
import { normalizePersonName } from "../src/person-name.ts";

test("a shouted name is calmed down", () => {
  for (const [input, expected] of [
    ["MAKHAI", "Makhai"], ["BAYLOR", "Baylor"], ["JEREMIAH", "Jeremiah"],
    ["WINTERS", "Winters"], ["FIEGLEIN", "Fieglein"],
  ] as const) {
    assert.equal(normalizePersonName(input), expected, input);
  }
});

test("initials are left alone — 'Aj' is worse than 'AJ'", () => {
  for (const initials of ["AJ", "TJ", "DJ", "CJ", "ZT", "DC", "T.J.", "A.J.", "D.K"]) {
    assert.equal(normalizePersonName(initials), initials, initials);
  }
});

test("a name already carrying lower case is never touched", () => {
  // These were typed deliberately and any rule that "fixes" them is wrong.
  for (const name of [
    "MeJean", "DeShields", "DiNovo", "LaFavors", "DuLany-Waugh",
    "van Dyke", "McLeroy", "O'Brien", "Smith",
  ]) {
    assert.equal(normalizePersonName(name), name, name);
  }
});

test("Mc and Mac keep their second capital", () => {
  assert.equal(normalizePersonName("MCLEROY"), "McLeroy");
  assert.equal(normalizePersonName("MCDONALD"), "McDonald");
  assert.equal(normalizePersonName("MACARTHUR"), "MacArthur");
  // Not every Mac word is a prefix; "Mack" must not become "MacK".
  assert.equal(normalizePersonName("MACK"), "Mack");
});

test("hyphens and apostrophes carry capitals", () => {
  assert.equal(normalizePersonName("DULANY-WAUGH"), "Dulany-Waugh");
  assert.equal(normalizePersonName("O'BRIEN"), "O'Brien");
  assert.equal(normalizePersonName("SMITH-JONES"), "Smith-Jones");
});

test("suffixes and ambiguous short forms are left exactly as written", () => {
  assert.equal(normalizePersonName("III"), "III");
  assert.equal(normalizePersonName("IV"), "IV");
  // "JR" is a suffix, and it is also a boy called J.R. Leaving it alone is the
  // only answer that cannot be wrong about somebody's name.
  assert.equal(normalizePersonName("JR"), "JR");
});

test("blank and whitespace are handled without throwing", () => {
  assert.equal(normalizePersonName(""), "");
  assert.equal(normalizePersonName("   "), "");
});
