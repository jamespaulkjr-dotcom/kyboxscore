import type { TransactionSql } from "postgres";
import { sql } from "./client.ts";
import { hashToken, newSessionToken } from "./password.ts";
import { refreshTeamSeasonRollups } from "./rollups.ts";

/**
 * Live scoring.
 *
 * Two audiences, deliberately kept apart:
 *
 * - a coach or AD, signed in, who can score any game their team is in
 * - whoever they hand a per-game link to, who has no account at all
 *
 * Both end up here, and every write records which one it was.
 */

/** Who is making the change. Every mutation takes one. */
export type ScoringActor =
  | { kind: "user"; userId: number }
  | { kind: "keeper"; scorekeeperId: number };

/**
 * A game is only LIVE while somebody is actually keeping it. Nothing is worse
 * than a scoreboard still blinking at 3am because the keeper went home at the
 * end of the third quarter, so the indicator goes stale on its own.
 */
export const LIVE_STALE_AFTER = "5 hours";

/** How long a keeper link lasts. Long enough for a weather delay, not a week. */
export const KEEPER_LINK_HOURS = 12;

export type ScoringSide = {
  participantId: number;
  teamId: number;
  role: "home" | "away";
  schoolName: string;
  shortName: string | null;
  schoolSlug: string;
  score: number | null;
};

export type ScoringPlay = {
  id: number;
  participantId: number;
  periodNumber: number;
  points: number;
  description: string;
  enteredAt: string;
};

export type ScoringGame = {
  id: number;
  shortCode: string;
  sportSlug: string;
  sportName: string;
  urlYear: number;
  localDate: string;
  localTime: string | null;
  status: string;
  stage: string;
  periodsPlayed: number | null;
  scoreUpdatedAt: string | null;
  isLive: boolean;
  home: ScoringSide;
  away: ScoringSide;
  plays: ScoringPlay[];
};

/* --------------------------------------------------------------- reading */

/**
 * Everything the scoring console needs, by the same short code the public game
 * page uses — so a coach can go from the box score they are looking at
 * straight to keeping it, without a second identifier to lose.
 */
export async function getScoringGame(
  shortCode: string
): Promise<ScoringGame | null> {
  const [game] = await sql<
    Omit<ScoringGame, "home" | "away" | "plays">[]
  >`
    SELECT g.id::int, g.short_code AS "shortCode",
           sp.slug::text AS "sportSlug", sp.name AS "sportName",
           ss.url_year::int AS "urlYear",
           g.local_date::text AS "localDate",
           to_char(g.local_time, 'HH12:MI AM') AS "localTime",
           g.status::text, g.stage::text,
           g.periods_played::int AS "periodsPlayed",
           g.score_updated_at::text AS "scoreUpdatedAt",
           coalesce(g.status = 'in_progress'
                    AND g.score_updated_at > now() - ${LIVE_STALE_AFTER}::interval,
                    false) AS "isLive"
    FROM game g
    JOIN sport_season ss ON ss.id = g.sport_season_id
    JOIN sport sp ON sp.id = ss.sport_id
    WHERE g.short_code = ${shortCode}`;
  if (!game) return null;

  const sides = await sql<ScoringSide[]>`
    SELECT gp.id::int AS "participantId", gp.team_id::int AS "teamId",
           gp.role::text AS role, gp.score::int AS score,
           sc.name AS "schoolName", sc.short_name AS "shortName",
           sc.slug::text AS "schoolSlug"
    FROM game_participant gp
    JOIN team t ON t.id = gp.team_id
    JOIN school sc ON sc.id = t.school_id
    WHERE gp.game_id = ${game.id}`;

  const home = sides.find((s) => s.role === "home");
  const away = sides.find((s) => s.role === "away");
  // The schema's deferred trigger guarantees exactly two participants, so a
  // game missing a side is corruption rather than a case to handle.
  if (!home || !away) return null;

  const plays = await sql<ScoringPlay[]>`
    SELECT p.id::int, p.game_participant_id::int AS "participantId",
           p.period_number::int AS "periodNumber", p.points::int,
           p.description, p.entered_at::text AS "enteredAt"
    FROM scoring_play p
    JOIN game_participant gp ON gp.id = p.game_participant_id
    WHERE gp.game_id = ${game.id} AND p.voided_at IS NULL
    ORDER BY p.sequence`;

  return { ...game, home, away, plays };
}

/**
 * Games a signed-in user may keep: anything their granted teams are playing.
 * Ordered so tonight's game is the first thing on the screen, because that is
 * the only one anybody opens this page for.
 */
export async function listScorableGames(userId: number) {
  return sql<
    {
      gameId: number;
      shortCode: string;
      localDate: string;
      localTime: string | null;
      status: string;
      stage: string;
      isLive: boolean;
      sportSlug: string;
      urlYear: number;
      ourName: string;
      opponentName: string;
      isHome: boolean;
      ourScore: number | null;
      theirScore: number | null;
    }[]
  >`
    SELECT g.id::int AS "gameId", g.short_code AS "shortCode",
           g.local_date::text AS "localDate",
           to_char(g.local_time, 'HH12:MI AM') AS "localTime",
           g.status::text, g.stage::text,
           coalesce(g.status = 'in_progress'
                    AND g.score_updated_at > now() - ${LIVE_STALE_AFTER}::interval,
                    false) AS "isLive",
           sp.slug::text AS "sportSlug", ss.url_year::int AS "urlYear",
           coalesce(ours.short_name, ours.name) AS "ourName",
           coalesce(theirs.short_name, theirs.name) AS "opponentName",
           (mine.role = 'home') AS "isHome",
           mine.score::int AS "ourScore", opp.score::int AS "theirScore"
    FROM user_team_grant ut
    JOIN game_participant mine ON mine.team_id = ut.team_id
    JOIN game g ON g.id = mine.game_id
    JOIN game_participant opp ON opp.game_id = g.id AND opp.id <> mine.id
    JOIN sport_season ss ON ss.id = g.sport_season_id
    JOIN sport sp ON sp.id = ss.sport_id
    JOIN team ourteam ON ourteam.id = mine.team_id
    JOIN school ours ON ours.id = ourteam.school_id
    JOIN team theirteam ON theirteam.id = opp.team_id
    JOIN school theirs ON theirs.id = theirteam.school_id
    WHERE ut.user_id = ${userId}
      AND g.status <> 'canceled'
    ORDER BY abs(g.local_date - CURRENT_DATE), g.local_date DESC
    LIMIT 60`;
}

/** Whether this user holds a grant on either side of the game. */
export async function userCanScore(
  userId: number,
  gameId: number
): Promise<boolean> {
  const [row] = await sql<{ ok: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM game_participant gp
      JOIN user_team_grant ut ON ut.team_id = gp.team_id
      WHERE gp.game_id = ${gameId} AND ut.user_id = ${userId}
    ) AS ok`;
  return row?.ok ?? false;
}

/** Live games across a season, for the scoreboard's poll. */
export async function listLiveGames(sportSeasonId: number) {
  return sql<
    {
      shortCode: string;
      status: string;
      periodsPlayed: number | null;
      home: number | null;
      away: number | null;
    }[]
  >`
    SELECT g.short_code AS "shortCode", g.status::text,
           g.periods_played::int AS "periodsPlayed",
           h.score::int AS home, a.score::int AS away
    FROM game g
    JOIN game_participant h ON h.game_id = g.id AND h.role = 'home'
    JOIN game_participant a ON a.game_id = g.id AND a.role = 'away'
    WHERE g.sport_season_id = ${sportSeasonId}
      AND g.status = 'in_progress'
      AND g.score_updated_at > now() - ${LIVE_STALE_AFTER}::interval`;
}

/* -------------------------------------------------------------- writing */

function actorColumns(actor: ScoringActor) {
  return {
    userId: actor.kind === "user" ? actor.userId : null,
    keeperId: actor.kind === "keeper" ? actor.scorekeeperId : null,
  };
}

/**
 * Flip a scheduled game to in_progress and start the clock on LIVE.
 *
 * Also sets both sides to 0, because a game that has kicked off is 0-0, not
 * blank - and the scoreboard hides a null score, so leaving them null would
 * publish a live game with no numbers on it.
 */
export async function startScoring(gameId: number) {
  return sql.begin(async (tx) => {
    const [g] = await tx<{ id: number }[]>`
      UPDATE game
         SET status = 'in_progress', score_updated_at = now(), updated_at = now()
       WHERE id = ${gameId} AND status IN ('scheduled', 'postponed')
       RETURNING id::int`;
    if (!g) return;
    await tx`
      UPDATE game_participant SET score = 0
      WHERE game_id = ${gameId} AND score IS NULL`;
  });
}

/**
 * The ways a football game can score. Kept here rather than in the page so the
 * server can check what it is told: a button posts a key, never a number of
 * points, so nobody can hand themselves a 50-point play.
 */
export const FOOTBALL_PLAYS = [
  { key: "td", label: "TD", points: 6, description: "Touchdown" },
  { key: "pat", label: "PAT", points: 1, description: "Extra point" },
  { key: "two", label: "2PT", points: 2, description: "Two-point conversion" },
  { key: "fg", label: "FG", points: 3, description: "Field goal" },
  { key: "safety", label: "Safety", points: 2, description: "Safety" },
] as const;

export type ScoringPlayKey = (typeof FOOTBALL_PLAYS)[number]["key"];

export function playByKey(key: string) {
  return FOOTBALL_PLAYS.find((p) => p.key === key) ?? null;
}

/**
 * One scoring play. The participant's score is recomputed from the plays
 * rather than incremented, so a void and a re-entry can never drift apart from
 * what the play list says.
 */
export async function recordScoringPlay(input: {
  gameId: number;
  participantId: number;
  periodNumber: number;
  points: number;
  description: string;
  actor: ScoringActor;
}): Promise<{ ok: boolean; reason?: string }> {
  const { userId, keeperId } = actorColumns(input.actor);

  return sql.begin(async (tx) => {
    const [belongs] = await tx<{ one: number }[]>`
      SELECT 1 AS one FROM game_participant
      WHERE id = ${input.participantId} AND game_id = ${input.gameId}`;
    if (!belongs) return { ok: false, reason: "That team is not in this game." };

    // Sequence is game-wide, not per side, so the play list has one honest
    // order. The column's UNIQUE is per participant, which a game-wide counter
    // satisfies for free.
    const [{ next }] = await tx<{ next: number }[]>`
      SELECT coalesce(max(p.sequence), 0) + 1 AS next
      FROM scoring_play p
      JOIN game_participant gp ON gp.id = p.game_participant_id
      WHERE gp.game_id = ${input.gameId}`;

    await tx`
      INSERT INTO scoring_play
        (game_participant_id, period_number, sequence, points, description,
         entered_by_user_id, scorekeeper_id)
      VALUES (${input.participantId}, ${input.periodNumber}, ${next},
              ${input.points}, ${input.description}, ${userId}, ${keeperId})`;

    await resyncScores(tx, input.gameId, input.periodNumber);
    return { ok: true };
  });
}

/** Undo. The row stays; only readers stop seeing it. */
export async function voidLastPlay(
  gameId: number
): Promise<{ ok: boolean; reason?: string }> {
  return sql.begin(async (tx) => {
    const [last] = await tx<{ id: number; periodNumber: number }[]>`
      SELECT p.id::int, p.period_number::int AS "periodNumber"
      FROM scoring_play p
      JOIN game_participant gp ON gp.id = p.game_participant_id
      WHERE gp.game_id = ${gameId} AND p.voided_at IS NULL
      ORDER BY p.sequence DESC LIMIT 1`;
    if (!last) return { ok: false, reason: "There is nothing to undo." };

    await tx`UPDATE scoring_play SET voided_at = now() WHERE id = ${last.id}`;
    await resyncScores(tx, gameId, last.periodNumber);
    return { ok: true };
  });
}

/** Both sides' scores, and the period tally, rebuilt from the surviving plays. */
async function resyncScores(
  tx: TransactionSql,
  gameId: number,
  periodNumber: number
) {
  await tx`
    UPDATE game_participant gp
       SET score = coalesce((
             SELECT sum(p.points)::smallint FROM scoring_play p
             WHERE p.game_participant_id = gp.id AND p.voided_at IS NULL
           ), 0)
     WHERE gp.game_id = ${gameId}`;

  // Quarter-by-quarter, which is most of what a box score reader wants and
  // costs nothing once the plays carry a period.
  await tx`
    INSERT INTO game_period_score (game_participant_id, period_number, score)
    SELECT gp.id, ${periodNumber}, coalesce(sum(p.points), 0)::smallint
    FROM game_participant gp
    LEFT JOIN scoring_play p
      ON p.game_participant_id = gp.id
     AND p.period_number = ${periodNumber}
     AND p.voided_at IS NULL
    WHERE gp.game_id = ${gameId}
    GROUP BY gp.id
    ON CONFLICT (game_participant_id, period_number)
      DO UPDATE SET score = EXCLUDED.score`;

  await tx`
    UPDATE game
       SET score_updated_at = now(),
           periods_played = greatest(coalesce(periods_played, 0), ${periodNumber}),
           updated_at = now()
     WHERE id = ${gameId}`;
}

/**
 * The simple path, and the one most people will use: type the two numbers when
 * it is over. Overwrites whatever live scoring produced, because the person
 * typing it is looking at the scoreboard and the play list may have gaps.
 */
export async function setFinalScore(input: {
  gameId: number;
  homeScore: number;
  awayScore: number;
  periodsPlayed: number | null;
  final: boolean;
}): Promise<{ ok: boolean; reason?: string }> {
  return sql.begin(async (tx) => {
    const sides = await tx<{ id: number; role: string }[]>`
      SELECT id::int, role::text FROM game_participant WHERE game_id = ${input.gameId}`;
    if (sides.length !== 2) return { ok: false, reason: "That game is incomplete." };

    for (const s of sides) {
      await tx`
        UPDATE game_participant SET score = ${
          s.role === "home" ? input.homeScore : input.awayScore
        } WHERE id = ${s.id}`;
    }

    await tx`
      UPDATE game
         SET status = ${input.final ? "final" : "in_progress"}::game_status,
             periods_played = coalesce(${input.periodsPlayed}, periods_played),
             score_updated_at = now(),
             updated_at = now()
       WHERE id = ${input.gameId}`;
    return { ok: true };
  });
}

/* ---------------------------------------------------------- keeper links */

export type Scorekeeper = {
  id: number;
  gameId: number;
  teamId: number;
  label: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
};

/**
 * Mint a link for one game. Returns the raw token exactly once — only its hash
 * is stored, so a lost link is regenerated rather than looked up.
 */
export async function createScorekeeperLink(input: {
  gameId: number;
  teamId: number;
  label: string;
  createdByUserId: number;
}): Promise<{ token: string; id: number }> {
  const token = newSessionToken();
  const expires = new Date(Date.now() + KEEPER_LINK_HOURS * 60 * 60 * 1000);
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO game_scorekeeper
      (game_id, team_id, token_hash, label, created_by_user_id, expires_at)
    VALUES (${input.gameId}, ${input.teamId}, ${hashToken(token)},
            ${input.label}, ${input.createdByUserId}, ${expires})
    RETURNING id::int`;
  return { token, id: row.id };
}

/** Resolve a keeper link. Expired or revoked resolves to nothing. */
export async function findScorekeeper(
  tokenHash: string
): Promise<(Scorekeeper & { shortCode: string }) | null> {
  const rows = await sql<(Scorekeeper & { shortCode: string })[]>`
    SELECT k.id::int, k.game_id::int AS "gameId", k.team_id::int AS "teamId",
           k.label, k.created_at::text AS "createdAt",
           k.expires_at::text AS "expiresAt", k.revoked_at::text AS "revokedAt",
           k.last_used_at::text AS "lastUsedAt", g.short_code AS "shortCode"
    FROM game_scorekeeper k
    JOIN game g ON g.id = k.game_id
    WHERE k.token_hash = ${tokenHash}
      AND k.revoked_at IS NULL
      AND k.expires_at > now()
    LIMIT 1`;
  return rows[0] ?? null;
}

/** Fire-and-forget: a failed stamp must never fail the scoring request. */
export async function touchScorekeeper(id: number) {
  await sql`UPDATE game_scorekeeper SET last_used_at = now() WHERE id = ${id}`;
}

export async function listScorekeepers(gameId: number, teamId: number) {
  return sql<Scorekeeper[]>`
    SELECT id::int, game_id::int AS "gameId", team_id::int AS "teamId", label,
           created_at::text AS "createdAt", expires_at::text AS "expiresAt",
           revoked_at::text AS "revokedAt", last_used_at::text AS "lastUsedAt"
    FROM game_scorekeeper
    WHERE game_id = ${gameId} AND team_id = ${teamId}
    ORDER BY created_at DESC`;
}

export async function revokeScorekeeper(id: number, teamId: number) {
  await sql`
    UPDATE game_scorekeeper SET revoked_at = now()
    WHERE id = ${id} AND team_id = ${teamId} AND revoked_at IS NULL`;
}

/* ------------------------------------------------------------------ reset */

export type ResetResult =
  | { ok: false; reason: string }
  | { ok: true; plays: number; periods: number; links: number; wasStatus: string };

/**
 * Put a game back the way it was before anybody scored it.
 *
 * This exists because testing live scoring on a real fixture is the only way
 * to find out whether it works, and the first person to do that had to ask for
 * the database to be cleaned up by hand.
 *
 * It refuses if a box score has been imported: statistics and the scoreboard
 * would then disagree, and the importer is the right place to undo an import.
 *
 * Past RPI runs are deliberately *not* a blocker. `rpi_input` stores the
 * numbers each run was computed from, so an old rating stays reproducible even
 * after the game underneath it changes - which is the entire reason those rows
 * are kept.
 */
export async function resetGameScoring(gameId: number): Promise<ResetResult> {
  const [guard] = await sql<{ hasStats: boolean; status: string }[]>`
    SELECT EXISTS (SELECT 1 FROM stat_line WHERE game_id = ${gameId}) AS "hasStats",
           (SELECT status::text FROM game WHERE id = ${gameId}) AS status`;
  if (!guard?.status) return { ok: false, reason: "That game no longer exists." };
  if (guard.hasStats) {
    return {
      ok: false,
      reason:
        "This game has a box score recorded. Remove the statistics first, or " +
        "the scoreboard and the box score will disagree.",
    };
  }

  const result = await sql.begin(async (tx) => {
    const plays = await tx`
      DELETE FROM scoring_play
       WHERE game_participant_id IN
             (SELECT id FROM game_participant WHERE game_id = ${gameId})`;
    const periods = await tx`
      DELETE FROM game_period_score
       WHERE game_participant_id IN
             (SELECT id FROM game_participant WHERE game_id = ${gameId})`;
    await tx`UPDATE game_participant SET score = NULL WHERE game_id = ${gameId}`;
    await tx`
      UPDATE game
         SET status = 'scheduled', periods_played = NULL,
             score_updated_at = NULL, updated_at = now()
       WHERE id = ${gameId}`;
    // Any link handed out was for a game that has just been un-played. Cheap
    // to mint another; not cheap to have a stale one still able to write.
    const links = await tx`
      UPDATE game_scorekeeper SET revoked_at = now()
       WHERE game_id = ${gameId} AND revoked_at IS NULL`;

    return {
      plays: plays.count,
      periods: periods.count,
      links: links.count,
    };
  });

  // Records are derived from finished games, so a game that was final has to
  // stop counting. Outside the transaction: a rollup failure must not undo a
  // reset that already succeeded, and re-running rollups is always safe.
  const seasons = await sql<{ teamSeasonId: number }[]>`
    SELECT ts.id::int AS "teamSeasonId"
    FROM game_participant gp
    JOIN game g ON g.id = gp.game_id
    JOIN team_season ts
      ON ts.team_id = gp.team_id AND ts.sport_season_id = g.sport_season_id
    WHERE gp.game_id = ${gameId}`;
  for (const s of seasons) {
    await refreshTeamSeasonRollups(s.teamSeasonId);
  }

  return { ok: true, ...result, wasStatus: guard.status };
}
