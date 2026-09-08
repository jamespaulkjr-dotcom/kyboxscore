import type { TransactionSql } from "postgres";
import { sql } from "./client.ts";
import { refreshTeamSeasonRollups } from "./rollups.ts";

/**
 * Turning a pasted schedule into games.
 *
 * The hard part is not the dates, it is that "Trinity" is two schools and
 * "St. X" is nobody's official name. School matching therefore reports its
 * confidence and its runners-up, and anything short of certain goes to a human
 * rather than being guessed - the same rule the box score importer follows for
 * jersey numbers.
 *
 * **A name on its own is not a key.** Kentucky has a Clay County, a Jackson
 * County, a Western Hills, a Scott, a Franklin County, a Union County and a
 * Saint Xavier; so do Tennessee and Ohio. Matching on name alone put nine
 * Kentucky schools in games they never played, corrupted their records, and
 * fed the wrong strength of schedule into every rating in the state, because
 * an in-state opponent contributes its real winning percentage and an
 * out-of-state one a flat .500.
 *
 * So a caller that knows the city or the state says so, and a bare name that
 * could be more than one school across states is returned as ambiguous rather
 * than resolved.
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

/** A name, and whatever else is known about which school it is. */
export type SchoolQuery = { name: string; city?: string | null; state?: string | null };

function asQueries(names: (string | SchoolQuery)[]): SchoolQuery[] {
  const seen = new Set<string>();
  const out: SchoolQuery[] = [];
  for (const n of names) {
    const q: SchoolQuery = typeof n === "string" ? { name: n } : n;
    const name = q.name?.trim();
    if (!name) continue;
    const key = `${name}|${q.city ?? ""}|${q.state ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...q, name });
  }
  return out;
}

export async function matchSchoolNames(
  names: (string | SchoolQuery)[]
): Promise<SchoolMatch[]> {
  const unique = asQueries(names);
  const out: SchoolMatch[] = [];

  for (const query of unique) {
    const input = query.name;
    const state = query.state?.trim().toUpperCase() || null;
    const city = query.city?.trim() || null;

    // An alias is a person's decision and beats every rule below, including
    // the state lookup: somebody wrote down that "Archbishop Moeller" is the
    // school we hold as "Moeller", and no query should second-guess that. A
    // state hint still has to agree, so an alias cannot drag a match across a
    // border either.
    const aliased = await sql<{ id: number; name: string; state: string }[]>`
      SELECT sc.id::int, sc.name, sc.state
      FROM school_alias a
      JOIN school sc ON sc.id = a.school_id
      WHERE a.alias = ${input} AND sc.is_active
        AND (${state}::text IS NULL OR upper(sc.state) = ${state})`;
    if (aliased.length === 1) {
      out.push({
        input,
        schoolId: aliased[0].id,
        schoolName: aliased[0].name,
        method: "exact",
        confidence: 1,
        candidates: [],
      });
      continue;
    }

    // When the city and state are known, they decide it. This is the whole
    // point: "Clay County, Celina, TN" is not Kentucky's Clay County however
    // similar the names look.
    if (state) {
      const placed = await sql<{ id: number; name: string }[]>`
        SELECT id::int, name FROM school
        WHERE is_active AND upper(state) = ${state}
          AND (lower(name) = lower(${input})
            OR lower(regexp_replace(name, '[[:space:]]+(Senior[[:space:]]+)?High[[:space:]]+School$', '', 'i'))
               = lower(${input})
            OR lower(coalesce(short_name, '')) = lower(${input}))
          AND (${city}::text IS NULL OR city IS NULL OR lower(city) = lower(${city}))
        ORDER BY (lower(coalesce(city, '')) = lower(coalesce(${city}, ''))) DESC
        LIMIT 5`;
      if (placed.length === 1) {
        out.push({
          input,
          schoolId: placed[0].id,
          schoolName: placed[0].name,
          method: "exact",
          confidence: 1,
          candidates: [],
        });
        continue;
      }
      if (placed.length > 1) {
        out.push({
          input,
          schoolId: null,
          schoolName: null,
          method: "unmatched",
          confidence: null,
          candidates: placed.map((p) => ({ schoolId: p.id, name: p.name, score: 1 })),
        });
        continue;
      }

      // No exact hit in that state. Try spelling drift, still inside the
      // state: "Paduka Tilghman" should find Paducah Tilghman in Kentucky.
      const near = await sql<{ id: number; name: string; score: number }[]>`
        SELECT id::int, name,
               greatest(
                 similarity(name, ${input}),
                 similarity(coalesce(short_name, name), ${input}),
                 similarity(
                   regexp_replace(name, '[[:space:]]+(Senior[[:space:]]+)?High[[:space:]]+School$', '', 'i'),
                   ${input})
               )::float8 AS score
        FROM school
        WHERE is_active AND upper(state) = ${state}
        ORDER BY score DESC LIMIT 5`;
      const best = near.filter((n) => n.score > SIMILARITY_FLOOR);
      if (best.length === 1 || (best.length > 1 && best[0].score - best[1].score > 0.15)) {
        out.push({
          input,
          schoolId: best[0].id,
          schoolName: best[0].name,
          method: "similar",
          confidence: best[0].score,
          candidates: best.slice(1).map((c) => ({ schoolId: c.id, name: c.name, score: c.score })),
        });
        continue;
      }

      // Nothing in the state the caller named. Falling back to a school in a
      // different state would be exactly the mistake this parameter exists to
      // prevent, so report it instead - with whatever does exist elsewhere,
      // because "there is a Clay County, but in Kentucky" is the useful answer.
      const elsewhere = await sql<{ id: number; name: string; state: string }[]>`
        SELECT id::int, name, state FROM school
        WHERE is_active
          AND (lower(name) = lower(${input})
            OR lower(coalesce(short_name, '')) = lower(${input})
            OR lower(regexp_replace(name, '[[:space:]]+(Senior[[:space:]]+)?High[[:space:]]+School$', '', 'i'))
               = lower(${input}))
        LIMIT 5`;
      out.push({
        input,
        schoolId: null,
        schoolName: null,
        method: "unmatched",
        confidence: null,
        candidates: [
          ...best.map((c) => ({ schoolId: c.id, name: c.name, score: c.score })),
          ...elsewhere.map((c) => ({
            schoolId: c.id,
            name: `${c.name} [${c.state}]`,
            score: 1,
          })),
        ].slice(0, 5),
      });
      continue;
    }
    // 0. A confirmed alias beats every other rule. A person decided this, and
    // no amount of string similarity should be allowed to overrule them.
    const alias = await sql<{ id: number; name: string }[]>`
      SELECT sc.id::int, sc.name
      FROM school_alias a
      JOIN school sc ON sc.id = a.school_id
      WHERE a.alias = ${input} AND sc.is_active`;
    if (alias.length === 1) {
      out.push({
        input,
        schoolId: alias[0].id,
        schoolName: alias[0].name,
        method: "exact",
        confidence: 1,
        candidates: [],
      });
      continue;
    }

    // A bare name that exists in more than one state is not answerable, and
    // guessing is how Barren County ended up playing Kentucky's Clay County.
    const across = await sql<{ states: number }[]>`
      SELECT count(DISTINCT state)::int AS states FROM school
      WHERE is_active
        AND (lower(name) = lower(${input})
          OR lower(regexp_replace(name, '[[:space:]]+(Senior[[:space:]]+)?High[[:space:]]+School$', '', 'i'))
             = lower(${input}))`;
    if ((across[0]?.states ?? 0) > 1) {
      const spread = await sql<{ id: number; name: string; state: string }[]>`
        SELECT id::int, name, state FROM school
        WHERE is_active
          AND (lower(name) = lower(${input})
            OR lower(regexp_replace(name, '[[:space:]]+(Senior[[:space:]]+)?High[[:space:]]+School$', '', 'i'))
               = lower(${input}))
        LIMIT 5`;
      out.push({
        input,
        schoolId: null,
        schoolName: null,
        method: "unmatched",
        confidence: null,
        candidates: spread.map((c) => ({
          schoolId: c.id,
          name: `${c.name} [${c.state}]`,
          score: 1,
        })),
      });
      continue;
    }

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

    // 2. Exact on the bare name. "Newport" IS the school's name; "High School"
    // is boilerplate. Without this step "Newport" looks ambiguous because
    // Newport Central Catholic also contains it, when in fact there is an
    // exact answer. This resolves the large majority of real-world misses.
    const bare = await sql<{ id: number; name: string }[]>`
      SELECT id::int, name FROM school
      WHERE is_active
        AND lower(regexp_replace(name, '[[:space:]]+(Senior[[:space:]]+)?High[[:space:]]+School$', '', 'i'))
            = lower(${input})`;
    if (bare.length === 1) {
      out.push({
        input,
        schoolId: bare[0].id,
        schoolName: bare[0].name,
        method: "exact",
        confidence: 1,
        candidates: [],
      });
      continue;
    }

    // 3. Substring, which catches "John Hardin" -> "John Hardin High School".
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

    // 4. Trigram similarity, for spelling drift and abbreviations.
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
  /**
   * Defaults to a regular season game. Scrimmages matter: RPI counts regular
   * season only, so importing one as a real game would corrupt every rating
   * that touches it.
   */
  stage?: "regular_season" | "preseason" | "scrimmage" | "district_tournament";
  /**
   * Defaults to final when scores are present and scheduled otherwise. Passed
   * explicitly when the source knows better - a canceled game has no scores
   * but is not upcoming, and deriving status from scores alone would leave it
   * on the schedule forever as a game that never happens.
   */
  status?: "scheduled" | "final" | "canceled" | "forfeit" | "postponed";
  /** Kick-off in local time, "HH:MM". */
  time?: string | null;
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
  const [ss] = await sql<{ id: number; startsOn: string }[]>`
    SELECT id::int, starts_on::text AS "startsOn"
    FROM sport_season WHERE sport_id = ${sportId} AND is_current`;
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

        const status =
          row.status ?? (row.homeScore !== null ? "final" : "scheduled");
        // A game before the season opens counts for nothing, whatever the
        // source called it. An explicit scrimmage keeps that label: it is more
        // specific, and a human may have set it deliberately.
        const requested = row.stage ?? "regular_season";
        const stage =
          requested === "regular_season" && row.date < ss.startsOn
            ? "preseason"
            : requested;
        const [g] = await tx<{ id: number }[]>`
          INSERT INTO game (sport_season_id, short_code, local_date, local_time,
                            status, stage)
          VALUES (${ss.id}, ${shortCode()}, ${row.date}::date,
                  ${row.time ?? null}::time, ${status}::game_status,
                  ${stage}::game_stage)
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

  // A schedule carries results, so records have to be rebuilt. Without this a
  // team can be 2-0 in the games table and 0-0 everywhere a human looks.
  // Every team touched by the paste, both sides of every game.
  const touchedSchools = [
    ...new Set(rows.flatMap((r) => [r.homeSchoolId, r.awaySchoolId])),
  ];
  if (touchedSchools.length > 0) {
    const seasons = await sql<{ id: number }[]>`
      SELECT ts.id::int
      FROM team_season ts
      JOIN team t ON t.id = ts.team_id
      WHERE ts.sport_season_id = ${ss.id}
        AND t.sport_id = ${sportId}
        AND t.school_id = ANY(${touchedSchools}::bigint[])`;
    for (const s of seasons) {
      await refreshTeamSeasonRollups(s.id);
    }
  }

  return { created, duplicates, failed, teamsCreated: teamsAfter - teamsBefore };
}
