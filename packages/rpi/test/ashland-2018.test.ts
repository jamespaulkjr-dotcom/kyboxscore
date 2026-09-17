import test from "node:test";
import assert from "node:assert/strict";
import { computeRpi, KHSAA_CLASS_WEIGHTS, type TeamInput } from "../src/index.ts";
import {
  CLASS,
  SCHEDULE,
  PUBLISHED,
  PUBLISHED_OPPONENT_WP,
  PUBLISHED_OWP_DETAIL,
} from "./ashland-2018.fixture.ts";

/**
 * KHSAA's published worked example, run through the engine.
 *
 * This is the only test that can tell us the football formula is right. It is
 * not a hand-built scenario that agrees with our own reading - it is their
 * example, their numbers, printed to five decimals, and it exercises every
 * rule at once: class weights up and down, an unweighted loss, out of state
 * opponents, and the head to head exclusion at both OWP and OOWP depth.
 *
 * The example is from 2018, so it runs under the rules of the day: a flat
 * .50000 for non-members and no play-down exemptions, both of which KHSAA
 * changed for 2023-24. That those are config rather than constants is the
 * reason this test can exist at all.
 */

const ID = new Map(Object.keys(SCHEDULE).sort().map((n, i) => [n, i + 1]));
const idOf = (name: string): number => {
  if (!ID.has(name)) ID.set(name, ID.size + 1);
  return ID.get(name)!;
};

const CONFIG_2018 = {
  sportProfile: "football" as const,
  nonMemberValue: 0.5,
  playDownExemptions: 0,
  excludeHeadToHead: true,
};

function buildTeams(): TeamInput[] {
  return Object.entries(SCHEDULE).map(([name, games]) => ({
    teamId: idOf(name),
    teamClass: CLASS[name] ?? null,
    games: games.map((g, i) => ({
      gameId: idOf(name) * 1000 + i,
      opponentId: idOf(g.opp),
      outcome: (g.win === 1 ? "win" : g.win === 0 ? "loss" : "tie") as
        | "win"
        | "loss"
        | "tie",
      isHome: true,
      localDate: g.date,
      opponentAssumedFiveHundred: CLASS[g.opp] === undefined,
      opponentClass: CLASS[g.opp] ?? null,
      missingScore: false,
    })),
  }));
}

/** Five decimals, because that is the precision KHSAA publishes at. */
function close(actual: number, expected: number, what: string) {
  assert.ok(
    Math.abs(actual - expected) < 5e-6,
    `${what}: expected ${expected}, got ${actual.toFixed(7)}`
  );
}

test("the published class weights are a 15% step, rounded as published", () => {
  for (let c = 2; c <= 6; c++) {
    const step = KHSAA_CLASS_WEIGHTS[c] / KHSAA_CLASS_WEIGHTS[c - 1];
    assert.ok(Math.abs(step - 1.15) < 5e-4, `${c}A/${c - 1}A was ${step}`);
  }
  // And the rounding is why we divide the table instead of raising 1.15 to a
  // power: Raceland (1A) over Lawrence County (3A) is 1.32200 in KHSAA's
  // example, not the 1.3225 the exponential form gives.
  const raceland = KHSAA_CLASS_WEIGHTS[3] / KHSAA_CLASS_WEIGHTS[1];
  close(raceland, 1.322, "1A beating 3A");
  assert.ok(Math.abs(raceland - 1.15 ** 2) > 4e-4, "the two forms must differ");
});

test("Ashland Blazer 2018: every per-game value matches the published table", () => {
  const results = computeRpi(buildTeams(), CONFIG_2018);
  const ashland = results.find((r) => r.teamId === idOf("Ashland Blazer"))!;
  const byOpponent = new Map(
    [...ID.entries()].map(([name, id]) => [id, name] as const)
  );

  const expected: Record<string, number> = {
    Raceland: 0.65788,
    "Harlan County": 1.15017,
    "Greenup County": 1.0,
    "Rowan County": 1.0,
    "Johnson Central": 0.0,
    "George Washington, WV": 1.0,
    Russell: 0.86972,
    "Ironton, OH": 1.0,
    "Boyd County": 1.0,
    "East Carter": 1.0,
  };

  assert.equal(ashland.inputs.length, 10);
  for (const input of ashland.inputs) {
    const name = byOpponent.get(input.opponentId)!;
    close(input.gameValue, expected[name], `game value vs ${name}`);
  }
});

test("Ashland Blazer 2018: a loss carries no class credit", () => {
  const results = computeRpi(buildTeams(), CONFIG_2018);
  const ashland = results.find((r) => r.teamId === idOf("Ashland Blazer"))!;
  const johnsonCentral = ashland.inputs.find(
    (i) => i.opponentId === idOf("Johnson Central")
  )!;
  // Same class, so this only proves the loss is zero. The rule that matters
  // is that it would still be zero against 6A - which Harlan County's own
  // row proves, since they lost to 4A and 1A opponents alike at 0.00000.
  assert.equal(johnsonCentral.resultValue, 0);
  assert.equal(johnsonCentral.gameValue, 0);
});

test("Ashland Blazer 2018: opponent WP drops the head to head game", () => {
  const results = computeRpi(buildTeams(), CONFIG_2018);
  const ashland = results.find((r) => r.teamId === idOf("Ashland Blazer"))!;
  const byOpponent = new Map(
    [...ID.entries()].map(([name, id]) => [id, name] as const)
  );

  for (const input of ashland.inputs) {
    const name = byOpponent.get(input.opponentId)!;
    close(input.opponentAppliedWp, PUBLISHED_OPPONENT_WP[name], `WP of ${name}`);
  }
});

test("a football winning percentage is allowed above 1.000", () => {
  const results = computeRpi(buildTeams(), CONFIG_2018);
  const ashland = results.find((r) => r.teamId === idOf("Ashland Blazer"))!;
  const raceland = ashland.inputs.find((i) => i.opponentId === idOf("Raceland"))!;

  // KHSAA prints 1.07063 for Raceland inside Ashland's OWP: a 1A team that
  // played up all season. Their documentation says this is expected, and a
  // formula that clamps winning percentage at 1.000 cannot produce it.
  assert.ok(
    raceland.opponentAppliedWp > 1,
    `Raceland's applied WP was ${raceland.opponentAppliedWp}`
  );
  close(raceland.opponentAppliedWp, 1.07063, "Raceland WP");
});

test("the rated team stays in its opponent's OWP", () => {
  const results = computeRpi(buildTeams(), CONFIG_2018);
  const byId = new Map(results.map((r) => [r.teamId, r]));

  // The exclusion belongs to the pair being averaged, not to the team being
  // rated. KHSAA's example makes this explicit by printing Ashland Blazer,
  // at 0.89110, as one of the ten opponents in Raceland's own OWP.
  for (const [team, detail] of Object.entries(PUBLISHED_OWP_DETAIL)) {
    const result = byId.get(idOf(team))!;
    for (const [opp, wp] of Object.entries(detail.opponents)) {
      const input = result.inputs.find((i) => i.opponentId === idOf(opp));
      assert.ok(input, `${team} should have played ${opp}`);
      close(input.opponentAppliedWp, wp, `${team}'s opponent ${opp}`);
    }
    close(result.owp, detail.owp, `${team} OWP`);
  }
});

test("Ashland Blazer 2018: WP, OWP, OOWP and RPI all reproduce", () => {
  const results = computeRpi(buildTeams(), CONFIG_2018);
  const ashland = results.find((r) => r.teamId === idOf("Ashland Blazer"))!;

  close(ashland.wp, PUBLISHED.wp, "WP");
  close(ashland.owp, PUBLISHED.owp, "OWP");

  // OOWP reaches two steps out from Ashland, and two teams that far out -
  // North Laurel and Betsy Layne - have schedules the PDF only prints in
  // part, so their winning percentages here are built from fewer games than
  // KHSAA used. Every other constituent reproduces exactly; these two drag
  // OOWP about 2e-3 high, and the rating with it. Tightened to 5e-6 the day
  // those two schedules are transcribed in full.
  const TRANSCRIPTION_SLACK = 3e-3;
  assert.ok(
    Math.abs(ashland.oowp - PUBLISHED.oowp) < TRANSCRIPTION_SLACK,
    `OOWP: expected ${PUBLISHED.oowp}, got ${ashland.oowp.toFixed(7)}`
  );
  assert.ok(
    Math.abs(ashland.rpi - PUBLISHED.rpi) < TRANSCRIPTION_SLACK,
    `RPI: expected ${PUBLISHED.rpi}, got ${ashland.rpi.toFixed(7)}`
  );

  // The rating is the weighted sum of exactly those three, exactly.
  close(
    ashland.wp * 0.35 + ashland.owp * 0.35 + ashland.oowp * 0.3,
    ashland.rpi,
    "RPI from components"
  );
});
