import type { TransactionSql } from "postgres";
import { sql } from "./client.ts";

/**
 * Bulk district assignment.
 *
 * KHSAA realigns every two years, so this is re-run each cycle rather than
 * entered once. Assignment lands on `team_season`, not `team`, which is what
 * makes history survive: last season's teams keep pointing at last season's
 * alignment while this season's move.
 */

export type AlignmentTarget = {
  lineNumber: number;
  schoolId: number;
  schoolName: string;
  classOrdinal: number;
  districtNumber: number;
};

export type AlignmentCommitResult = {
  assigned: number;
  unchanged: number;
  teamsCreated: number;
  failed: { lineNumber: number; schoolName: string; reason: string }[];
};

/** The leaf district row for a class and district number, still in effect. */
export async function resolveFootballAlignments(sportId: number) {
  const rows = await sql<
    { alignmentId: number; classOrdinal: number; districtNumber: number }[]
  >`
    SELECT a.id::int AS "alignmentId",
           parent.ordinal::int AS "classOrdinal",
           a.ordinal::int AS "districtNumber"
    FROM alignment a
    JOIN alignment parent
      ON parent.id = a.parent_id AND parent.kind = 'classification'
    WHERE a.sport_id = ${sportId}
      AND a.kind = 'district'
      AND a.effective_to IS NULL`;
  return new Map(
    rows.map((r) => [`${r.classOrdinal}-${r.districtNumber}`, r.alignmentId])
  );
}

async function ensureTeamSeason(
  tx: TransactionSql,
  schoolId: number,
  sportId: number,
  gender: string,
  level: string,
  sportSeasonId: number
): Promise<{ teamSeasonId: number; created: boolean }> {
  const [existing] = await tx<{ id: number }[]>`
    SELECT t.id::int FROM team t
    WHERE t.school_id = ${schoolId} AND t.sport_id = ${sportId}
      AND t.gender = ${gender}::gender AND t.level = ${level}::team_level`;

  const [t] = await tx<{ id: number }[]>`
    INSERT INTO team (school_id, sport_id, gender, level)
    VALUES (${schoolId}, ${sportId}, ${gender}::gender, ${level}::team_level)
    ON CONFLICT (school_id, sport_id, gender, level) DO UPDATE SET level = EXCLUDED.level
    RETURNING id::int`;

  const [ts] = await tx<{ id: number }[]>`
    INSERT INTO team_season (team_id, sport_season_id)
    VALUES (${t.id}, ${sportSeasonId})
    ON CONFLICT (team_id, sport_season_id) DO UPDATE SET team_id = EXCLUDED.team_id
    RETURNING id::int`;

  return { teamSeasonId: ts.id, created: !existing };
}

export async function commitAlignments(
  targets: AlignmentTarget[],
  sportId: number,
  gender: string,
  level: string
): Promise<AlignmentCommitResult> {
  const [ss] = await sql<{ id: number }[]>`
    SELECT id::int FROM sport_season WHERE sport_id = ${sportId} AND is_current`;
  if (!ss) {
    return {
      assigned: 0,
      unchanged: 0,
      teamsCreated: 0,
      failed: [{ lineNumber: 0, schoolName: "", reason: "That sport has no season open." }],
    };
  }

  const alignments = await resolveFootballAlignments(sportId);

  let assigned = 0;
  let unchanged = 0;
  let teamsCreated = 0;
  const failed: AlignmentCommitResult["failed"] = [];

  for (const target of targets) {
    const key = `${target.classOrdinal}-${target.districtNumber}`;
    const alignmentId = alignments.get(key);
    if (!alignmentId) {
      failed.push({
        lineNumber: target.lineNumber,
        schoolName: target.schoolName,
        reason: `No Class ${target.classOrdinal}A District ${target.districtNumber} exists for this sport.`,
      });
      continue;
    }

    try {
      const result = await sql.begin(async (tx) => {
        const { teamSeasonId, created } = await ensureTeamSeason(
          tx, target.schoolId, sportId, gender, level, ss.id
        );
        const [before] = await tx<{ alignmentId: number | null }[]>`
          SELECT alignment_id::int AS "alignmentId" FROM team_season
          WHERE id = ${teamSeasonId}`;
        if (before?.alignmentId === alignmentId) {
          return { changed: false, created };
        }
        await tx`
          UPDATE team_season SET alignment_id = ${alignmentId}
          WHERE id = ${teamSeasonId}`;
        return { changed: true, created };
      });

      if (result.created) teamsCreated++;
      if (result.changed) assigned++;
      else unchanged++;
    } catch (err) {
      failed.push({
        lineNumber: target.lineNumber,
        schoolName: target.schoolName,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { assigned, unchanged, teamsCreated, failed };
}

/** What is currently assigned, for showing the result and spotting gaps. */
export async function getAlignmentSummary(sportId: number) {
  return sql<
    {
      className: string;
      classOrdinal: number;
      districtNumber: number;
      teams: number;
      schools: string;
    }[]
  >`
    SELECT parent.name AS "className", parent.ordinal::int AS "classOrdinal",
           a.ordinal::int AS "districtNumber",
           count(ts.id)::int AS teams,
           string_agg(sc.name, ', ' ORDER BY sc.name) AS schools
    FROM alignment a
    JOIN alignment parent
      ON parent.id = a.parent_id AND parent.kind = 'classification'
    LEFT JOIN team_season ts ON ts.alignment_id = a.id
    LEFT JOIN team t   ON t.id = ts.team_id
    LEFT JOIN school sc ON sc.id = t.school_id
    WHERE a.sport_id = ${sportId} AND a.kind = 'district' AND a.effective_to IS NULL
    GROUP BY parent.name, parent.ordinal, a.ordinal
    HAVING count(ts.id) > 0
    ORDER BY parent.ordinal, a.ordinal`;
}
