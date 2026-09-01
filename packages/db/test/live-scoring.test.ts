/**
 * Live scoring against a real database.
 *
 * Skipped when DATABASE_URL is unset so `npm test` still runs without
 * Postgres; CI sets it and runs migrate + seed first. Typecheck and
 * `next build` never execute SQL, so this is the only thing that catches a
 * broken query here.
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

/** A scheduled game nothing else in the suite is using, plus an admin. */
async function fixture() {
  const db = await import("../src/index.ts");
  const { sql } = db;
  const [user] = await sql<{ id: number }[]>`
    INSERT INTO app_user (email, name, role)
    VALUES ('live-scoring-test@example.invalid', 'Test', 'admin')
    ON CONFLICT (email) DO UPDATE SET role = 'admin'
    RETURNING id::int`;
  const [row] = await sql<{ id: number; code: string }[]>`
    SELECT id::int, short_code AS code FROM game
    WHERE status = 'scheduled' ORDER BY id DESC LIMIT 1`;
  return { db, sql, userId: user.id, gameId: row.id, code: row.code };
}

test("a scored game reaches the right total, and undo puts it back", opts, async () => {
  const { db, userId, gameId, code } = await fixture();
  const game = await db.getScoringGame(code);
  assert.ok(game);

  await db.startScoring(gameId);
  // Starting must publish 0-0, not blank: the scoreboard hides a null score,
  // so a live game with nulls would show no numbers at all.
  const started = await db.getScoringGame(code);
  assert.equal(started!.home.score, 0);
  assert.equal(started!.status, "in_progress");

  const actor = { kind: "user", userId } as const;
  for (const [side, points, description, period] of [
    ["home", 6, "Touchdown", 1],
    ["home", 1, "Extra point", 1],
    ["away", 3, "Field goal", 2],
  ] as const) {
    const r = await db.recordScoringPlay({
      gameId,
      participantId: game![side].participantId,
      periodNumber: period,
      points,
      description,
      actor,
    });
    assert.equal(r.ok, true);
  }

  let now = await db.getScoringGame(code);
  assert.equal(now!.home.score, 7);
  assert.equal(now!.away.score, 3);
  assert.equal(now!.plays.length, 3);

  // Undo is a void, so the score moves but the row survives for the audit.
  assert.equal((await db.voidLastPlay(gameId)).ok, true);
  now = await db.getScoringGame(code);
  assert.equal(now!.away.score, 0);
  assert.equal(now!.plays.length, 2);

  await db.resetGameScoring(gameId);
});

test("points come from the server's table, not the caller", opts, async () => {
  const { db } = await import("../src/index.ts").then(async (m) => ({ db: m }));
  assert.equal(db.playByKey("td")?.points, 6);
  assert.equal(db.playByKey("safety")?.points, 2);
  // An unknown key must not fall through to some default number of points.
  assert.equal(db.playByKey("touchdown-for-fifty"), null);
  assert.equal(db.playByKey(""), null);
});

test("reset returns the game to unplayed and rebuilds records", opts, async () => {
  const { db, sql, userId, gameId, code } = await fixture();

  await db.startScoring(gameId);
  await db.setFinalScore({
    gameId,
    homeScore: 35,
    awayScore: 7,
    periodsPlayed: 4,
    final: true,
  });
  const link = await db.createScorekeeperLink({
    gameId,
    teamId: (await db.getScoringGame(code))!.home.teamId,
    label: "test",
    createdByUserId: userId,
  });
  assert.ok(await db.findScorekeeper(db.hashToken(link.token)));

  const result = await db.resetGameScoring(gameId);
  assert.equal(result.ok, true);

  const after = await db.getScoringGame(code);
  assert.equal(after!.status, "scheduled");
  assert.equal(after!.home.score, null);
  assert.equal(after!.away.score, null);
  assert.equal(after!.periodsPlayed, null);
  assert.equal(after!.isLive, false);
  assert.equal(after!.plays.length, 0);

  // A link for a game that has just been un-played must not still write to it.
  assert.equal(await db.findScorekeeper(db.hashToken(link.token)), null);

  const [left] = await sql<{ plays: number; periods: number }[]>`
    SELECT
      (SELECT count(*)::int FROM scoring_play p
        JOIN game_participant gp ON gp.id = p.game_participant_id
       WHERE gp.game_id = ${gameId}) AS plays,
      (SELECT count(*)::int FROM game_period_score ps
        JOIN game_participant gp ON gp.id = ps.game_participant_id
       WHERE gp.game_id = ${gameId}) AS periods`;
  assert.equal(left.plays, 0);
  assert.equal(left.periods, 0);
});

test("reset refuses a game that has an imported box score", opts, async () => {
  const { db, sql, gameId } = await fixture();
  const [src] = await sql<{ id: number }[]>`SELECT id::int FROM data_source LIMIT 1`;
  const [participant] = await sql<{ id: number }[]>`
    SELECT id::int FROM game_participant WHERE game_id = ${gameId} LIMIT 1`;
  await sql`
    INSERT INTO stat_line (game_id, game_participant_id, scope, data_source_id)
    VALUES (${gameId}, ${participant.id}, 'team', ${src.id})`;

  const result = await db.resetGameScoring(gameId);
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.reason : "", /box score/i);

  await sql`DELETE FROM stat_line WHERE game_id = ${gameId}`;
});

test("reset on a game that does not exist says so", opts, async () => {
  const { db } = await fixture();
  const result = await db.resetGameScoring(999_999_999);
  assert.equal(result.ok, false);
});
