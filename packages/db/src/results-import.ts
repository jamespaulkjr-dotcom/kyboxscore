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
import { looksLikeForfeitScore } from "@kyboxscore/parsers";
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
  /**
   * The names that did not resolve. `input` is what the document wrote and
   * `query` is what the matcher actually looked for, which is the string an
   * alias has to be recorded under. They differ when the document carries a
   * state, as in "Elder (OH)".
   */
  unmatched: UnmatchedName[];

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
  /**
   * Whether the score itself needs writing. A row can have changes without
   * this - a game that only moves date - and setFinalScore must not be called
   * in that case, because it would rewrite the status as a side effect.
   */
  writeScore: boolean;
};

export type UnmatchedName = {
  input: string;
  query: string;
  state: string | null;
  candidates: { schoolId: number; name: string }[];
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

/**
 * Whether the document actually said which state, as "Elder (OH)" does.
 *
 * The difference matters because the Kentucky default is an assumption, and an
 * assumption must not outrank an alias somebody recorded by hand. Without
 * this, binding "St. Xavier (Cincinnati, OH)" to the Ohio school silently
 * fails: the alias is found and then thrown away for being in the wrong state.
 */
export function statesItsOwnState(raw: string): boolean {
  const m = /^(.*?)\s*\(([^)]+)\)$/.exec(raw.trim());
  return Boolean(m && /^[A-Za-z]{2}$/.test(m[2].trim()));
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
  // The slug comes along because what counts as an impossible scoreline is a
  // property of the sport, not of the document.
  const [ss] = await sql<{ id: number; slug: string }[]>`
    SELECT ss.id::int, sp.slug::text
      FROM sport_season ss
      JOIN sport sp ON sp.id = ss.sport_id
     WHERE ss.sport_id = ${sportId} AND ss.is_current`;
  if (!ss) return { error: "That sport has no season open." };

  const names = rows.flatMap((r) => [r.awayName, r.homeName]);

  // First pass assumes Kentucky, which is what settles "Franklin County"
  // against the Tennessee school of the same name.
  const matches = await matchSchoolNames(names.map(schoolQueryFromName));
  const byInput = new Map(matches.map((m) => [m.input.trim().toLowerCase(), m]));

  // Second pass, for names the assumption just cost us: anything still
  // unresolved whose document did not say a state is retried with no state at
  // all, so an alias pointing out of state is found. A name that is genuinely
  // ambiguous without the hint stays unmatched, which is the right answer.
  const stranded = names.filter((n) => {
    if (statesItsOwnState(n)) return false;
    const m = byInput.get(schoolQueryFromName(n).name.toLowerCase());
    return !m?.schoolId;
  });
  if (stranded.length > 0) {
    const retried = await matchSchoolNames(
      stranded.map((n) => ({ name: schoolQueryFromName(n).name }))
    );
    for (const m of retried) {
      const key = m.input.trim().toLowerCase();
      // Only ever fills a gap; never overrides a first-pass match.
      if (m.schoolId && !byInput.get(key)?.schoolId) byInput.set(key, m);
    }
  }

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
      writeScore: false,
    };

    const asUnmatched = (raw: string, m: SchoolMatch | undefined): UnmatchedName => {
      const q = schoolQueryFromName(raw);
      return {
        input: raw,
        query: q.name,
        state: q.state ?? null,
        candidates: (m?.candidates ?? [])
          .slice(0, 5)
          .map((c) => ({ schoolId: c.schoolId, name: c.name })),
      };
    };
    const unmatched: UnmatchedName[] = [
      ...(away?.schoolId ? [] : [asUnmatched(r.awayName, away)]),
      ...(home?.schoolId ? [] : [asUnmatched(r.homeName, home)]),
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

    // A row's own date column beats the document heading, because a table
    // that spans several nights is the only thing that knows which is which.
    const rowDate = r.date ?? documentDate;

    // Nearest to the date the row is about, then to any date it moves to.
    const anchor = rowDate ?? r.moveTo;
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
      r.moveTo ?? (rowDate && rowDate !== g.localDate ? rowDate : null);

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
      // What setFinalScore would leave the status as, except that a forfeit is
      // already a kind of final: a document saying "final" about a game we hold
      // as a forfeit is agreeing with us, not correcting us. Without this,
      // re-pasting last week's scores quietly turns every forfeit back into a
      // played 1-0.
      const willBe = r.outcome.final
        ? g.status === "forfeit"
          ? "forfeit"
          : "final"
        : settled
          ? g.status
          : "in_progress";

      if (settled && !same) {
        plan.warnings.push(
          `Already ${g.status} at ${g.awayName} ${g.awayScore}, ${g.homeName} ${g.homeScore}. This would change it.`
        );
      }
      // The status matters as much as the score: a game carrying the right
      // score under the wrong status still reads wrong on the scoreboard.
      if (!same || willBe !== g.status) {
        plan.writeScore = true;
        plan.changes.push(
          `${r.outcome.final ? "Final" : "In progress"} ${g.awayName} ${awayScore}, ${g.homeName} ${homeScore}`
        );
      }
      // Written as pasted, then flagged. Three of these have turned up in a
      // fortnight and each one was a forfeit, but a scorekeeper is entitled to
      // mean a number they typed, so this stays a question.
      if (
        g.status !== "forfeit" &&
        looksLikeForfeitScore(ss.slug, awayScore, homeScore)
      ) {
        const loser = awayScore < homeScore ? g.awayName : g.homeName;
        plan.warnings.push(
          `1-0 is the forfeit convention, not a score anybody played for. Probably a ${loser} forfeit: apply this, then set the game to Forfeit on its own page.`
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

      if (p.outcome.kind === "score" && p.writeScore) {
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

/**
 * Schools an alias can be bound to, out-of-state ones included.
 *
 * Deliberately not listSchoolsForSelect, which is Kentucky only: the names a
 * results document cannot match are disproportionately the out-of-state ones,
 * because those are the schools nobody has typed before.
 */
export async function listSchoolsForBinding() {
  return await sql<{ id: number; name: string; state: string }[]>`
    SELECT id::int, name, state
      FROM school
     WHERE is_active
     ORDER BY (state = 'KY') DESC, state, name`;
}

/**
 * Record that a name means a school.
 *
 * An alias beats every other matching rule because a person made it, so this
 * writes down who and when. Re-binding an existing alias repoints it rather
 * than failing: correcting yesterday's mistake is the same gesture as making
 * today's decision.
 */
export async function bindSchoolAlias(input: {
  alias: string;
  schoolId: number;
  boundBy: string;
}): Promise<{ ok: boolean; reason?: string; schoolName?: string }> {
  const alias = input.alias.trim();
  if (!alias) return { ok: false, reason: "That name is empty." };

  const [school] = await sql<{ name: string }[]>`
    SELECT name FROM school WHERE id = ${input.schoolId} AND is_active`;
  if (!school) return { ok: false, reason: "That school no longer exists." };

  // A name that already resolves on its own does not need an alias, and one
  // that equals the school's own name would be a no-op row.
  if (alias.toLowerCase() === school.name.toLowerCase()) {
    return { ok: false, reason: "That is already the school's name." };
  }

  const note = `Bound from the results preview by ${input.boundBy} on ${new Date().toISOString().slice(0, 10)}.`;
  await sql`
    INSERT INTO school_alias (school_id, alias, note)
    VALUES (${input.schoolId}, ${alias}, ${note})
    ON CONFLICT (alias)
      DO UPDATE SET school_id = EXCLUDED.school_id, note = EXCLUDED.note`;

  return { ok: true, schoolName: school.name };
}
