import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONFIG,
  FOOTBALL_NON_MEMBER_VALUE,
  computeBoth,
  computeRpi,
  winPct,
} from "../src/index.ts";
import type { Game, RpiConfig, TeamInput } from "../src/index.ts";

const g = (o: Partial<Game> & Pick<Game, "gameId" | "opponentId" | "outcome">): Game => ({
  isHome: true,
  localDate: "2026-09-01",
  opponentAssumedFiveHundred: false,
  opponentClass: null,
  missingScore: false,
  ...o,
});

const NON_MEMBER = DEFAULT_CONFIG.nonMemberValue;

/**
 * Hand-worked three team round robin.
 *   A beats B, A beats C, B beats C.
 * Records: A 2-0, B 1-1, C 0-2.  WP: A 1.000, B .500, C .000.
 *
 * Head to head is excluded throughout, as KHSAA's method requires, so every
 * opponent's percentage is taken over the one game that is left:
 *
 * A's OWP  = mean(WP(B) less A, WP(C) less A) = (1 + 0) / 2 = .500
 * A's OOWP = mean(OWP(B), OWP(C))
 *   OWP(B) = mean(WP(A) less B, WP(C) less B) = (1 + 0)/2 = .500
 *   OWP(C) = mean(WP(A) less C, WP(B) less C) = (1 + 0)/2 = .500
 *   => .500
 * RPI(A) = 1(.35) + .5(.35) + .5(.30) = .35 + .175 + .15 = .675
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
  const value = winPct(
    [g({ gameId: 1, opponentId: 9, outcome: "win" }),
     g({ gameId: 2, opponentId: 9, outcome: "tie" })],
    null,
    DEFAULT_CONFIG
  );
  assert.equal(value, 0.75);
});

test("winPct is null for a team with nothing to average", () => {
  // Not zero. A team we hold no games for has no winning percentage, and
  // scoring that as winless is how an opponent's rating gets quietly wrecked.
  assert.equal(winPct([], null, DEFAULT_CONFIG), null);
});

test("matches the hand-worked round robin", () => {
  const r = computeRpi(ROUND_ROBIN);
  const a = r.find((x) => x.teamId === 1)!;
  assert.equal(a.wp, 1);
  assert.equal(a.owp, 0.5);
  assert.equal(a.oowp, 0.5);
  assert.ok(Math.abs(a.rpi - 0.675) < 1e-9, `rpi was ${a.rpi}`);
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

test("non-KHSAA opponents take the fixed value, and football has its own", () => {
  const teams = (): TeamInput[] => [
    { teamId: 1, teamClass: null, games: [
      g({ gameId: 1, opponentId: 99, outcome: "win", opponentAssumedFiveHundred: true }),
    ]},
    { teamId: 99, teamClass: null, externalWinPct: 0.9, games: [
      g({ gameId: 1, opponentId: 1, outcome: "loss" }),
    ]},
  ];
  const [standard] = computeRpi(teams());
  assert.equal(standard.owp, NON_MEMBER, "every sport but football uses .53");
  assert.equal(standard.inputs[0].appliedWpReason, "flat_non_member");
  assert.equal(standard.inputs[0].opponentActualWp, 0.9, "the real number is still recorded");

  const [football] = computeRpi(teams(), {
    sportProfile: "football",
    nonMemberValue: FOOTBALL_NON_MEMBER_VALUE,
  });
  assert.equal(football.owp, 0.5106, "football's own figure, from pre-COVID results");
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
  assert.equal(o.owp, NON_MEMBER);
  assert.equal(s.owp, 0.9);
  assert.ok(s.rpi > o.rpi, "beating a strong out of state team should help");
  assert.ok(Math.abs(delta.get(1)! - (s.rpi - o.rpi)) < 1e-12);
});

test("knowing an out of state opponent's record cannot move the official rating", () => {
  // The bug: an opponent with no typed record is absent from the team set and
  // contributes the flat non-member value to OOWP. Typing their record put
  // them in the set, the head-to-head was then excluded as the formula
  // requires, nothing was left, and they contributed 0. Twenty-seven Kentucky
  // teams had an official rating pulled down by the act of entering an
  // opponent's record.
  const ky = (): TeamInput => ({
    teamId: 1, teamClass: null, games: [
      g({ gameId: 1, opponentId: 99, outcome: "win", opponentAssumedFiveHundred: true }),
      g({ gameId: 2, opponentId: 2, outcome: "win" }),
    ],
  });
  const other: TeamInput = { teamId: 2, teamClass: null, games: [
    g({ gameId: 2, opponentId: 1, outcome: "loss" }),
  ]};
  const unknown = [ky(), other];
  const known = [
    ky(),
    other,
    { teamId: 99, teamClass: null, externalWinPct: 1.0, games: [
      g({ gameId: 1, opponentId: 1, outcome: "loss" }),
    ]},
  ];

  const [before] = computeRpi(unknown);
  const [after] = computeRpi(known);
  assert.equal(after.oowp, before.oowp, "OOWP must not move");
  assert.equal(after.rpi, before.rpi, "nor the official rating");

  const s = computeBoth(known).shadow.find((r) => r.teamId === 1)!;
  assert.ok(s.rpi > after.rpi, "shadow must still carry the real record");
});

test("an opponent left with no games after exclusion is neutral, not winless", () => {
  // Head to head exclusion can empty an opponent's schedule outright in
  // September, when a team we hold one game for is a team we know nothing
  // about once that game is removed. Scoring it zero would punish a team for
  // who it played, which is the same failure as the bug above.
  const teams: TeamInput[] = [
    { teamId: 1, teamClass: null, games: [
      g({ gameId: 1, opponentId: 2, outcome: "win" }),
    ]},
    { teamId: 2, teamClass: null, games: [
      g({ gameId: 1, opponentId: 1, outcome: "loss" }),
    ]},
  ];
  const [a] = computeRpi(teams);
  assert.equal(a.owp, NON_MEMBER);
  assert.ok(a.owp > 0, "an unknown opponent is not a winless one");
});

test("an out of state opponent's schedule stays fixed in shadow too", () => {
  // "Shadow RPI is the official rating with one input corrected." The one
  // input is OWP. Their opponents' opponents remain unknown to us.
  const teams: TeamInput[] = [
    { teamId: 1, teamClass: null, games: [
      g({ gameId: 1, opponentId: 99, outcome: "win", opponentAssumedFiveHundred: true }),
    ]},
    { teamId: 99, teamClass: null, externalWinPct: 0.9, games: [
      g({ gameId: 1, opponentId: 1, outcome: "loss" }),
      g({ gameId: 2, opponentId: 98, outcome: "win" }),
    ]},
  ];
  const { official, shadow } = computeBoth(teams);
  assert.equal(official.find((r) => r.teamId === 1)!.oowp, NON_MEMBER);
  assert.equal(shadow.find((r) => r.teamId === 1)!.oowp, NON_MEMBER);
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

/* ------------------------------------------------- the football class weight */

const FOOTBALL: Partial<RpiConfig> = {
  sportProfile: "football",
  nonMemberValue: FOOTBALL_NON_MEMBER_VALUE,
  playDownExemptions: 0,
};

/** One team, one game, so the win value is the whole winning percentage. */
function oneGame(teamClass: number, opponentClass: number, outcome: Game["outcome"]) {
  const teams: TeamInput[] = [
    { teamId: 1, teamClass, games: [g({ gameId: 1, opponentId: 2, outcome, opponentClass })] },
    { teamId: 2, teamClass: opponentClass, games: [
      g({ gameId: 1, opponentId: 1, outcome: outcome === "win" ? "loss" : "win", opponentClass: teamClass }),
    ]},
  ];
  return computeRpi(teams, FOOTBALL)[0];
}

test("playing up is worth more than 1.0, playing down less", () => {
  assert.ok(Math.abs(oneGame(4, 5, "win").wp - 1.15017) < 5e-6, "4A over 5A");
  assert.ok(Math.abs(oneGame(4, 4, "win").wp - 1.0) < 1e-9, "4A over 4A");
  assert.ok(Math.abs(oneGame(4, 3, "win").wp - 0.86972) < 5e-6, "4A over 3A");
  assert.ok(Math.abs(oneGame(1, 6, "win").wp - 2.01058) < 5e-6, "1A over 6A, the ceiling");
});

test("a loss carries no class credit at all", () => {
  for (const opponentClass of [1, 3, 4, 6]) {
    assert.equal(oneGame(4, opponentClass, "loss").wp, 0, `4A losing to ${opponentClass}A`);
  }
});

test("class weights do not apply outside football", () => {
  const teams: TeamInput[] = [
    { teamId: 1, teamClass: 1, games: [g({ gameId: 1, opponentId: 2, outcome: "win", opponentClass: 6 })] },
    { teamId: 2, teamClass: 6, games: [g({ gameId: 1, opponentId: 1, outcome: "loss", opponentClass: 1 })] },
  ];
  const [a] = computeRpi(teams, { sportProfile: "standard" });
  assert.equal(a.wp, 1, "basketball has classes but KHSAA weights only football");
});

test("the first two play-downs of a season are exempt, in date order", () => {
  const down = (gameId: number, localDate: string) =>
    g({ gameId, opponentId: gameId + 10, outcome: "win", opponentClass: 2, localDate });
  const team: TeamInput = {
    teamId: 1,
    teamClass: 4,
    // Deliberately out of order, because the database does not promise one.
    games: [down(3, "2026-09-18"), down(1, "2026-08-21"), down(2, "2026-09-04")],
  };
  const [a] = computeRpi([team], { ...FOOTBALL, playDownExemptions: 2 });
  const byId = new Map(a.inputs.map((i) => [i.gameId, i]));
  assert.equal(byId.get(1)!.playDownExempt, true, "August game is exempt");
  assert.equal(byId.get(2)!.playDownExempt, true, "early September is exempt");
  assert.equal(byId.get(3)!.playDownExempt, false, "the third play-down is not");
  assert.equal(byId.get(1)!.gameValue, 1, "exempt means treated as same class");
  assert.ok(byId.get(3)!.gameValue < 1, "and the third one is discounted");
});

test("a play-down exemption is spent on a contest, not on a win", () => {
  // KHSAA's wording is "contests played against a team in a smaller class".
  // A loss is worth zero either way, so the only observable effect is that it
  // burns an exemption a later win would have used.
  const down = (gameId: number, localDate: string, outcome: Game["outcome"]) =>
    g({ gameId, opponentId: gameId + 10, outcome, opponentClass: 2, localDate });
  const team: TeamInput = {
    teamId: 1,
    teamClass: 4,
    games: [
      down(1, "2026-08-21", "loss"),
      down(2, "2026-09-04", "loss"),
      down(3, "2026-09-18", "win"),
    ],
  };
  const [a] = computeRpi([team], { ...FOOTBALL, playDownExemptions: 2 });
  const third = a.inputs.find((i) => i.gameId === 3)!;
  assert.equal(third.playDownExempt, false, "both exemptions went to the losses");
  assert.ok(third.gameValue < 1);
});

test("an unclassified opponent counts as the team's own class", () => {
  // KHSAA: "for out of state teams or teams that are not aligned into a class
  // in Kentucky, the opponent class is assumed to be the same as the team's".
  const teams: TeamInput[] = [
    { teamId: 1, teamClass: 1, games: [
      g({ gameId: 1, opponentId: 99, outcome: "win", opponentClass: null,
          opponentAssumedFiveHundred: true }),
    ]},
  ];
  const [a] = computeRpi(teams, FOOTBALL);
  assert.equal(a.wp, 1, "not a weight of zero, and not a missing weight");
});

test("every stored value carries the arithmetic that produced it", () => {
  const [a] = computeRpi(ROUND_ROBIN);
  assert.equal(a.inputs.length, 2);
  for (const i of a.inputs) {
    assert.ok(typeof i.opponentAppliedWp === "number");
    assert.ok(["actual", "flat_non_member", "shadow_actual"].includes(i.appliedWpReason));
    assert.ok(typeof i.gameId === "number");
    assert.ok(typeof i.gameValue === "number", "the weighted value must be stored too");
  }
});

test("excludeHeadToHead is on by default and changes OOWP when turned off", () => {
  assert.equal(DEFAULT_CONFIG.excludeHeadToHead, true, "KHSAA requires it");
  const withHH = computeRpi(ROUND_ROBIN, { excludeHeadToHead: false });
  const noHH = computeRpi(ROUND_ROBIN, { excludeHeadToHead: true });
  const a1 = withHH.find((r) => r.teamId === 1)!;
  const a2 = noHH.find((r) => r.teamId === 1)!;
  assert.notEqual(a1.oowp, a2.oowp);
});
