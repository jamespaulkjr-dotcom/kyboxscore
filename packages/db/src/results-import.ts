/**
 * Applying a pasted results document to games already on the schedule.
 *
 * The schedule import creates games. This one never does: it finds the game
 * the row is about and changes it. That difference is the whole point, because
 * a results paste arrives the morning after a schedule that already exists,
 * and creating a second copy of a game is worse than reporting a miss.
 *
 * Two passes, the same way the schedule paste works. previewResults resolves
 * every row and says what it would do; commitResults does it. The preview is
 * the safety net, so it reports what it cannot do as loudly as what it can.
 */
import { sql } from "./client.ts";
import {
  matchSchoolNames,
  type SchoolMatch,
  type SchoolQuery,
} from "./schedule-import.ts";
import { setFinalScore, setGameStatus } from "./scoring.ts";
import type { ResultRow, ResultOutcome } from "@kyboxscore/parsers";

export type ResultPlan = {
  lineNumber: number;
  awayName: string;
  homeName: string;
  raw: string;
  note: string | null;

  gameId: number | null;
  /** Why there is no game, when there is none. */
  miss: "unmatched_school" | "not_on_schedule" | "ambiguous" | null;
  unmatched: string[];

  currentDate: string | null;
  currentTime: string | null;
  currentStatus: string | null;
  currentAwayScore: number | null;
  currentHomeScore: number | null;
  dbAwayName: string | null;
  dbHomeName: string | null;

  moveTo: string | null;
  time: string | null;
  outcome: ResultOutcome;

  /** Plain sentences for the preview. A plan with warnings still commits. */
  warnings: string[];
  /** What this row would do, in words. Empty means nothing to do. */
  changes: string[];
};

export type ResultPreview = {
  sportSeasonId: number;
  plans: ResultPlan[];
};

export type ResultCommitResult = {
  applied: number;
  skipped: number;
  failed: { lineNumber: number; reason: string }[];
};

type GameRow = {
  id: number;
  localDate: string;
  localTime: string | null;
  status: string;
  awaySchoolId: number;
  homeSchoolId: number;
  awayName: string;
  homeName: string;
  awayScore: number | null;
  homeScore: number | null;
};

/**
 * Turns a name as the document writes it into a query the matcher can settle.
 *
 * A Kentucky scores document is about Kentucky, so a bare name means a
 * Kentucky school. Without that, "Franklin County" is ambiguous against
 * Franklin County, Winchester, Tennessee, and the matcher rightly refuses it.
 *
 * A parenthesis holding exactly two letters is a state, as in "Elder (OH)".
 * Any other parenthesis is part of the name we store, as in "Trinity
 * (Louisville)", and is left where it is.
 */
export function schoolQueryFromName(raw: string): SchoolQuery {
  const name = raw.trim();
  const m = /^(.*?)\s*\(([^)]+)\)$/.exec(name);
  if (m && /^[A-Za-z]{2}$/.test(m[2].trim())) {
    return { name: m[1].trim(), state: m[2].trim().toUpperCase() };
  }
  return { name, state: "KY" };
}

const dayGap = (a: string, b: string) =>
  Math.abs(Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000;

/**
 * Candidate games for a pair of schools, nearest the document's date first.
 *
 * Deliberately not restricted to the document's date: half of a results paste
 * is games that moved, and a row that says "played September 19" is about a
 * game still sitting on the 18th. The window is wide enough to find a
 * rearranged game and narrow enough not to reach last month's meeting.
 */
async function findGames(
  sportSeasonId: number,
  aSchoolId: number,
  bSchoolId: number
): Promise<GameRow[]> {
  return await sql<GameRow[]>`
    SELECT g.id::int,
           g.local_date::text AS "localDate",
           g.local_time::text AS "localTime",
           g.status::text,
           max(CASE WHEN gp.role = 'away' THEN t.school_id END)::int AS "awaySchoolId",
           max(CASE WHEN gp.role = 'home' THEN t.school_id END)::int AS "homeSchoolId",
           max(CASE WHEN gp.role = 'away' THEN s.name END) AS "awayName",
           max(CASE WHEN gp.role = 'home' THEN s.name END) AS "homeName",
           max(CASE WHEN gp.role = 'away' THEN gp.score END)::int AS "awayScore",
           max(CASE WHEN gp.role = 'home' THEN gp.score END)::int AS "homeScore"
      FROM game g
      JOIN game_participant gp ON gp.game_id = g.id
      JOIN team t ON t.id = gp.team_id
      JOIN school s ON s.id = t.school_id
     WHERE g.sport_season_id = ${sportSeasonId}
     GROUP BY g.id, g.local_date, g.local_time, g.status
    HAVING count(*) = 2
       AND bool_or(t.school_id = ${aSchoolId})
       AND bool_or(t.school_id = ${bSchoolId})`;
}

export async function previewResults(
  rows: ResultRow[],
  sportId: number,
  documentDate: string | null
): Promise<ResultPreview | { error: string }> {
  const [ss] = await sql<{ id: number }[]>`
    SELECT id::int FROM sport_season
     WHERE sport_id = ${sportId} AND is_current`;
  if (!ss) return { error: "That sport has no season open." };

  const matches = await matchSchoolNames(
    rows.flatMap((r) => [
      schoolQueryFromName(r.awayName),
      schoolQueryFromName(r.homeName),
    ])
  );
  const byInput = new Map(matches.map((m) => [m.input.trim().toLowerCase(), m]));
  const school = (name: string): SchoolMatch | undefined =>
    byInput.get(schoolQueryFromName(name).name.toLowerCase());

  const plans: ResultPlan[] = [];

  for (const r of rows) {
    const away = school(r.awayName);
    const home = school(r.homeName);
    const base = {
      lineNumber: r.lineNumber,
      awayName: r.awayName,
      homeName: r.homeName,
      raw: r.raw,
      note: r.note,
      moveTo: r.moveTo,
      time: r.time,
      outcome: r.outcome,
      currentDate: null,
      currentTime: null,
      currentStatus: null,
      currentAwayScore: null,
      currentHomeScore: null,
      dbAwayName: null,
      dbHomeName: null,
      warnings: [] as string[],
      changes: [] as string[],
    };

    const unmatched = [
      ...(away?.schoolId ? [] : [r.awayName]),
      ...(home?.schoolId ? [] : [r.homeName]),
    ];
    if (unmatched.length) {
      plans.push({ ...base, gameId: null, miss: "unmatched_school", unmatched });
      continue;
    }

    const candidates = await findGames(ss.id, away!.schoolId!, home!.schoolId!);
    if (candidates.length === 0) {
      plans.push({ ...base, gameId: null, miss: "not_on_schedule", unmatched: [] });
      continue;
    }

    // Nearest to the date the document is about, then to any date it moves to.
    const anchor = documentDate ?? r.moveTo;
    const sorted = anchor
      ? [...candidates].sort(
          (a, b) => dayGap(a.localDate, anchor) - dayGap(b.localDate, anchor)
        )
      : candidates;
    const g = sorted[0];

    // Two meetings equally close to the same date cannot be told apart.
    if (
      sorted.length > 1 &&
      anchor &&
      dayGap(sorted[0].localDate, anchor) === dayGap(sorted[1].localDate, anchor)
    ) {
      plans.push({ ...base, gameId: null, miss: "ambiguous", unmatched: [] });
      continue;
    }

    const plan: ResultPlan = {
      ...base,
      gameId: g.id,
      miss: null,
      unmatched: [],
      currentDate: g.localDate,
      currentTime: g.localTime,
      currentStatus: g.status,
      currentAwayScore: g.awayScore,
      currentHomeScore: g.homeScore,
      dbAwayName: g.awayName,
      dbHomeName: g.homeName,
    };

    // The sides as pasted may be the other way round from the schedule. The
    // schedule is treated as right, because home advantage is not a detail a
    // results sheet is authoritative about, but the human is told.
    const reversed = g.awaySchoolId === home!.schoolId && g.homeSchoolId === away!.schoolId;
    if (reversed) {
      plan.warnings.push(
        `The schedule has this at ${g.homeName}, not ${r.homeName}. Scores will follow the schedule's sides.`
      );
    }

    // A results document is an assertion about one date. A game it reports as
    // played, or lists as upcoming, belongs on that date even when the row
    // says nothing about moving: that is what "these are Friday's scores"
    // means. An explicit "rescheduled for" in the row still wins over it.
    const target =
      r.moveTo ??
      (documentDate && documentDate !== g.localDate ? documentDate : null);

    if (target && target !== g.localDate) {
      const clash = await sql<{ id: number }[]>`
        SELECT g2.id::int FROM game g2
         WHERE g2.sport_season_id = ${ss.id}
           AND g2.local_date = ${target}::date
           AND g2.id <> ${g.id}
           AND g2.team_pair_key = (SELECT team_pair_key FROM game WHERE id = ${g.id})`;
      if (clash.length) {
        plan.warnings.push(
          `These two already have another game on ${r.moveTo}, so this one cannot move there.`
        );
      } else {
        plan.changes.push(`Move from ${g.localDate} to ${target}`);
        plan.moveTo = target;
        // A game that has a new date is not postponed any more, whatever the
        // row says about a result. Left alone it would sit on Saturday's
        // scoreboard still calling itself postponed.
        if (g.status === "postponed" && r.outcome.kind === "none") {
          plan.outcome = { kind: "status", status: "scheduled" };
          plan.changes.push("Status postponed to scheduled");
        }
      }
    }
    if (r.time && r.time !== g.localTime) {
      plan.changes.push(`Kick-off ${r.time.slice(0, 5)}`);
    }

    if (r.outcome.kind === "score") {
      // The pasted sides may be reversed; the schedule's sides win.
      const awayScore = reversed ? r.outcome.homeScore : r.outcome.awayScore;
      const homeScore = reversed ? r.outcome.awayScore : r.outcome.homeScore;
      const same = g.awayScore === awayScore && g.homeScore === homeScore;
      const settled = g.status === "final" || g.status === "forfeit";
      // What setFinalScore will leave the status as. It never reopens a game
      // that has already finished, so a settled game keeps the status it has.
      const willBe = r.outcome.final ? "final" : settled ? g.status : "in_progress";

      if (settled && !same) {
        plan.warnings.push(
          `Already ${g.status} at ${g.awayName} ${g.awayScore}, ${g.homeName} ${g.homeScore}. This would change it.`
        );
      }
      // The status matters as much as the score: a game carrying the right
      // score under the wrong status still reads wrong on the scoreboard.
      if (!same || willBe !== g.status) {
        plan.changes.push(
          `${r.outcome.final ? "Final" : "In progress"} ${g.awayName} ${awayScore}, ${g.homeName} ${homeScore}`
        );
      }
    } else if (r.outcome.kind === "status") {
      if (r.outcome.status !== g.status) {
        if (
          (g.status === "final" || g.status === "forfeit") &&
          r.outcome.status !== "forfeit"
        ) {
          plan.warnings.push(
            `Already ${g.status} at ${g.awayName} ${g.awayScore}, ${g.homeName} ${g.homeScore}. This would undo that result.`
          );
        } else if (
          g.status === "in_progress" &&
          (g.awayScore !== null || g.homeScore !== null) &&
          r.outcome.status === "scheduled"
        ) {
          // Usually an older document being pasted after a newer one.
          plan.warnings.push(
            `This game is live at ${g.awayName} ${g.awayScore}, ${g.homeName} ${g.homeScore}. Putting it back to scheduled would drop that. Paste the newest document last.`
          );
        }
        plan.changes.push(`Status ${g.status} to ${r.outcome.status}`);
      }
    }

    plans.push(plan);
  }

  return { sportSeasonId: ss.id, plans };
}

export async function commitResults(
  plans: ResultPlan[]
): Promise<ResultCommitResult> {
  let applied = 0;
  let skipped = 0;
  const failed: { lineNumber: number; reason: string }[] = [];

  for (const p of plans) {
    if (!p.gameId || p.changes.length === 0) {
      skipped++;
      continue;
    }
    try {
      // The date moves first so that anything keyed to it, and any human
      // looking at the scoreboard mid-import, sees the game where it belongs.
      const moving = p.changes.some((c) => c.startsWith("Move from"));
      if (moving && p.moveTo) {
        await sql`
          UPDATE game SET local_date = ${p.moveTo}::date, updated_at = now()
           WHERE id = ${p.gameId}`;
      }
      if (p.time && p.time !== p.currentTime) {
        await sql`
          UPDATE game SET local_time = ${p.time}::time, updated_at = now()
           WHERE id = ${p.gameId}`;
      }

      const reversed =
        p.dbHomeName !== null &&
        p.warnings.some((w) => w.startsWith("The schedule has this at"));

      if (p.outcome.kind === "score") {
        const awayScore = reversed ? p.outcome.homeScore : p.outcome.awayScore;
        const homeScore = reversed ? p.outcome.awayScore : p.outcome.homeScore;
        const res = await setFinalScore({
          gameId: p.gameId,
          awayScore,
          homeScore,
          periodsPlayed: null,
          final: p.outcome.final,
        });
        if (!res.ok) {
          failed.push({ lineNumber: p.lineNumber, reason: res.reason ?? "Refused." });
          continue;
        }
      } else if (p.outcome.kind === "status") {
        const res = await setGameStatus(p.gameId, p.outcome.status);
        if (!res.ok) {
          failed.push({ lineNumber: p.lineNumber, reason: res.reason ?? "Refused." });
          continue;
        }
      }
      applied++;
    } catch (err) {
      failed.push({
        lineNumber: p.lineNumber,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { applied, skipped, failed };
}
