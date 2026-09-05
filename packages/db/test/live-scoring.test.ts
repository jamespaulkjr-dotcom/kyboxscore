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

test("a typed score survives the next tap", opts, async () => {
  const { db, userId, gameId, code } = await fixture();
  const game = await db.getScoringGame(code);

  // Somebody picks the game up at half time and types what is on the board.
  await db.startScoring(gameId);
  await db.setFinalScore({
    gameId,
    homeScore: 14,
    awayScore: 7,
    periodsPlayed: 2,
    final: false,
  });
  let now = await db.getScoringGame(code);
  assert.equal(now!.home.score, 14);

  // Then starts tapping. Before the adjustment existed this wiped the 14.
  await db.recordScoringPlay({
    gameId,
    participantId: game!.home.participantId,
    periodNumber: 3,
    points: 6,
    description: "Touchdown",
    playKey: "td",
    actor: { kind: "user", userId },
  });
  now = await db.getScoringGame(code);
  assert.equal(now!.home.score, 20);
  assert.equal(now!.away.score, 7);

  // And undo returns to the typed baseline, not to zero.
  await db.voidLastPlay(gameId);
  now = await db.getScoringGame(code);
  assert.equal(now!.home.score, 14);

  await db.resetGameScoring(gameId);
});

test("play detail names the players and reads as a sentence", opts, async () => {
  const { db, userId, gameId, code } = await fixture();
  const game = await db.getScoringGame(code);
  await db.startScoring(gameId);

  const roster = await db.listGameRoster(gameId);
  const ours = roster.filter((r) => r.participantId === game!.home.participantId);
  const theirs = roster.filter((r) => r.participantId === game!.away.participantId);
  assert.ok(ours.length >= 2 && theirs.length >= 1, "fixtures need rosters");

  const play = await db.recordScoringPlay({
    gameId,
    participantId: game!.home.participantId,
    periodNumber: 1,
    points: 6,
    description: "Touchdown",
    playKey: "td",
    actor: { kind: "user", userId },
  });

  const ok = await db.updateScoringPlay({
    gameId,
    playId: play.playId!,
    playerId: ours[0].playerId,
    assistPlayerId: ours[1].playerId,
    method: "pass",
    clock: "4:12",
    periodNumber: 1,
  });
  assert.equal(ok.ok, true);

  const after = await db.getScoringGame(code);
  const [saved] = after!.plays;
  assert.equal(saved.clock, "4:12");
  assert.equal(saved.playerName, ours[0].name);
  assert.equal(saved.description, `${ours[1].name} to ${ours[0].name}, touchdown catch`);

  // A player from the other sideline cannot be credited with this score.
  const wrong = await db.updateScoringPlay({
    gameId,
    playId: play.playId!,
    playerId: theirs[0].playerId,
    assistPlayerId: null,
    method: "rush",
    clock: null,
    periodNumber: 1,
  });
  assert.equal(wrong.ok, false);

  await db.resetGameScoring(gameId);
});

test("the description is built from the parts, not typed", opts, async () => {
  const { db } = await fixture();
  const d = db.describePlay;
  assert.equal(d({ playKey: "td", method: "rush", scorer: "A Back", passer: null }),
    "A Back rushing touchdown");
  assert.equal(d({ playKey: "td", method: "pass", scorer: "A End", passer: "A Arm" }),
    "A Arm to A End, touchdown catch");
  // A passing play with nobody credited for the throw still reads correctly.
  assert.equal(d({ playKey: "td", method: "pass", scorer: "A End", passer: null }),
    "A End touchdown catch");
  assert.equal(d({ playKey: "fg", method: "kick", scorer: null, passer: null }),
    "Field goal");
  assert.equal(d({ playKey: "safety", method: null, scorer: null, passer: null }),
    "Safety");
  assert.equal(d({ playKey: null, method: null, scorer: null, passer: null }), "Score");
});

test("the scoring summary carries the running score", opts, async () => {
  const { db, userId, gameId, code } = await fixture();
  const game = await db.getScoringGame(code);
  await db.startScoring(gameId);
  const actor = { kind: "user", userId } as const;

  for (const [side, points, key, period] of [
    ["away", 6, "td", 1],
    ["away", 1, "pat", 1],
    ["home", 3, "fg", 2],
  ] as const) {
    await db.recordScoringPlay({
      gameId,
      participantId: game![side].participantId,
      periodNumber: period,
      points,
      description: "x",
      playKey: key,
      actor,
    });
  }

  const summary = await db.getScoringSummary(gameId);
  assert.equal(summary.length, 3);
  assert.deepEqual(
    summary.map((r) => `${r.awayAfter}-${r.homeAfter}`),
    ["6-0", "7-0", "7-3"]
  );

  await db.resetGameScoring(gameId);
});

test("a game appears once even when both its teams are yours", opts, async () => {
  const { db, sql } = await fixture();
  const [user] = await sql<{ id: number }[]>`
    INSERT INTO app_user (email, name, role)
    VALUES ('both-sides-test@example.invalid', 'Both', 'admin')
    ON CONFLICT (email) DO UPDATE SET role = 'admin'
    RETURNING id::int`;

  // A game, and a grant on each sideline. This is an administrator's normal
  // state: they hold every school.
  const [g] = await sql<{ id: number; home: number; away: number }[]>`
    SELECT g.id::int,
           (SELECT team_id::int FROM game_participant
             WHERE game_id = g.id AND role = 'home') AS home,
           (SELECT team_id::int FROM game_participant
             WHERE game_id = g.id AND role = 'away') AS away
    FROM game g WHERE g.status <> 'canceled' ORDER BY g.id LIMIT 1`;
  for (const teamId of [g.home, g.away]) {
    await sql`
      INSERT INTO user_team_grant (user_id, team_id)
      VALUES (${user.id}, ${teamId}) ON CONFLICT DO NOTHING`;
  }

  const { games } = await db.listScorableGames(user.id);
  const forThisGame = games.filter((row) => row.gameId === g.id);
  assert.equal(forThisGame.length, 1, "one row per game, not one per sideline");

  // And it names both teams, so a row is readable without knowing which of
  // your teams it belongs to.
  const [row] = forThisGame;
  assert.ok(row.homeName.length > 0);
  assert.ok(row.awayName.length > 0);
  assert.notEqual(row.homeName, row.awayName);
  assert.equal(row.homeIsMine, true);
  assert.equal(row.awayIsMine, true);

  await sql`DELETE FROM user_team_grant WHERE user_id = ${user.id}`;
});

test("a coach holding one team sees which side is theirs", opts, async () => {
  const { db, sql } = await fixture();
  const [user] = await sql<{ id: number }[]>`
    INSERT INTO app_user (email, name, role)
    VALUES ('one-side-test@example.invalid', 'One', 'coach')
    ON CONFLICT (email) DO UPDATE SET role = 'coach'
    RETURNING id::int`;
  const [g] = await sql<{ id: number; home: number }[]>`
    SELECT g.id::int,
           (SELECT team_id::int FROM game_participant
             WHERE game_id = g.id AND role = 'home') AS home
    FROM game g WHERE g.status <> 'canceled' ORDER BY g.id LIMIT 1`;
  await sql`
    INSERT INTO user_team_grant (user_id, team_id)
    VALUES (${user.id}, ${g.home}) ON CONFLICT DO NOTHING`;

  const { games } = await db.listScorableGames(user.id);
  const [row] = games.filter((r) => r.gameId === g.id);
  assert.ok(row, "the coach can see their own game");
  assert.equal(row.homeIsMine, true);
  assert.equal(row.awayIsMine, false);

  await sql`DELETE FROM user_team_grant WHERE user_id = ${user.id}`;
});

test("a narrowed list holds a whole slate, and says when it does not", opts, async () => {
  const { db, sql } = await fixture();
  const [user] = await sql<{ id: number }[]>`
    INSERT INTO app_user (email, name, role)
    VALUES ('cap-test@example.invalid', 'Cap', 'admin')
    ON CONFLICT (email) DO UPDATE SET role = 'admin'
    RETURNING id::int`;
  await sql`
    INSERT INTO user_team_grant (user_id, team_id)
    SELECT ${user.id}, id FROM team ON CONFLICT DO NOTHING`;

  // The busiest date this database knows about has to come back whole. In
  // production that is a 107-game Kentucky football Friday.
  const [busiest] = await sql<{ localDate: string; games: number }[]>`
    SELECT local_date::text AS "localDate", count(*)::int AS games
    FROM game WHERE status <> 'canceled'
    GROUP BY local_date ORDER BY count(*) DESC LIMIT 1`;

  const onThatDate = await db.listScorableGames(user.id, { date: busiest.localDate });
  assert.equal(onThatDate.games.length, busiest.games,
    "every game on the busiest date is listed");
  assert.equal(onThatDate.truncated, false);

  // The unnarrowed view is a browse rather than a slate, so it may be cut
  // short - but never silently.
  const all = await db.listScorableGames(user.id);
  const [{ total }] = await sql<{ total: number }[]>`
    SELECT count(*)::int AS total FROM game WHERE status <> 'canceled'`;
  if (total > all.games.length) {
    assert.equal(all.truncated, true, "a cut-short list must admit it");
  } else {
    assert.equal(all.truncated, false);
  }

  await sql`DELETE FROM user_team_grant WHERE user_id = ${user.id}`;
});

test("the clock is accepted the way a phone keypad types it", opts, async () => {
  const { db } = await fixture();
  const c = db.normalizeClock;

  // The reason this exists: a numeric keypad on a phone has no colon key, so
  // two scorekeepers on 2026-09-03 could not enter 0:54 at all.
  assert.equal(c("054"), "0:54");
  assert.equal(c("54"), "0:54");
  assert.equal(c("412"), "4:12");
  assert.equal(c("1200"), "12:00");
  assert.equal(c("5"), "0:05");
  assert.equal(c("0"), "0:00");

  // Punctuation still works for anyone with a full keyboard.
  assert.equal(c("0:54"), "0:54");
  assert.equal(c("4:12"), "4:12");
  assert.equal(c("04:07"), "4:07");
  assert.equal(c("1:2"), "1:02");
  assert.equal(c(" 412 "), "4:12");
  assert.equal(c("0.54"), "0:54");

  // And nonsense is still nonsense.
  assert.equal(c(""), null);
  assert.equal(c("99"), null, "99 seconds is not a time");
  assert.equal(c("4:99"), null);
  assert.equal(c("2100"), null, "21 minutes is longer than any period");
  assert.equal(c("abc"), null);
  assert.equal(c("12:60"), null);
});

test("a bad clock never costs somebody the score", opts, async () => {
  const { db, userId, gameId, code } = await fixture();
  const game = await db.getScoringGame(code);
  await db.startScoring(gameId);

  // recordScoringPlay takes the clock already normalised; the action drops a
  // bad one rather than refusing the play. This is the shape that matters:
  // a score with no time beats no score at all.
  const r = await db.recordScoringPlay({
    gameId,
    participantId: game!.home.participantId,
    periodNumber: 1,
    points: 6,
    description: "Touchdown",
    playKey: "td",
    clock: db.normalizeClock("not a time"),
    actor: { kind: "user", userId },
  });
  assert.equal(r.ok, true);

  const after = await db.getScoringGame(code);
  assert.equal(after!.home.score, 6);
  assert.equal(after!.plays[0].clock, null);

  await db.resetGameScoring(gameId);
});

test("a deleted game is hidden everywhere, and comes back whole", opts, async () => {
  const { db, sql, userId, gameId, code } = await fixture();
  const game = await db.getScoringGame(code);

  // Give it something worth losing: a result, a scoring play, a record.
  await db.startScoring(gameId);
  await db.recordScoringPlay({
    gameId,
    participantId: game!.home.participantId,
    periodNumber: 1,
    points: 6,
    description: "Touchdown",
    playKey: "td",
    clock: "0:54",
    actor: { kind: "user", userId },
  });
  await db.setFinalScore({
    gameId,
    homeScore: 42,
    awayScore: 0,
    periodsPlayed: 4,
    final: true,
  });

  const [{ sportSeasonId, homeTeamSeason }] = await sql<
    { sportSeasonId: number; homeTeamSeason: number }[]
  >`
    SELECT g.sport_season_id::int AS "sportSeasonId",
           (SELECT ts.id::int FROM game_participant gp
              JOIN team_season ts ON ts.team_id = gp.team_id
                                 AND ts.sport_season_id = g.sport_season_id
             WHERE gp.game_id = g.id AND gp.role = 'home') AS "homeTeamSeason"
    FROM game_all g WHERE g.id = ${gameId}`;
  const winsNow = async () => {
    const [r] = await sql<{ wins: number }[]>`
      SELECT coalesce(wins, 0)::int AS wins FROM team_season_record
      WHERE team_season_id = ${homeTeamSeason}`;
    return r?.wins ?? 0;
  };
  // setFinalScore does not rebuild records, so make the baseline honest first.
  await db.refreshTeamSeasonRollups(homeTeamSeason);
  const before = await winsNow();
  assert.ok(before >= 1, "the win is counted before the delete");

  assert.equal((await db.deleteGame(gameId, userId)).ok, true);

  // Hidden from every read: the view is the whole enforcement.
  assert.equal(await db.getScoringGame(code), null, "not scoreable");
  assert.equal(await db.getGameByCode(code), null, "no public game page");
  const [{ visible }] = await sql<{ visible: number }[]>`
    SELECT count(*)::int AS visible FROM game WHERE id = ${gameId}`;
  assert.equal(visible, 0);
  const scoreboard = await db.getScoreboard(sportSeasonId, game!.localDate);
  assert.equal(scoreboard.some((g) => g.shortCode === code), false, "off the slate");
  assert.equal(await winsNow(), before - 1, "stops counting towards the record");

  // But nothing was thrown away.
  const [{ kept }] = await sql<{ kept: number }[]>`
    SELECT count(*)::int AS kept FROM game_all WHERE id = ${gameId}`;
  assert.equal(kept, 1);
  const [{ plays }] = await sql<{ plays: number }[]>`
    SELECT count(*)::int AS plays FROM scoring_play p
    JOIN game_participant gp ON gp.id = p.game_participant_id
    WHERE gp.game_id = ${gameId} AND p.voided_at IS NULL`;
  assert.equal(plays, 1, "the play-by-play survives a delete");

  const listed = await db.listDeletedGames();
  assert.ok(listed.some((g) => g.shortCode === code), "shows on the restore screen");

  // And it comes back exactly as it was.
  assert.equal((await db.restoreGame(gameId)).ok, true);
  const back = await db.getScoringGame(code);
  assert.ok(back);
  assert.equal(back!.home.score, 42);
  assert.equal(back!.status, "final");
  assert.equal(back!.plays.length, 1);
  assert.equal(back!.plays[0].clock, "0:54");
  assert.equal(await winsNow(), before, "and counts again");

  await db.resetGameScoring(gameId);
});

test("deleting frees the fixture so an import can re-create it", opts, async () => {
  const { db, sql, gameId } = await fixture();
  const [g] = await sql<{ pair: string; date: string; season: number }[]>`
    SELECT team_pair_key AS pair, local_date::text AS date,
           sport_season_id::int AS season
    FROM game_all WHERE id = ${gameId}`;
  const [home, away] = (await sql<{ teamId: number; role: string }[]>`
    SELECT team_id::int AS "teamId", role::text FROM game_participant
    WHERE game_id = ${gameId} ORDER BY role DESC`);

  await db.deleteGame(gameId, null);

  // The same two teams on the same date must be insertable again: a deleted
  // fixture cannot hold the natural key hostage.
  const newId = await sql.begin(async (tx) => {
    const [ng] = await tx<{ id: number }[]>`
      INSERT INTO game (sport_season_id, short_code, local_date, status)
      VALUES (${g.season}, 'zzdup1', ${g.date}::date, 'scheduled')
      RETURNING id::int`;
    for (const p of [home, away]) {
      await tx`
        INSERT INTO game_participant (game_id, team_id, role)
        VALUES (${ng.id}, ${p.teamId}, ${p.role}::participant_role)`;
    }
    return ng.id;
  });

  // And restoring the old one on top of that is refused, with a reason.
  const clash = await db.restoreGame(gameId);
  assert.equal(clash.ok, false);
  assert.match(clash.reason ?? "", /already have a game/i);

  await sql`DELETE FROM game_all WHERE id = ${newId}`;
  assert.equal((await db.restoreGame(gameId)).ok, true, "and fine once it is gone");
});

test("a game called off can be marked played, and back again", opts, async () => {
  const { db, sql, gameId, code } = await fixture();

  // Doss at Jeffersontown was carried as canceled and finished 45-0. Until
  // status could be edited the only way back was editing the database.
  assert.equal((await db.setGameStatus(gameId, "canceled")).ok, true);
  let game = await db.getScoringGame(code);
  assert.equal(game!.status, "canceled");

  // A final game with no score counts for nothing, so it is refused.
  const noScore = await db.setGameStatus(gameId, "final");
  assert.equal(noScore.ok, false);
  assert.match(noScore.reason ?? "", /score/i);

  await db.setFinalScore({
    gameId,
    homeScore: 45,
    awayScore: 0,
    periodsPlayed: 4,
    final: false,
  });
  assert.equal((await db.setGameStatus(gameId, "final")).ok, true);
  game = await db.getScoringGame(code);
  assert.equal(game!.status, "final");
  assert.equal(game!.home.score, 45);

  assert.equal((await db.setGameStatus(gameId, "nonsense")).ok, false);
  await db.resetGameScoring(gameId);
});

test("a canceled game is still findable, so it can be corrected", opts, async () => {
  const { db, sql, gameId } = await fixture();
  const [user] = await sql<{ id: number }[]>`
    INSERT INTO app_user (email, name, role)
    VALUES ('cancel-test@example.invalid', 'C', 'admin')
    ON CONFLICT (email) DO UPDATE SET role = 'admin' RETURNING id::int`;
  await sql`
    INSERT INTO user_team_grant (user_id, team_id)
    SELECT ${user.id}, team_id FROM game_participant WHERE game_id = ${gameId}
    ON CONFLICT DO NOTHING`;

  await db.setGameStatus(gameId, "canceled");
  const { games } = await db.listScorableGames(user.id);
  assert.ok(
    games.some((g) => g.gameId === gameId),
    "the game that got played anyway is exactly the one somebody needs to find"
  );

  await db.setGameStatus(gameId, "scheduled");
  await sql`DELETE FROM user_team_grant WHERE user_id = ${user.id}`;
});

test("an out-of-state opponent can be created and played", opts, async () => {
  const { db, sql } = await fixture();
  const [sport] = await sql<{ id: number }[]>`
    SELECT id::int FROM sport WHERE slug = 'football'`;

  const made = await db.createOutOfStateOpponent({
    name: "McKenzie",
    state: "TN",
    sportId: sport.id,
    gender: "boys",
    level: "varsity",
  });
  assert.equal(made.ok, true);

  const [school] = await sql<{ state: string; shortName: string }[]>`
    SELECT sc.state, sc.short_name AS "shortName"
    FROM team t JOIN school sc ON sc.id = t.school_id WHERE t.id = ${made.teamId}`;
  // The real state, not the seed's XX placeholder: the code asks whether a
  // school is not Kentucky, and the state says which association to ask for a
  // record.
  assert.equal(school.state, "TN");
  assert.equal(school.shortName, "McKenzie (TN)");

  // Idempotent: adding the same school twice must not make two of them.
  const again = await db.createOutOfStateOpponent({
    name: "McKenzie",
    state: "TN",
    sportId: sport.id,
    gender: "boys",
    level: "varsity",
  });
  assert.equal(again.teamId, made.teamId);

  assert.equal(
    (await db.createOutOfStateOpponent({
      name: "Somewhere",
      state: "KY",
      sportId: sport.id,
      gender: "boys",
      level: "varsity",
    })).ok,
    false,
    "a Kentucky school is a team, not an opponent"
  );

  await sql`DELETE FROM team_season WHERE team_id = ${made.teamId}`;
  await sql`DELETE FROM team WHERE id = ${made.teamId}`;
  await sql`DELETE FROM school WHERE slug = 'mckenzie-tn'`;
});
