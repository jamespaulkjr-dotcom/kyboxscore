import test from "node:test";
import assert from "node:assert/strict";
import { parseTeamSchedule, parseTeamSchedules, inferYear } from "../src/team-schedule.ts";

const REAL = `This is for John Hardin High School

Thu Aug 6 6:00 PM    vs
Opponent :Central Hardin High School
Location :John Hardin High School
Football Stadium
District Game

Fri Aug 14 7:00 PM    @
Valley High School
Location: Valley High School
Football Stadium
Scrimmage

Fri Aug 21 7:30 PM    vs
Hancock County High School
Location: John Hardin High School
Football Stadium    Win
16-3
Non-District Game

Sat Aug 29 6:00 PM    @
Opponent logo
Seneca High School
Seneca High School
Ballard High School    W
32-12
L`;

test("reads the subject team and every game block", () => {
  const r = parseTeamSchedule(REAL);
  assert.equal(r.subjectTeam, "John Hardin High School");
  assert.equal(r.games.length, 4);
  assert.equal(r.issues.filter((i) => i.severity === "error").length, 0);
});

test("'vs' is home and '@' is away", () => {
  const r = parseTeamSchedule(REAL);
  assert.deepEqual(
    r.games.map((g) => g.isHome),
    [true, false, true, false]
  );
});

test("'@' parses at all — it is not a word character", () => {
  // A word-boundary anchor after the marker silently dropped every away game.
  const r = parseTeamSchedule("Fri Aug 14 7:00 PM    @\nValley High School\nScrimmage");
  assert.equal(r.games.length, 1);
  assert.equal(r.games[0].isHome, false);
});

test("'L' as the last line is a district game, not a loss", () => {
  const r = parseTeamSchedule(REAL);
  const seneca = r.games.find((g) => g.opponentName === "Seneca High School")!;
  assert.equal(seneca.gameType, "district");
  assert.equal(seneca.won, true, "the W before the score is the result");
  assert.deepEqual([seneca.teamScore, seneca.opponentScore], [32, 12]);
});

test("a block with no score has no result, whatever letters it contains", () => {
  const r = parseTeamSchedule(REAL);
  const central = r.games.find((g) => g.opponentName === "Central Hardin High School")!;
  assert.equal(central.won, null);
  assert.equal(central.teamScore, null);
  assert.equal(central.gameType, "district");
});

test("scrimmages are identified, because RPI must not count them", () => {
  const r = parseTeamSchedule(REAL);
  const valley = r.games.find((g) => g.opponentName === "Valley High School")!;
  assert.equal(valley.gameType, "scrimmage");
});

test("an 'Opponent :' prefix and a logo line are stripped", () => {
  const r = parseTeamSchedule(REAL);
  assert.equal(r.games[0].opponentName, "Central Hardin High School");
  assert.equal(r.games[3].opponentName, "Seneca High School");
});

test("times convert to 24 hour", () => {
  const r = parseTeamSchedule(REAL);
  assert.deepEqual(
    r.games.map((g) => g.time),
    ["18:00", "19:00", "19:30", "18:00"]
  );
});

test("a result marker contradicting the score is refused, not silently kept", () => {
  const r = parseTeamSchedule(
    "Fri Aug 21 7:30 PM    vs\nSomebody High School\nStadium    Win\n3-16\nDistrict Game"
  );
  assert.equal(r.games.length, 0);
  assert.match(r.issues[0].message, /disagree/i);
});

test("the year is inferred from the weekdays and ambiguity is reported", () => {
  const r = parseTeamSchedule(REAL);
  const resolved = inferYear(r.games, [2024, 2025, 2026, 2027, 2028]);
  assert.equal(resolved.year, 2026);
  assert.deepEqual(resolved.candidates, [2026]);

  // One game alone cannot pin a year down; several years have that weekday.
  const single = parseTeamSchedule("Fri Aug 21 7:30 PM    vs\nSomebody\nDistrict Game");
  const weak = inferYear(single.games, [2020, 2021, 2026, 2027]);
  assert.equal(weak.year, null, "an ambiguous year must not be guessed");
});

test("several teams can be pasted at once, keeping their real line numbers", () => {
  const two = REAL + "\n\n" + REAL.replace("John Hardin High School", "Central Hardin High School");
  const blocks = parseTeamSchedules(two);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].subjectTeam, "John Hardin High School");
  assert.equal(blocks[1].subjectTeam, "Central Hardin High School");
  assert.ok(
    blocks[1].games[0].lineNumber > blocks[0].games.at(-1)!.lineNumber,
    "the second block's line numbers point into the pasted text"
  );
});
