import test from "node:test";
import assert from "node:assert/strict";
import { computeRpi, computeBoth, winPct, DEFAULT_CONFIG } from "../src/index.ts";
import type { Game, TeamInput } from "../src/index.ts";

const g = (o: Partial<Game> & Pick<Game, "gameId" | "opponentId" | "outcome">): Game => ({
  isHome: true,
  opponentAssumedFiveHundred: false,
  opponentClass: null,
  missingScore: false,
  ...o,
});

/**
 * Hand-worked three team round robin.
 *   A beats B, A beats C, B beats C.
 * Records: A 2-0, B 1-1, C 0-2.  WP: A 1.000, B .500, C .000.
 *
 * A's OWP  = mean(WP(B), WP(C))       = (.5 + 0) / 2 = .250
 * A's OOWP = mean(OWP(B), OWP(C))
 *   OWP(B) = mean(WP(A), WP(C)) = (1 + 0)/2 = .500
 *   OWP(C) = mean(WP(A), WP(B)) = (1 + .5)/2 = .750
 *   => (.5 + .75)/2 = .625
 * RPI(A) = 1(.35) + .25(.35) + .625(.30) = .35 + .0875 + .1875 = .625
 */
const ROUND_ROBIN: TeamInput[] = [
  { teamId: 1, teamClass: null, games: [
    g({ gameId: 1, opponentId: 2, outcome: "win" }),
    g({ gameId: 2, opponentId: 3, outcome: "win" }),
  ]},
  { teamId: 2, teamClass: null, games: [
    g({ gameId: 1, opponentId: 1, outcome: "loss" }),
    g({ gameId: 3, opponentId: 3, outcome: "win" }),
  ]},
  { teamId: 3, teamClass: null, games: [
    g({ gameId: 2, opponentId: 1, outcome: "loss" }),
    g({ gameId: 3, opponentId: 2, outcome: "loss" }),
  ]},
];

test("winPct counts a tie as half a win", () => {
  assert.equal(winPct([g({ gameId: 1, opponentId: 9, outcome: "win" }),
                       g({ gameId: 2, opponentId: 9, outcome: "tie" })], "standard"), 0.75);
});

test("matches the hand-worked round robin", () => {
  const r = computeRpi(ROUND_ROBIN);
  const a = r.find((x) => x.teamId === 1)!;
  assert.equal(a.wp, 1);
  assert.equal(a.owp, 0.25);
  assert.equal(a.oowp, 0.625);
  assert.ok(Math.abs(a.rpi - 0.625) < 1e-9, `rpi was ${a.rpi}`);
});

test("weights sum to one", () => {
  const { wp, owp, oowp } = DEFAULT_CONFIG.weights;
  assert.ok(Math.abs(wp + owp + oowp - 1) < 1e-9);
});

test("margin of victory cannot influence the rating", () => {
  // The Game type carries no score, so a blowout and a one-point win are the
  // same input. This guards the property at the type and value level.
  const base = computeRpi(ROUND_ROBIN);
  const again = computeRpi(structuredClone(ROUND_ROBIN));
  assert.deepEqual(base.map((r) => r.rpi), again.map((r) => r.rpi));
});

test("out of state opponents are pinned to .500 under the official formula", () => {
  const teams: TeamInput[] = [
    { teamId: 1, teamClass: null, games: [
      g({ gameId: 1, opponentId: 99, outcome: "win", opponentAssumedFiveHundred: true }),
    ]},
    { teamId: 99, teamClass: null, externalWinPct: 0.9, games: [
      g({ gameId: 1, opponentId: 1, outcome: "loss" }),
    ]},
  ];
  const [a] = computeRpi(teams);
  assert.equal(a.owp, 0.5);
  assert.equal(a.inputs[0].appliedWpReason, "flat_500_assumed");
  assert.equal(a.inputs[0].opponentActualWp, 0.9, "the real number is still recorded");
});

test("shadow RPI lets the out of state opponent carry its real record", () => {
  const teams: TeamInput[] = [
    { teamId: 1, teamClass: null, games: [
      g({ gameId: 1, opponentId: 99, outcome: "win", opponentAssumedFiveHundred: true }),
    ]},
    { teamId: 99, teamClass: null, externalWinPct: 0.9, games: [
      g({ gameId: 1, opponentId: 1, outcome: "loss" }),
    ]},
  ];
  const { official, shadow, delta } = computeBoth(teams);
  const o = official.find((r) => r.teamId === 1)!;
  const s = shadow.find((r) => r.teamId === 1)!;
  assert.equal(o.owp, 0.5);
  assert.equal(s.owp, 0.9);
  assert.ok(s.rpi > o.rpi, "beating a strong out of state team should help");
  assert.ok(Math.abs(delta.get(1)! - (s.rpi - o.rpi)) < 1e-12);
});

test("a missing score suppresses publication but still computes", () => {
  const teams: TeamInput[] = [
    { teamId: 1, teamClass: null, games: [
      g({ gameId: 1, opponentId: 2, outcome: "win", missingScore: true }),
    ]},
    { teamId: 2, teamClass: null, games: [
      g({ gameId: 1, opponentId: 1, outcome: "loss" }),
    ]},
  ];
  const [a] = computeRpi(teams);
  assert.equal(a.published, false);
  assert.equal(a.suppressedReason, "missing_scores");
  assert.ok(a.rpi > 0, "the value exists, it is just not publishable");
});

test("playing up a classification raises the class factor above baseline", () => {
  const flat: TeamInput = { teamId: 1, teamClass: 3, games: [
    g({ gameId: 1, opponentId: 2, outcome: "win", opponentClass: 3 }),
  ]};
  const up: TeamInput = { teamId: 1, teamClass: 3, games: [
    g({ gameId: 1, opponentId: 2, outcome: "win", opponentClass: 5 }),
  ]};
  const other: TeamInput = { teamId: 2, teamClass: 3, games: [
    g({ gameId: 1, opponentId: 1, outcome: "loss" }),
  ]};
  const [a] = computeRpi([flat, other]);
  const [b] = computeRpi([up, other]);
  assert.equal(a.classFactor, 1);
  assert.ok(Math.abs(b.classFactor - 1.3) < 1e-9, `two classes up at 15% => 1.30, got ${b.classFactor}`);
  assert.ok(b.rpi > a.rpi);
});

test("every stored value carries the arithmetic that produced it", () => {
  const [a] = computeRpi(ROUND_ROBIN);
  assert.equal(a.inputs.length, 2);
  for (const i of a.inputs) {
    assert.ok(typeof i.opponentAppliedWp === "number");
    assert.ok(["actual", "flat_500_assumed", "shadow_actual"].includes(i.appliedWpReason));
    assert.ok(typeof i.gameId === "number");
  }
});

test("excludeHeadToHead changes OOWP as the classic NCAA formula would", () => {
  const withHH = computeRpi(ROUND_ROBIN, { excludeHeadToHead: false });
  const noHH = computeRpi(ROUND_ROBIN, { excludeHeadToHead: true });
  const a1 = withHH.find((r) => r.teamId === 1)!;
  const a2 = noHH.find((r) => r.teamId === 1)!;
  assert.notEqual(a1.oowp, a2.oowp);
});
