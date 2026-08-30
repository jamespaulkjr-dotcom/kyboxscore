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
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const opts = { skip: HAS_DB ? false : "DATABASE_URL is not set" };

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
  } finally {
    await db_end();
  }

  async function db_end() {
    const { sql } = await import("../src/index.ts");
    await sql.end();
  }
});
