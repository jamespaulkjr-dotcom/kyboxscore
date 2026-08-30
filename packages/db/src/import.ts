import { sql } from "./client.ts";

/**
 * Import pipeline queries.
 *
 * The flow is upload -> parse -> preview -> resolve -> commit. Nothing reaches
 * stat_line until a human presses commit, and every row keeps the raw text the
 * file actually contained so a parser fix can be replayed later.
 */

export type ImportableTeam = {
  teamSeasonId: number;
  teamId: number;
  schoolName: string;
  sportSlug: string;
  sportName: string;
  gender: string;
  level: string;
  seasonLabel: string;
};

/**
 * Teams this user may import for, restricted to seasons that actually exist.
 * A grant on a team with no current season yields nothing, which is correct:
 * there is nowhere to put the statistics.
 */
export async function listImportableTeams(userId: number) {
  return sql<ImportableTeam[]>`
    SELECT ts.id::int AS "teamSeasonId", t.id::int AS "teamId",
           sc.name AS "schoolName", sp.slug AS "sportSlug", sp.name AS "sportName",
           t.gender::text AS gender, t.level::text AS level,
           se.label AS "seasonLabel"
    FROM user_team_grant g
    JOIN team t          ON t.id = g.team_id
    JOIN team_season ts  ON ts.team_id = t.id
    JOIN sport_season ss ON ss.id = ts.sport_season_id AND ss.is_current
    JOIN season se       ON se.id = ss.season_id
    JOIN school sc       ON sc.id = t.school_id
    JOIN sport sp        ON sp.id = t.sport_id
    WHERE g.user_id = ${userId}
    ORDER BY sp.display_order, sc.name`;
}

export type ImportableGame = {
  gameId: number;
  shortCode: string;
  localDate: string;
  status: string;
  opponentName: string;
  isHome: boolean;
};

/** Games this team has, newest first. A box score has to attach to one. */
export async function listGamesForTeamSeason(teamSeasonId: number) {
  return sql<ImportableGame[]>`
    SELECT g.id::int AS "gameId", g.short_code AS "shortCode",
           g.local_date::text AS "localDate", g.status::text AS status,
           opp_school.name AS "opponentName",
           (mine.role = 'home') AS "isHome"
    FROM team_season ts
    JOIN game_participant mine ON mine.team_id = ts.team_id
    JOIN game g ON g.id = mine.game_id AND g.sport_season_id = ts.sport_season_id
    JOIN game_participant opp ON opp.game_id = g.id AND opp.id <> mine.id
    JOIN team opp_team   ON opp_team.id = opp.team_id
    JOIN school opp_school ON opp_school.id = opp_team.school_id
    WHERE ts.id = ${teamSeasonId}
    ORDER BY g.local_date DESC
    LIMIT 100`;
}

export type RosterEntry = {
  playerId: number;
  name: string;
  jersey: string | null;
};

export async function getRosterForMatching(teamSeasonId: number) {
  return sql<RosterEntry[]>`
    SELECT p.id::int AS "playerId",
           p.first_name || ' ' || p.last_name AS name,
           ps.jersey
    FROM player_season ps
    JOIN player p ON p.id = ps.player_id
    WHERE ps.team_season_id = ${teamSeasonId}
    ORDER BY p.last_name, p.first_name`;
}

/**
 * Idempotency: the same bytes uploaded twice for the same team is the same
 * import, not a second one. Returns the earlier batch so the caller can send
 * the coach to it instead of creating a duplicate.
 */
export async function findBatchBySha(teamSeasonId: number, sha256: string) {
  const rows = await sql<{ id: number; status: string }[]>`
    SELECT id::int, status FROM import_batch
    WHERE team_season_id = ${teamSeasonId} AND sha256 = ${sha256}
    LIMIT 1`;
  return rows[0] ?? null;
}

export async function createImportBatch(input: {
  dataSourceSlug: string;
  uploadedById: number;
  teamSeasonId: number;
  gameId: number | null;
  vendor: string | null;
  format: string;
  originalFilename: string | null;
  byteSize: number;
  sha256: string;
  rawText: string;
  parsedSummary: unknown;
  status: string;
}): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO import_batch
      (data_source_id, uploaded_by_id, team_season_id, game_id, vendor, format,
       original_filename, byte_size, sha256, raw_text, parsed_summary, status,
       parsed_at)
    SELECT ds.id, ${input.uploadedById}, ${input.teamSeasonId}, ${input.gameId},
           ${input.vendor}, ${input.format}, ${input.originalFilename},
           ${input.byteSize}, ${input.sha256}, ${input.rawText},
           ${sql.json(input.parsedSummary as never)}, ${input.status}, now()
    FROM data_source ds
    WHERE ds.slug = ${input.dataSourceSlug}
    RETURNING id::int`;
  if (!rows[0]) throw new Error(`unknown data source: ${input.dataSourceSlug}`);
  return rows[0].id;
}

export type NewImportRow = {
  rowNumber: number;
  raw: unknown;
  parsedJersey: string | null;
  matchedPlayerId: number | null;
  matchConfidence: number | null;
  matchMethod: string;
};

export async function insertImportRows(batchId: number, rows: NewImportRow[]) {
  if (rows.length === 0) return;
  await sql`
    INSERT INTO import_row ${sql(
      rows.map((r) => ({
        import_batch_id: batchId,
        row_number: r.rowNumber,
        raw: sql.json(r.raw as never),
        parsed_jersey: r.parsedJersey,
        matched_player_id: r.matchedPlayerId,
        match_confidence: r.matchConfidence,
        match_method: r.matchMethod,
      })),
      "import_batch_id",
      "row_number",
      "raw",
      "parsed_jersey",
      "matched_player_id",
      "match_confidence",
      "match_method"
    )}`;
}

export type NewImportIssue = {
  severity: string;
  code: string;
  message: string;
  context?: unknown;
};

export async function insertImportIssues(batchId: number, issues: NewImportIssue[]) {
  if (issues.length === 0) return;
  await sql`
    INSERT INTO import_issue ${sql(
      issues.map((i) => ({
        import_batch_id: batchId,
        severity: i.severity,
        code: i.code,
        message: i.message,
        context: i.context === undefined ? null : sql.json(i.context as never),
      })),
      "import_batch_id",
      "severity",
      "code",
      "message",
      "context"
    )}`;
}

export type ImportBatchDetail = {
  id: number;
  status: string;
  format: string;
  vendor: string | null;
  originalFilename: string | null;
  byteSize: number | null;
  createdAt: string;
  committedAt: string | null;
  teamSeasonId: number;
  gameId: number | null;
  gameShortCode: string | null;
  gameDate: string | null;
  opponentName: string | null;
  schoolName: string;
  sportSlug: string;
  parsedSummary: Record<string, unknown> | null;
};

/**
 * Authorization is part of the query, not a separate check: a batch is only
 * visible to a user who holds a grant on its team. Admins and staff see all.
 */
export async function getImportBatchForUser(batchId: number, userId: number) {
  const rows = await sql<ImportBatchDetail[]>`
    SELECT b.id::int, b.status, b.format, b.vendor,
           b.original_filename AS "originalFilename", b.byte_size::int AS "byteSize",
           b.created_at::text AS "createdAt", b.committed_at::text AS "committedAt",
           b.team_season_id::int AS "teamSeasonId", b.game_id::int AS "gameId",
           g.short_code AS "gameShortCode", g.local_date::text AS "gameDate",
           opp_school.name AS "opponentName",
           sc.name AS "schoolName", sp.slug AS "sportSlug",
           b.parsed_summary AS "parsedSummary"
    FROM import_batch b
    JOIN team_season ts ON ts.id = b.team_season_id
    JOIN team t   ON t.id = ts.team_id
    JOIN school sc ON sc.id = t.school_id
    JOIN sport sp  ON sp.id = t.sport_id
    LEFT JOIN game g ON g.id = b.game_id
    LEFT JOIN game_participant opp
           ON opp.game_id = g.id AND opp.team_id <> t.id
    LEFT JOIN team opp_team   ON opp_team.id = opp.team_id
    LEFT JOIN school opp_school ON opp_school.id = opp_team.school_id
    WHERE b.id = ${batchId}
      AND (
        EXISTS (SELECT 1 FROM user_team_grant ug
                 WHERE ug.user_id = ${userId} AND ug.team_id = t.id)
        OR EXISTS (SELECT 1 FROM app_user u
                    WHERE u.id = ${userId} AND u.role IN ('admin','staff'))
      )
    LIMIT 1`;
  return rows[0] ?? null;
}

export type ImportRowDetail = {
  id: number;
  rowNumber: number;
  raw: Record<string, unknown>;
  parsedJersey: string | null;
  matchedPlayerId: number | null;
  matchMethod: string | null;
  matchConfidence: number | null;
  playerName: string | null;
};

export async function getImportRows(batchId: number) {
  return sql<ImportRowDetail[]>`
    SELECT r.id::int, r.row_number::int AS "rowNumber", r.raw,
           r.parsed_jersey AS "parsedJersey",
           r.matched_player_id::int AS "matchedPlayerId",
           r.match_method AS "matchMethod",
           r.match_confidence::float8 AS "matchConfidence",
           p.first_name || ' ' || p.last_name AS "playerName"
    FROM import_row r
    LEFT JOIN player p ON p.id = r.matched_player_id
    WHERE r.import_batch_id = ${batchId}
    ORDER BY r.row_number`;
}

export async function getImportIssues(batchId: number) {
  return sql<
    { severity: string; code: string; message: string }[]
  >`
    SELECT severity, code, message
    FROM import_issue
    WHERE import_batch_id = ${batchId}
    ORDER BY CASE severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
             id`;
}

/** Manual resolution of one row. Records who decided, for the audit trail. */
export async function setRowMatch(
  batchId: number,
  rowId: number,
  playerId: number | null,
  userId: number
) {
  await sql`
    UPDATE import_row
    SET matched_player_id = ${playerId},
        match_method = ${playerId === null ? "unmatched" : "manual"},
        match_confidence = ${playerId === null ? null : 1},
        resolved_by_id = ${userId},
        resolved_at = now()
    WHERE id = ${rowId} AND import_batch_id = ${batchId}`;
}

/**
 * Remember a jersey correction so the next upload matches it automatically.
 * Scoped to the team season, because a jersey is only unambiguous within one
 * roster.
 */
export async function rememberJerseyAlias(
  teamSeasonId: number,
  rawName: string,
  playerId: number,
  vendor: string | null,
  userId: number
) {
  await sql`
    INSERT INTO player_name_alias
      (team_season_id, raw_name, player_id, vendor, confirmed_by_id)
    VALUES (${teamSeasonId}, ${rawName}, ${playerId}, ${vendor}, ${userId})
    ON CONFLICT (team_season_id, raw_name) DO UPDATE
      SET player_id = EXCLUDED.player_id,
          confirmed_by_id = EXCLUDED.confirmed_by_id,
          confirmed_at = now()`;
}

export async function getJerseyAliases(teamSeasonId: number) {
  return sql<{ rawName: string; playerId: number }[]>`
    SELECT raw_name AS "rawName", player_id::int AS "playerId"
    FROM player_name_alias
    WHERE team_season_id = ${teamSeasonId}`;
}

/** stat_definition key -> id for one sport. */
export async function getStatDefinitionIds(sportSlug: string) {
  const rows = await sql<{ key: string; id: number }[]>`
    SELECT sd.key::text, sd.id::int
    FROM stat_definition sd
    JOIN sport sp ON sp.id = sd.sport_id
    WHERE sp.slug = ${sportSlug} AND NOT sd.is_derived`;
  return new Map(rows.map((r) => [r.key, r.id]));
}

export type CommitResult = {
  linesWritten: number;
  valuesWritten: number;
  rowsSkipped: number;
};

/**
 * Writes the batch into stat_line and stat_value.
 *
 * Idempotent by design: stat_line is unique on (game_id, player_id), so a
 * re-import of a corrected file overwrites the earlier line instead of
 * doubling it. Stat values for the line are replaced wholesale rather than
 * merged, because a corrected export may legitimately remove a column.
 *
 * Unmatched rows are skipped and counted, never guessed at.
 */
export async function commitImportBatch(
  batchId: number,
  userId: number,
  statsByRow: Map<number, Record<string, number>>,
  didNotPlayRows: Set<number>
): Promise<CommitResult> {
  return sql.begin(async (tx) => {
    const [batch] = await tx<
      {
        id: number;
        gameId: number | null;
        teamSeasonId: number;
        teamId: number;
        sportSlug: string;
        dataSourceId: number;
        status: string;
      }[]
    >`
      SELECT b.id::int, b.game_id::int AS "gameId",
             b.team_season_id::int AS "teamSeasonId",
             t.id::int AS "teamId", sp.slug AS "sportSlug",
             b.data_source_id::int AS "dataSourceId", b.status
      FROM import_batch b
      JOIN team_season ts ON ts.id = b.team_season_id
      JOIN team t  ON t.id = ts.team_id
      JOIN sport sp ON sp.id = t.sport_id
      WHERE b.id = ${batchId}
      FOR UPDATE OF b`;

    if (!batch) throw new Error("import batch not found");
    if (batch.status === "committed") throw new Error("already committed");
    if (batch.gameId === null) throw new Error("no game attached to this import");

    const [participant] = await tx<{ id: number }[]>`
      SELECT id::int FROM game_participant
      WHERE game_id = ${batch.gameId} AND team_id = ${batch.teamId}`;
    if (!participant) {
      throw new Error("this team is not a participant in that game");
    }

    const defs = await tx<{ key: string; id: number }[]>`
      SELECT sd.key::text, sd.id::int
      FROM stat_definition sd
      JOIN sport sp ON sp.id = sd.sport_id
      WHERE sp.slug = ${batch.sportSlug} AND NOT sd.is_derived`;
    const defId = new Map(defs.map((d) => [d.key, d.id]));

    const rows = await tx<
      { id: number; matchedPlayerId: number | null; parsedJersey: string | null }[]
    >`
      SELECT id::int, matched_player_id::int AS "matchedPlayerId",
             parsed_jersey AS "parsedJersey"
      FROM import_row WHERE import_batch_id = ${batchId}`;

    let linesWritten = 0;
    let valuesWritten = 0;
    let rowsSkipped = 0;

    for (const row of rows) {
      if (row.matchedPlayerId === null) {
        rowsSkipped++;
        continue;
      }
      const stats = statsByRow.get(row.id) ?? {};
      const dnp = didNotPlayRows.has(row.id);

      const [line] = await tx<{ id: number }[]>`
        INSERT INTO stat_line
          (game_id, game_participant_id, scope, player_id, jersey, did_not_play,
           data_source_id, import_batch_id, entered_by_user_id)
        VALUES (${batch.gameId}, ${participant.id}, 'player', ${row.matchedPlayerId},
                ${row.parsedJersey}, ${dnp}, ${batch.dataSourceId}, ${batchId},
                ${userId})
        ON CONFLICT (game_id, player_id) WHERE player_id IS NOT NULL
        DO UPDATE SET jersey = EXCLUDED.jersey,
                      did_not_play = EXCLUDED.did_not_play,
                      data_source_id = EXCLUDED.data_source_id,
                      import_batch_id = EXCLUDED.import_batch_id,
                      entered_by_user_id = EXCLUDED.entered_by_user_id,
                      updated_at = now()
        RETURNING id::int`;
      linesWritten++;

      // Replaced, not merged: a corrected export may drop a column, and a
      // stale value left behind would be indistinguishable from a real one.
      await tx`DELETE FROM stat_value WHERE stat_line_id = ${line.id}`;

      const pairs = Object.entries(stats).filter(([k]) => defId.has(k));
      if (pairs.length > 0) {
        await tx`
          INSERT INTO stat_value ${tx(
            pairs.map(([k, v]) => ({
              stat_line_id: line.id,
              stat_definition_id: defId.get(k)!,
              value: v,
            })),
            "stat_line_id",
            "stat_definition_id",
            "value"
          )}`;
        valuesWritten += pairs.length;
      }
    }

    await tx`
      UPDATE import_batch
      SET status = 'committed', committed_at = now()
      WHERE id = ${batchId}`;

    // The book is in for this team's half of the game.
    await tx`
      UPDATE game SET box_score_status = 'partial', updated_at = now()
      WHERE id = ${batch.gameId} AND box_score_status = 'none'`;

    return { linesWritten, valuesWritten, rowsSkipped };
  });
}
