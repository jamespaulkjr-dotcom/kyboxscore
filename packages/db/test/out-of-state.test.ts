/**
 * Out-of-state opponents, per matchup.
 *
 * The bug these exist to prevent: one adjusted record stored per opponent.
 * RPI removes only the game against the team being rated, so an opponent who
 * played two Kentucky schools owes each of them a different number, and a
 * single stored value is wrong even on a week when the two happen to agree.
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const opts = { skip: HAS_DB ? false : "DATABASE_URL is not set" };

after(async () => {
  if (!HAS_DB) return;
  const { sql } = await import("../src/index.ts");
  await sql.end();
});

/**
 * One out-of-state opponent, two Kentucky teams, and results that differ, so
 * a single team-level adjusted record cannot possibly be right for both.
 */
async function jellicoFixture() {
  const db = await import("../src/index.ts");
  const { sql } = db;

  // Clear anything a previous run left behind. A fixture that only tidies up
  // afterwards is a fixture that breaks every test after the first failure.
  // rpi_input goes first: a published run holds the games it was computed
  // from, which is the whole point of that table and why it blocks a delete.
  await sql`
    DELETE FROM rpi_input WHERE game_id IN (
      SELECT id FROM game_all WHERE short_code IN ('zzjel1','zzjel2'))`;
  await sql`DELETE FROM game_all WHERE short_code IN ('zzjel1','zzjel2')`;
  await sql`
    DELETE FROM out_of_state_game WHERE team_id IN (
      SELECT t.id FROM team t JOIN school sc ON sc.id = t.school_id
      WHERE sc.slug = 'zz-jellico-tn')`;
  await sql`
    DELETE FROM out_of_state_record WHERE team_id IN (
      SELECT t.id FROM team t JOIN school sc ON sc.id = t.school_id
      WHERE sc.slug = 'zz-jellico-tn')`;

  const [season] = await sql<{ id: number; sportId: number }[]>`
    SELECT ss.id::int, ss.sport_id::int AS "sportId"
    FROM sport_season ss JOIN sport sp ON sp.id = ss.sport_id
    WHERE sp.slug = 'football' AND ss.is_current`;

  const [oosSchool] = await sql<{ id: number }[]>`
    INSERT INTO school (slug, name, short_name, city, state, is_khsaa_member)
    VALUES ('zz-jellico-tn', 'Jellico Test', 'Jellico Test (TN)', 'Jellico', 'TN', false)
    ON CONFLICT (slug) DO UPDATE SET city = EXCLUDED.city RETURNING id::int`;
  const [oosTeam] = await sql<{ id: number }[]>`
    INSERT INTO team (school_id, sport_id, gender, level)
    VALUES (${oosSchool.id}, ${season.sportId}, 'boys', 'varsity')
    ON CONFLICT (school_id, sport_id, gender, level) DO UPDATE SET level = 'varsity'
    RETURNING id::int`;
  await sql`
    INSERT INTO team_season (team_id, sport_season_id)
    VALUES (${oosTeam.id}, ${season.id}) ON CONFLICT DO NOTHING`;

  // Two Kentucky teams with no other games, so nothing else moves.
  const ky = await sql<{ id: number }[]>`
    SELECT t.id::int FROM team t
    JOIN school sc ON sc.id = t.school_id AND sc.state = 'KY'
    JOIN team_season ts ON ts.team_id = t.id AND ts.sport_season_id = ${season.id}
    WHERE t.id NOT IN (SELECT team_id FROM game_participant)
    LIMIT 2`;
  assert.ok(ky.length === 2, "fixtures need two unplayed Kentucky teams");

  // The out-of-state side BEATS the first and LOSES to the second. That is the
  // whole point: the two Kentucky teams must see different adjusted records.
  const codes = ["zzjel1", "zzjel2"];
  for (const [i, k] of ky.entries()) {
    await sql.begin(async (tx) => {
      const [g] = await tx<{ id: number }[]>`
        INSERT INTO game (sport_season_id, short_code, local_date, status, stage, periods_played)
        VALUES (${season.id}, ${codes[i]}, ${`2026-09-0${i + 1}`}::date, 'final',
                'regular_season', 4)
        RETURNING id::int`;
      const oosScore = i === 0 ? 30 : 7;
      const kyScore = i === 0 ? 7 : 30;
      await tx`
        INSERT INTO game_participant (game_id, team_id, role, score)
        VALUES (${g.id}, ${k.id}, 'home', ${kyScore}),
               (${g.id}, ${oosTeam.id}, 'away', ${oosScore})`;
    });
  }

  return { db, sql, season, oosTeam: oosTeam.id, kyA: ky[0].id, kyB: ky[1].id };
}

async function cleanup(sql: any, oosTeam: number) {
  await sql`
    DELETE FROM rpi_input WHERE game_id IN (
      SELECT id FROM game_all WHERE short_code IN ('zzjel1','zzjel2'))`;
  await sql`DELETE FROM game_all WHERE short_code IN ('zzjel1','zzjel2')`;
  await sql`DELETE FROM out_of_state_game WHERE team_id = ${oosTeam}`;
  await sql`DELETE FROM out_of_state_record WHERE team_id = ${oosTeam}`;
  await sql`DELETE FROM team_season WHERE team_id = ${oosTeam}`;
  await sql`DELETE FROM team WHERE id = ${oosTeam}`;
  await sql`DELETE FROM school WHERE slug = 'zz-jellico-tn'`;
}

test("two Kentucky teams get different adjusted records from one opponent", opts, async () => {
  const { db, sql, season, oosTeam, kyA, kyB } = await jellicoFixture();

  // Raw: 5-3 overall, which includes the win over A and the loss to B.
  await db.setOutOfStateRecords(
    season.id,
    [{ teamId: oosTeam, wins: 5, losses: 3, ties: 0 }],
    "test", null, "2026-09-08"
  );

  const rows = await db.adjustedOpponentWp(season.id);
  const forA = rows.find((r) => r.kentuckyTeamId === kyA && r.opponentTeamId === oosTeam);
  const forB = rows.find((r) => r.kentuckyTeamId === kyB && r.opponentTeamId === oosTeam);
  assert.ok(forA && forB, "both matchups are answered");

  // A lost to them, so A removes one of their WINS: 4-3.
  assert.deepEqual(
    [forA.adjustedWins, forA.adjustedLosses, forA.adjustedGames],
    [4, 3, 7]
  );
  // B beat them, so B removes one of their LOSSES: 5-2.
  assert.deepEqual(
    [forB.adjustedWins, forB.adjustedLosses, forB.adjustedGames],
    [5, 2, 7]
  );

  // And therefore two different winning percentages from one opponent. A
  // single stored adjusted record could not have produced both.
  assert.notEqual(forA.adjustedWp, forB.adjustedWp);
  assert.equal(Math.abs(forA.adjustedWp! - 4 / 7) < 1e-9, true);
  assert.equal(Math.abs(forB.adjustedWp! - 5 / 7) < 1e-9, true);

  // The raw record is untouched by either question.
  assert.deepEqual([forA.rawWins, forA.rawLosses], [5, 3]);
  assert.deepEqual([forB.rawWins, forB.rawLosses], [5, 3]);

  await cleanup(sql, oosTeam);
});

test("an opponent who played nobody else has no winning percentage", opts, async () => {
  const { db, sql, season, oosTeam, kyA } = await jellicoFixture();

  // Only one of the two Kentucky games matters here, so drop the other: an
  // opponent with two Kentucky games still has one left after the head-to-head
  // is removed, which is correct RPI and not the case being tested.
  await sql`
    DELETE FROM rpi_input WHERE game_id IN (
      SELECT id FROM game_all WHERE short_code = 'zzjel2')`;
  await sql`DELETE FROM game_all WHERE short_code = 'zzjel2'`;

  // 1-0: exactly the one Kentucky game and nothing else all season.
  await db.setOutOfStateRecords(
    season.id,
    [{ teamId: oosTeam, wins: 1, losses: 0, ties: 0 }],
    "test", null, "2026-09-08"
  );

  const [row] = (await db.adjustedOpponentWp(season.id)).filter(
    (r) => r.kentuckyTeamId === kyA && r.opponentTeamId === oosTeam
  );
  assert.ok(row, "the matchup is still answered");
  assert.equal(row.adjustedGames, 0);
  assert.equal(row.adjustedWp, null, "no games means no percentage, not .500");
  assert.equal(row.usedFallback, true);
  assert.equal(row.fallbackWp, 0.5);
  // The fallback is a separate number from the absent real one, on purpose:
  // .500 here is a neutral stand-in, never a claim about how they played.
  assert.notEqual(row.adjustedWp, row.fallbackWp);
  // And the raw record still says what they actually did.
  assert.deepEqual([row.rawWins, row.rawLosses], [1, 0]);

  await cleanup(sql, oosTeam);
});

test("a completed schedule supersedes the hand-entered record", opts, async () => {
  const { db, sql, season, oosTeam, kyA } = await jellicoFixture();
  await db.setOutOfStateRecords(
    season.id,
    [{ teamId: oosTeam, wins: 5, losses: 3, ties: 0 }],
    "typed by hand", null, "2026-09-08"
  );

  // Three of their own games with scores: 2-1, which should win over the 5-3.
  await db.upsertOutOfStateGames(
    season.id,
    [1, 2, 3].map((n) => ({
      teamId: oosTeam,
      opponentTeamId: null,
      opponentName: `Somebody ${n}`,
      opponentState: "TN",
      localDate: `2026-08-0${n}`,
      homeAway: "home" as const,
      status: "Final",
      result: (n === 3 ? "L" : "W") as "W" | "L",
      teamScore: n === 3 ? 0 : 20,
      opponentScore: n === 3 ? 20 : 0,
      isKentuckyOpponent: false,
      kentuckyGameId: null,
      gameKey: `zz-${n}`,
    })),
    "test schedule", null, "2026-09-08"
  );

  const [row] = (await db.adjustedOpponentWp(season.id)).filter(
    (r) => r.kentuckyTeamId === kyA && r.opponentTeamId === oosTeam
  );
  // The schedule says 2-1 and none of those three were the Kentucky game, so
  // nothing is removed and the adjusted record is the schedule's.
  assert.deepEqual([row.rawWins, row.rawLosses], [2, 1]);
  assert.equal(row.adjustedGames, 3);

  await cleanup(sql, oosTeam);
});

test("the same schedule row imported twice makes one row", opts, async () => {
  const { db, sql, season, oosTeam } = await jellicoFixture();
  const one = {
    teamId: oosTeam,
    opponentTeamId: null,
    opponentName: "Repeat High",
    opponentState: "TN",
    localDate: "2026-08-15",
    homeAway: "away" as const,
    status: "Final",
    result: "W" as const,
    teamScore: 21,
    opponentScore: 14,
    isKentuckyOpponent: false,
    kentuckyGameId: null,
    gameKey: "zz-dup",
  };
  await db.upsertOutOfStateGames(season.id, [one], "test", null, "2026-09-08");
  await db.upsertOutOfStateGames(season.id, [one], "test", null, "2026-09-09");

  const [{ n }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM out_of_state_game
    WHERE team_id = ${oosTeam} AND opponent_name = 'Repeat High'`;
  assert.equal(n, 1, "deduplicated on team, date and opponent, not on a name alone");

  await cleanup(sql, oosTeam);
});

/* --------------------------------------------------------------------------
 * The collisions that caused nine mismatched games, named one by one. Each of
 * these is a pair of real schools sharing a name across a state line.
 * ------------------------------------------------------------------------ */

/** Make sure both halves of a collision exist, then ask the matcher. */
async function collision(
  sql: any,
  kyName: string,
  oos: { name: string; short: string; city: string; state: string; slug: string }
) {
  await sql`
    INSERT INTO school (slug, name, short_name, city, state, is_khsaa_member)
    VALUES (${oos.slug}, ${oos.name}, ${oos.short}, ${oos.city}, ${oos.state}, false)
    ON CONFLICT (slug) DO UPDATE SET city = EXCLUDED.city, state = EXCLUDED.state`;
  const [ky] = await sql`
    SELECT id::int FROM school WHERE state = 'KY'
      AND (name = ${kyName} OR short_name = ${kyName} OR name = ${kyName + " High School"})`;
  return ky?.id ?? null;
}

test("Saint Xavier of Louisville is not St. Xavier of Cincinnati", opts, async () => {
  const { sql, matchSchoolNames } = await import("../src/index.ts").then((m) => ({
    sql: m.sql, matchSchoolNames: m.matchSchoolNames,
  }));
  const kyId = await collision(sql, "Saint Xavier", {
    slug: "zz-st-xavier-oh", name: "St. Xavier", short: "St. Xavier (OH)",
    city: "Cincinnati", state: "OH",
  });

  const [ky] = await matchSchoolNames([{ name: "Saint Xavier", state: "KY", city: "Louisville" }]);
  const [oh] = await matchSchoolNames([{ name: "St. Xavier", state: "OH", city: "Cincinnati" }]);
  if (kyId) assert.equal(ky.schoolId, kyId, "Kentucky asked for, Kentucky returned");
  assert.ok(oh.schoolId, "Ohio asked for, Ohio returned");
  assert.notEqual(ky.schoolId, oh.schoolId);

  // And Ohio must never answer with the Kentucky school.
  const [ohOnly] = await matchSchoolNames([{ name: "Saint Xavier", state: "OH" }]);
  if (ohOnly.schoolId !== null) {
    const [got] = await sql`SELECT state FROM school WHERE id = ${ohOnly.schoolId}`;
    assert.equal(got.state, "OH");
  }
  await sql`DELETE FROM school WHERE slug = 'zz-st-xavier-oh'`;
});

test("Franklin County of Frankfort is not Franklin County of Winchester", opts, async () => {
  const { sql, matchSchoolNames } = await import("../src/index.ts").then((m) => ({
    sql: m.sql, matchSchoolNames: m.matchSchoolNames,
  }));
  const kyId = await collision(sql, "Franklin County", {
    slug: "zz-franklin-county-tn", name: "Franklin County", short: "Franklin County (TN)",
    city: "Winchester", state: "TN",
  });

  // The name alone is now unanswerable, which is the correct answer.
  const [bare] = await matchSchoolNames(["Franklin County"]);
  assert.equal(bare.schoolId, null, "same name in two states, so no answer");
  assert.ok(bare.candidates.length >= 2, "and it says which states");

  const [ky] = await matchSchoolNames([{ name: "Franklin County", state: "KY", city: "Frankfort" }]);
  const [tn] = await matchSchoolNames([{ name: "Franklin County", state: "TN", city: "Winchester" }]);
  if (kyId) assert.equal(ky.schoolId, kyId);
  assert.ok(tn.schoolId);
  assert.notEqual(ky.schoolId, tn.schoolId);

  await sql`DELETE FROM school WHERE slug = 'zz-franklin-county-tn'`;
});

test("Union County of Kentucky is not Union City of Tennessee", opts, async () => {
  const { sql, matchSchoolNames } = await import("../src/index.ts").then((m) => ({
    sql: m.sql, matchSchoolNames: m.matchSchoolNames,
  }));
  await collision(sql, "Union County", {
    slug: "zz-union-city-tn", name: "Union City", short: "Union City (TN)",
    city: "Union City", state: "TN",
  });

  const [tn] = await matchSchoolNames([{ name: "Union City", state: "TN", city: "Union City" }]);
  assert.ok(tn.schoolId, "Union City resolves in Tennessee");

  // These are different names, not a collision, so the danger is fuzzy
  // matching pulling one into the other. Kentucky must stay Kentucky.
  const [ky] = await matchSchoolNames([{ name: "Union County", state: "KY" }]);
  if (ky.schoolId) {
    const [got] = await sql`SELECT state FROM school WHERE id = ${ky.schoolId}`;
    assert.equal(got.state, "KY");
    assert.notEqual(ky.schoolId, tn.schoolId);
  }
  await sql`DELETE FROM school WHERE slug = 'zz-union-city-tn'`;
});

test("Badin and Archbishop Moeller resolve by alias, inside their state", opts, async () => {
  const { sql, matchSchoolNames } = await import("../src/index.ts").then((m) => ({
    sql: m.sql, matchSchoolNames: m.matchSchoolNames,
  }));
  const pairs = [
    { slug: "zz-badin-oh", name: "Stephen T. Badin", short: "Stephen T. Badin (OH)",
      city: "Hamilton", alias: "Badin" },
    { slug: "zz-moeller-oh", name: "Moeller", short: "Moeller (OH)",
      city: "Cincinnati", alias: "Archbishop Moeller" },
  ];
  for (const p of pairs) {
    const [school] = await sql`
      INSERT INTO school (slug, name, short_name, city, state, is_khsaa_member)
      VALUES (${p.slug}, ${p.name}, ${p.short}, ${p.city}, 'OH', false)
      ON CONFLICT (slug) DO UPDATE SET city = EXCLUDED.city RETURNING id::int`;
    await sql`
      INSERT INTO school_alias (school_id, alias)
      VALUES (${school.id}, ${p.alias}) ON CONFLICT DO NOTHING`;

    // The alias is the whole point: these are the names the schools use and
    // we do not. It has to win, and it did not until the state branch was
    // taught to run after it.
    const [byAlias] = await matchSchoolNames([{ name: p.alias, state: "OH", city: p.city }]);
    assert.equal(byAlias.schoolId, school.id, `${p.alias} resolves by alias`);

    const [plain] = await matchSchoolNames([p.alias]);
    assert.equal(plain.schoolId, school.id, "and without a state hint too");

    // But an alias still cannot drag a match across a border.
    const [wrongState] = await matchSchoolNames([{ name: p.alias, state: "TN" }]);
    assert.equal(wrongState.schoolId, null, `${p.alias} is not in Tennessee`);
  }
  for (const p of pairs) {
    await sql`DELETE FROM school_alias WHERE school_id IN (SELECT id FROM school WHERE slug = ${p.slug})`;
    await sql`DELETE FROM school WHERE slug = ${p.slug}`;
  }
});
