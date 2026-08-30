import type { TransactionSql } from "postgres";
import { sql } from "./client.ts";

/**
 * Turning a pasted schedule into games.
 *
 * The hard part is not the dates, it is that "Trinity" is two schools and
 * "St. X" is nobody's official name. School matching therefore reports its
 * confidence and its runners-up, and anything short of certain goes to a human
 * rather than being guessed - the same rule the box score importer follows for
 * jersey numbers.
 */

export type SchoolMatch = {
  input: string;
  schoolId: number | null;
  schoolName: string | null;
  method: "exact" | "contains" | "similar" | "unmatched";
  confidence: number | null;
  candidates: { schoolId: number; name: string; score: number }[];
};

/** Below this, a trigram hit is noise rather than a near miss. */
const SIMILARITY_FLOOR = 0.45;

export async function matchSchoolNames(names: string[]): Promise<SchoolMatch[]> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const out: SchoolMatch[] = [];

  for (const input of unique) {
    // 1. Exact, case-insensitive. school.name is text, so lower() both sides.
    const exact = await sql<{ id: number; name: string }[]>`
      SELECT id::int, name FROM school
      WHERE lower(name) = lower(${input}) AND is_active`;
    if (exact.length === 1) {
      out.push({
        input,
        schoolId: exact[0].id,
        schoolName: exact[0].name,
        method: "exact",
        confidence: 1,
        candidates: [],
      });
      continue;
    }

    // 2. Substring, which catches "John Hardin" -> "John Hardin High School".
    const contains = await sql<{ id: number; name: string }[]>`
      SELECT id::int, name FROM school
      WHERE name ILIKE ${"%" + input + "%"} AND is_active
      LIMIT 5`;
    if (contains.length === 1) {
      out.push({
        input,
        schoolId: contains[0].id,
        schoolName: contains[0].name,
        method: "contains",
        confidence: 0.9,
        candidates: [],
      });
      continue;
    }

    // 3. Trigram similarity, for spelling drift and abbreviations.
    //
    // Compared against the bare name as well as the full one: a schedule says
    // "Paducah Tilghman", the database says "Paducah Tilghman High School",
    // and the institutional suffix dilutes the score enough to sink a real
    // near-miss like "Paduka Tilghman". 291 rows, so the sequential scan this
    // forces is irrelevant.
    const similar = await sql<{ id: number; name: string; score: number }[]>`
      SELECT id::int, name,
             greatest(
               similarity(name, ${input}),
               similarity(
                 regexp_replace(name, '[[:space:]]+(Senior[[:space:]]+)?High[[:space:]]+School$', '', 'i'),
                 ${input}
               )
             )::float8 AS score
      FROM school
      WHERE is_active
        AND greatest(
              similarity(name, ${input}),
              similarity(
                regexp_replace(name, '[[:space:]]+(Senior[[:space:]]+)?High[[:space:]]+School$', '', 'i'),
                ${input}
              )
            ) > ${SIMILARITY_FLOOR}
      ORDER BY score DESC
      LIMIT 5`;

    const pool = contains.length > 1
      ? contains.map((c) => ({ id: c.id, name: c.name, score: 0.9 }))
      : similar;

    // A clear winner is one that beats the runner-up by a real margin.
    const decisive =
      pool.length === 1 ||
      (pool.length > 1 && pool[0].score - pool[1].score > 0.15);

    if (pool.length >= 1 && decisive && contains.length <= 1) {
      out.push({
        input,
        schoolId: pool[0].id,
        schoolName: pool[0].name,
        method: "similar",
        confidence: pool[0].score,
        candidates: pool.slice(1).map((c) => ({ schoolId: c.id, name: c.name, score: c.score })),
      });
      continue;
    }

    out.push({
      input,
      schoolId: null,
      schoolName: null,
      method: "unmatched",
      confidence: null,
      candidates: pool.map((c) => ({ schoolId: c.id, name: c.name, score: c.score })),
    });
  }

  return out;
}

/**
 * A schedule names schools, not teams. The team for a school in a given sport,
 * gender and level is created on demand: requiring 200 teams to be made by hand
 * before a schedule can be pasted would make the importer useless.
 */
async function ensureTeam(
  tx: TransactionSql,
  schoolId: number,
  sportId: number,
  gender: string,
  level: string,
  sportSeasonId: number
): Promise<number> {
  const [t] = await tx<{ id: number }[]>`
    INSERT INTO team (school_id, sport_id, gender, level)
    VALUES (${schoolId}, ${sportId}, ${gender}::gender, ${level}::team_level)
    ON CONFLICT (school_id, sport_id, gender, level) DO UPDATE SET level = EXCLUDED.level
    RETURNING id::int`;
  await tx`
    INSERT INTO team_season (team_id, sport_season_id)
    VALUES (${t.id}, ${sportSeasonId})
    ON CONFLICT (team_id, sport_season_id) DO NOTHING`;
  return t.id;
}

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function shortCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export type ScheduleCommitRow = {
  lineNumber: number;
  date: string;
  homeSchoolId: number;
  awaySchoolId: number;
  homeScore: number | null;
  awayScore: number | null;
};

export type ScheduleCommitResult = {
  created: number;
  duplicates: number;
  failed: { lineNumber: number; reason: string }[];
  teamsCreated: number;
};

export async function commitSchedule(
  rows: ScheduleCommitRow[],
  sportId: number,
  gender: string,
  level: string
): Promise<ScheduleCommitResult> {
  const [ss] = await sql<{ id: number }[]>`
    SELECT id::int FROM sport_season WHERE sport_id = ${sportId} AND is_current`;
  if (!ss) {
    return {
      created: 0,
      duplicates: 0,
      teamsCreated: 0,
      failed: [{ lineNumber: 0, reason: "That sport has no season open." }],
    };
  }

  const [{ count: teamsBefore }] = await sql<{ count: number }[]>`
    SELECT count(*)::int FROM team WHERE sport_id = ${sportId}`;

  let created = 0;
  let duplicates = 0;
  const failed: { lineNumber: number; reason: string }[] = [];

  // One transaction per game rather than one for the whole paste: a single bad
  // line should not discard 200 good ones, and each game must still be atomic
  // because of the deferred "exactly two participants" constraint.
  for (const row of rows) {
    try {
      await sql.begin(async (tx) => {
        const homeTeam = await ensureTeam(tx, row.homeSchoolId, sportId, gender, level, ss.id);
        const awayTeam = await ensureTeam(tx, row.awaySchoolId, sportId, gender, level, ss.id);

        const status = row.homeScore !== null ? "final" : "scheduled";
        const [g] = await tx<{ id: number }[]>`
          INSERT INTO game (sport_season_id, short_code, local_date, status)
          VALUES (${ss.id}, ${shortCode()}, ${row.date}::date, ${status}::game_status)
          RETURNING id::int`;
        await tx`
          INSERT INTO game_participant (game_id, team_id, role, score)
          VALUES (${g.id}, ${homeTeam}, 'home', ${row.homeScore})`;
        await tx`
          INSERT INTO game_participant (game_id, team_id, role, score)
          VALUES (${g.id}, ${awayTeam}, 'away', ${row.awayScore})`;
      });
      created++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("game_natural_key")) {
        // Already on the schedule. Re-pasting a corrected block is normal.
        duplicates++;
      } else {
        failed.push({ lineNumber: row.lineNumber, reason: message });
      }
    }
  }

  const [{ count: teamsAfter }] = await sql<{ count: number }[]>`
    SELECT count(*)::int FROM team WHERE sport_id = ${sportId}`;

  return { created, duplicates, failed, teamsCreated: teamsAfter - teamsBefore };
}
