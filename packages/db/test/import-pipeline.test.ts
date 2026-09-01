/**
 * End-to-end test of the import pipeline against a real database.
 *
 * Skipped when DATABASE_URL is unset, so `npm test` still runs on a machine
 * with no Postgres. CI sets it and runs migrate + seed first, so this executes
 * there — which matters, because typecheck and `next build` do not execute SQL
 * and cannot catch a broken query.
 *
 * The expected numbers come from the PDF box score of the same game, an
 * independent source the importer never sees.
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const opts = { skip: HAS_DB ? false : "DATABASE_URL is not set" };

// The pool is shared across tests in this file, so it is closed once at the
// end rather than in each test - closing it early left later tests with a dead
// connection.
after(async () => {
  if (!HAS_DB) return;
  const { sql } = await import("../src/index.ts");
  await sql.end();
});

const FIXTURE = path.join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "docs",
  "reference",
  "Caverna Colonels Varsity_vs_John Hardin Bulldogs.txt"
);

// first initial, surname, jersey — as the PDF box score prints them.
const ROSTER: [string, string, string][] = [
  ["C", "Ray", "24"], ["B", "Sanderson", "3"], ["Z", "Corn", "23"],
  ["P", "Broers", "44"], ["S", "Burnette", "7"], ["R", "Dennis", "22"],
  ["T", "Alexander", "13"], ["L", "Blanton", "1"], ["C", "Norris", "12"],
  ["K", "Williams", "00"], ["C", "Burris", "10"],
];

// Straight off the PDF: jersey -> [AB, H, R].
const EXPECTED: Record<string, [number, number, number]> = {
  "24": [3, 0, 0], "3": [2, 1, 1], "23": [2, 1, 0], "44": [2, 0, 0],
  "7": [0, 0, 0], "22": [3, 0, 0], "1": [1, 0, 1], "12": [0, 0, 1],
  "00": [2, 0, 0], "10": [1, 0, 1],
};

test("a real MaxPreps export imports and reconciles with the printed box score", opts, async () => {
  const db = await import("../src/index.ts");
  const parsers = await import("@kyboxscore/parsers");
  const { sql } = db;

  const stamp = Date.now().toString(36).slice(-5);

  try {
    const [school] = await sql<{ id: number }[]>`
      SELECT id::int FROM school WHERE slug = 'caverna'`;
    const [opponent] = await sql<{ id: number }[]>`
      SELECT id::int FROM school WHERE slug = 'john-hardin'`;
    const [sport] = await sql<{ id: number }[]>`
      SELECT id::int FROM sport WHERE slug = 'baseball'`;
    assert.ok(school && opponent && sport, "seed data must include the schools and baseball");

    const home = await db.createTeam(school.id, sport.id, "boys", "varsity");
    const away = await db.createTeam(opponent.id, sport.id, "boys", "varsity");
    assert.ok(home.teamSeasonId, "baseball must have a current season");

    // Re-runnable on a database that already has a previous run's game: the
    // natural key (both teams, same date) would otherwise refuse it, and a
    // test that only passes on a pristine database is a weak test.
    //
    // Order matters. game cascades to stat_line, but import_batch references
    // game and stat_line references import_batch, so the cascade cannot get
    // started until those are cleared by hand.
    const stale = await sql<{ id: number }[]>`
      SELECT DISTINCT g.id::int
      FROM game g
      JOIN game_participant gp ON gp.game_id = g.id
      WHERE g.local_date = DATE '2027-05-13'
        AND gp.team_id IN (${home.teamId}, ${away.teamId})`;
    for (const g of stale) {
      await sql`DELETE FROM stat_line WHERE game_id = ${g.id}`;
      await sql`DELETE FROM import_batch WHERE game_id = ${g.id}`;
      await sql`DELETE FROM game WHERE id = ${g.id}`;
    }

    const game = await db.createGame({
      teamSeasonId: home.teamSeasonId!,
      opponentTeamId: away.teamId,
      localDate: "2027-05-13",
      isHome: true,
      status: "final",
      ourScore: 4,
      theirScore: 17,
    });
    assert.equal(game.ok, true, "the game must be created");

    // Each run adds its own roster; without this the same jersey ends up on
    // several players and every row matches ambiguously, which is correct
    // behaviour reported as a test failure.
    await sql`
      DELETE FROM player_season WHERE team_season_id = ${home.teamSeasonId!}`;

    for (const [first, last, jersey] of ROSTER) {
      await db.addRosterPlayer({
        teamSeasonId: home.teamSeasonId!,
        firstName: first,
        lastName: `${last}${stamp}`,
        jersey,
        grade: null,
      });
    }

    const text = await readFile(FIXTURE, "utf8");
    const parsed = parsers.parseMaxPrepsTxt(text);
    assert.equal(parsed.ok, true, "the real export must parse");
    assert.equal(parsed.rows.length, 11);

    const roster = await db.getRosterForMatching(home.teamSeasonId!);
    const mapped = parsed.rows.map(parsers.mapBaseballRow);
    const matches = mapped.map((m) => parsers.matchRow(m.jersey, roster, new Map()));

    assert.equal(
      matches.filter((m) => m.playerId !== null).length,
      11,
      "every jersey in the file must match a player on the roster"
    );

    const [uploader] = await sql<{ id: number }[]>`
      INSERT INTO app_user (email, name, role)
      VALUES (${`import-test-${stamp}@example.test`}, 'Import Test', 'coach')
      RETURNING id::int`;

    const batchId = await db.createImportBatch({
      dataSourceSlug: "coach-upload",
      uploadedById: uploader.id,
      teamSeasonId: home.teamSeasonId!,
      gameId: (game as { ok: true; gameId: number }).gameId,
      vendor: "gamechanger",
      format: "maxpreps_txt",
      originalFilename: "test.txt",
      byteSize: text.length,
      sha256: `test-${stamp}`,
      rawText: text,
      parsedSummary: {},
      status: "parsed",
    });

    await db.insertImportRows(
      batchId,
      mapped.map((m, i) => ({
        rowNumber: m.lineNumber,
        raw: { jersey: m.jersey, stats: m.stats, didNotPlay: m.didNotPlay },
        parsedJersey: m.jersey,
        matchedPlayerId: matches[i].playerId,
        matchConfidence: matches[i].confidence,
        matchMethod: matches[i].method,
      }))
    );

    const rows = await db.getImportRows(batchId);
    const statsByRow = new Map<number, Record<string, number>>();
    const dnp = new Set<number>();
    for (const r of rows) {
      const raw = r.raw as { stats?: Record<string, number>; didNotPlay?: boolean };
      statsByRow.set(r.id, raw.stats ?? {});
      if (raw.didNotPlay) dnp.add(r.id);
    }

    const result = await db.commitImportBatch(batchId, uploader.id, statsByRow, dnp);
    assert.equal(result.linesWritten, 11);
    assert.equal(result.rowsSkipped, 0);
    assert.ok(result.valuesWritten > 100, "a full baseball box score is many values");

    // Every batting line must equal what the PDF printed.
    const landed = await sql<
      { jersey: string; ab: number | null; h: number | null; r: number | null }[]
    >`
      SELECT sl.jersey,
             max(sv.value) FILTER (WHERE sd.key = 'ab')::int AS ab,
             max(sv.value) FILTER (WHERE sd.key = 'h')::int  AS h,
             max(sv.value) FILTER (WHERE sd.key = 'r')::int  AS r
      FROM stat_line sl
      LEFT JOIN stat_value sv ON sv.stat_line_id = sl.id
      LEFT JOIN stat_definition sd ON sd.id = sv.stat_definition_id
      WHERE sl.game_id = ${(game as { ok: true; gameId: number }).gameId}
      GROUP BY sl.jersey`;

    for (const [jersey, [ab, h, r]] of Object.entries(EXPECTED)) {
      const row = landed.find((l) => l.jersey === jersey);
      assert.ok(row, `jersey ${jersey} must have a stat line`);
      assert.deepEqual([row.ab, row.h, row.r], [ab, h, r], `jersey ${jersey} batting line`);
    }

    // Team totals reconcile against the printed box score: 16 AB, 4 R, 2 H.
    const totals = landed.reduce(
      (acc, l) => ({ ab: acc.ab + (l.ab ?? 0), h: acc.h + (l.h ?? 0), r: acc.r + (l.r ?? 0) }),
      { ab: 0, h: 0, r: 0 }
    );
    assert.deepEqual(totals, { ab: 16, h: 2, r: 4 }, "team totals must match the box score");

    // '00' and '0' must never be conflated.
    assert.ok(landed.some((l) => l.jersey === "00"), "jersey 00 survives as itself");

    // The rollups the team and leaderboard pages read must be populated.
    const [{ count: rollups }] = await sql<{ count: number }[]>`
      SELECT count(*)::int FROM player_season_stat pss
      JOIN player_season ps ON ps.id = pss.player_season_id
      WHERE ps.team_season_id = ${home.teamSeasonId!}`;
    assert.ok(rollups > 0, "committing must refresh the read model, not just stat_value");

    // Committing twice must be refused rather than doubling the record.
    await assert.rejects(
      () => db.commitImportBatch(batchId, uploader.id, statsByRow, dnp),
      /already committed/
    );
    const [{ count: lines }] = await sql<{ count: number }[]>`
      SELECT count(*)::int FROM stat_line
      WHERE game_id = ${(game as { ok: true; gameId: number }).gameId}`;
    assert.equal(lines, 11, "a refused re-commit must not add lines");
  } catch (err) {
    throw err;
  }
});

test("school name matching resolves the easy cases and refuses the ambiguous ones", opts, async () => {
  const { matchSchoolNames } = await import("../src/index.ts");
  try {
    const byInput = new Map(
      (
        await matchSchoolNames([
          "John Hardin High School",
          "John Hardin",
          "Paduka Tilghman",
          "Trinity",
          "Nowhere Consolidated",
        ])
      ).map((m) => [m.input, m])
    );

    assert.equal(byInput.get("John Hardin High School")?.method, "exact");
    assert.equal(
      byInput.get("John Hardin")?.schoolName,
      "John Hardin High School",
      "a bare name resolves to the full one"
    );

    // The institutional suffix dilutes a trigram score enough to sink a real
    // near miss, so matching also compares against the stripped name.
    const typo = byInput.get("Paduka Tilghman");
    assert.equal(typo?.schoolName, "Paducah Tilghman High School");
    assert.ok((typo?.confidence ?? 0) > 0.5, "a one-letter typo should score well");

    // Two Trinitys exist. Guessing between them would silently attribute games
    // to the wrong school, so this must stay unresolved and show both.
    const trinity = byInput.get("Trinity");
    assert.equal(trinity?.schoolId, null, "an ambiguous name must not be guessed");
    assert.ok(
      trinity!.candidates.length >= 2,
      "both candidates must be offered to the human"
    );

    assert.equal(byInput.get("Nowhere Consolidated")?.schoolId, null);
  } catch (err) {
    throw err;
  }
});

test("RPI runs against real games, reproduces its own arithmetic, and ranks only Kentucky", opts, async () => {
  const db = await import("../src/index.ts");
  const { sql } = db;

  const [football] = await sql<{ id: number }[]>`
    SELECT id::int FROM sport WHERE slug = 'football'`;
  const [ss] = await sql<{ id: number }[]>`
    SELECT id::int FROM sport_season WHERE sport_id = ${football.id} AND is_current`;
  assert.ok(football && ss, "football must have a current season");

  // Dates used only by this test, so cleanup cannot touch anything else.
  const DATES = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"];
  // rpi_input references game, so past runs pin their games in place. Clearing
  // the season's runs first is what makes this test re-runnable.
  await sql`DELETE FROM rpi_run WHERE sport_season_id = ${ss.id}`;
  // The test asserts behaviour BEFORE an out-of-state record exists and again
  // after, so a record left behind by a previous run has to go too.
  await sql`
    DELETE FROM out_of_state_record oos
    USING team t, school sc
    WHERE oos.team_id = t.id AND sc.id = t.school_id AND sc.slug = 'rpi-test-tn'`;
  const stale = await sql<{ id: number }[]>`
    SELECT id::int FROM game
    WHERE sport_season_id = ${ss.id} AND local_date = ANY(${DATES}::date[])`;
  for (const g of stale) {
    await sql`DELETE FROM stat_line WHERE game_id = ${g.id}`;
    await sql`DELETE FROM import_batch WHERE game_id = ${g.id}`;
    await sql`DELETE FROM game WHERE id = ${g.id}`;
  }

  // An out-of-state opponent: the whole point of shadow RPI.
  const [tn] = await sql<{ id: number }[]>`
    INSERT INTO school (slug, name, state, data_source_id)
    SELECT 'rpi-test-tn', 'RPI Test Academy (TN)', 'TN', ds.id
    FROM data_source ds WHERE ds.slug = 'staff-entry'
    ON CONFLICT (slug) DO UPDATE SET state = 'TN'
    RETURNING id::int`;

  const schools = await sql<{ id: number; slug: string }[]>`
    SELECT id::int, slug::text FROM school
    WHERE slug IN ('male', 'john-hardin', 'central-hardin')`;
  const id = (slug: string) => schools.find((s) => s.slug === slug)!.id;

  const rows = [
    { lineNumber: 1, date: DATES[0], homeSchoolId: id("john-hardin"), awaySchoolId: id("central-hardin"), homeScore: 28, awayScore: 14 },
    { lineNumber: 2, date: DATES[1], homeSchoolId: id("male"), awaySchoolId: id("john-hardin"), homeScore: 35, awayScore: 10 },
    { lineNumber: 3, date: DATES[2], homeSchoolId: id("central-hardin"), awaySchoolId: id("male"), homeScore: 0, awayScore: 49 },
    { lineNumber: 4, date: DATES[3], homeSchoolId: id("male"), awaySchoolId: tn.id, homeScore: 31, awayScore: 28 },
  ];
  const commit = await db.commitSchedule(rows, football.id, "boys", "varsity");
  assert.equal(commit.failed.length, 0, "the schedule must commit cleanly");

  const summary = await db.runRpi(ss.id, { throughDate: "2026-12-31" });
  assert.ok(summary.teams >= 3, "every Kentucky participant is computed");
  assert.ok(summary.published > 0, "teams with complete scores are published");

  // The out-of-state team has no out_of_state_record yet, so it must NOT be
  // computed. We only know its games against Kentucky, and deriving a record
  // from those would invent one - then Shadow RPI would compare the official
  // .500 assumption against our own fabrication.
  const computed = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM rpi_result r
    JOIN team t    ON t.id = r.team_id
    JOIN school sc ON sc.id = t.school_id
    WHERE r.rpi_run_id = ${summary.officialRunId!} AND sc.slug = 'rpi-test-tn'`;
  assert.equal(
    computed[0].n,
    0,
    "an out-of-state team with no known record must not be given one"
  );

  const standings = await db.getRpiStandings("football");
  assert.ok(standings.length > 0, "there must be a published table");

  // Out-of-state teams are computed - their record feeds everyone's OWP - but
  // ranking them in Kentucky standings would be a category error.
  assert.ok(
    !standings.some((s) => s.schoolName.includes("RPI Test Academy")),
    "an out-of-state opponent must never appear in the standings"
  );

  // "Every stored RPI value must be reproducible."
  for (const s of standings) {
    const recomputed = (s.wp * 0.35 + s.owp * 0.35 + s.oowp * 0.3) * s.classFactor;
    assert.ok(
      Math.abs(recomputed - s.rpi) < 1e-6,
      `${s.schoolName}: stored ${s.rpi} does not reproduce from its own components`
    );
  }

  // The arithmetic is persisted, not just the answer.
  const [{ count: inputs }] = await sql<{ count: number }[]>`
    SELECT count(*)::int FROM rpi_input WHERE rpi_run_id = ${summary.officialRunId!}`;
  assert.ok(inputs > 0, "per-game inputs must be stored for a disputing coach");

  // Shadow must differ for anyone who played the out-of-state team, because
  // its real record is not .500.
  await sql`
    INSERT INTO out_of_state_record
      (team_id, sport_season_id, wins, losses, source_name, as_of, data_source_id)
    SELECT t.id, ${ss.id}, 9, 1, 'test', CURRENT_DATE, ds.id
    FROM team t, data_source ds
    WHERE t.school_id = ${tn.id} AND t.sport_id = ${football.id}
      AND ds.slug = 'staff-entry'
    ON CONFLICT (team_id, sport_season_id) DO UPDATE SET wins = 9, losses = 1`;

  const withRecord = await db.runRpi(ss.id, { throughDate: "2026-12-31" });
  const withShadow = await db.getRpiStandings("football");
  const male = withShadow.find((s) => s.schoolSlug === "male");
  assert.ok(male, "Male played the out-of-state team");
  assert.ok(
    male!.delta !== null && Math.abs(male!.delta) > 0.0001,
    "shadow RPI must differ once a REAL out-of-state record is known"
  );

  // And now it is computed, because there is a real record to carry.
  const nowComputed = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM rpi_result r
    JOIN team t    ON t.id = r.team_id
    JOIN school sc ON sc.id = t.school_id
    WHERE r.rpi_run_id = ${withRecord.officialRunId!} AND sc.slug = 'rpi-test-tn'`;
  assert.equal(nowComputed[0].n, 1, "a known out-of-state record is carried into the run");
});

test("a KHSAA alignment block assigns districts and is safe to re-run", opts, async () => {
  const db = await import("../src/index.ts");
  const { parseAlignmentText } = await import("@kyboxscore/parsers");
  const { sql } = db;

  const [football] = await sql<{ id: number }[]>`
    SELECT id::int FROM sport WHERE slug = 'football'`;

  // Names written the way the published document writes them: bare, with a
  // parenthetical, and one that is only a substring of two other schools.
  const block = `Class 1A
District 3- Bellevue, Dayton, Newport, Newport Central Catholic

For postseason competition, District 7 will cross-bracket with District 8.

Class 6A
District 5- Ballard, Eastern, Oldham County, Trinity (Louisville)

WITHDRAWN FROM PLAY- Holmes, Ohio County`;

  const parsed = parseAlignmentText(block);
  assert.equal(parsed.rows.length, 8);
  assert.deepEqual(parsed.withdrawn, ["Holmes", "Ohio County"]);
  assert.equal(parsed.issues.filter((i) => i.severity === "error").length, 0);

  const matches = await db.matchSchoolNames(parsed.rows.map((r) => r.schoolName));
  const byInput = new Map(matches.map((m) => [m.input.toLowerCase(), m]));

  // "Newport" and "Ballard" are each a substring of another school. The bare
  // name is exact, so they must resolve rather than reading as ambiguous.
  assert.equal(byInput.get("newport")?.schoolName, "Newport High School");
  assert.equal(byInput.get("ballard")?.schoolName, "Ballard High School");
  assert.equal(
    byInput.get("newport central catholic")?.schoolName,
    "Newport Central Catholic High School"
  );

  const targets = parsed.rows.flatMap((r) => {
    const m = byInput.get(r.schoolName.toLowerCase());
    return m?.schoolId
      ? [{
          lineNumber: r.lineNumber,
          schoolId: m.schoolId,
          schoolName: m.schoolName!,
          classOrdinal: r.classOrdinal,
          districtNumber: r.districtNumber,
        }]
      : [];
  });
  assert.equal(targets.length, 8, "every school in the block must resolve");

  const first = await db.commitAlignments(targets, football.id, "boys", "varsity");
  assert.equal(first.failed.length, 0);

  // Re-running the same block must change nothing: a realignment paste is
  // re-run, and a second run must not thrash the data.
  const second = await db.commitAlignments(targets, football.id, "boys", "varsity");
  assert.equal(second.assigned, 0, "nothing should change on a second run");
  assert.equal(second.unchanged, 8);
  assert.equal(second.teamsCreated, 0);

  // The assignment must land on the right class and district.
  const [row] = await sql<{ className: string; district: number }[]>`
    SELECT parent.name AS "className", a.ordinal::int AS district
    FROM school sc
    JOIN team t       ON t.school_id = sc.id AND t.sport_id = ${football.id}
    JOIN team_season ts ON ts.team_id = t.id
    JOIN alignment a  ON a.id = ts.alignment_id
    JOIN alignment parent ON parent.id = a.parent_id
    WHERE sc.slug = 'trinity-louisville'`;
  assert.deepEqual([row?.className, row?.district], ["6A", 5]);
});
