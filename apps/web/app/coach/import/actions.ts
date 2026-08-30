"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  commitImportBatch,
  createImportBatch,
  findBatchBySha,
  getImportBatchForUser,
  getImportRows,
  getJerseyAliases,
  getRosterForMatching,
  insertImportIssues,
  insertImportRows,
  listImportableTeams,
  rememberJerseyAlias,
  setRowMatch,
} from "@kyboxscore/db";
import {
  mapBaseballRow,
  matchRow,
  parseMaxPrepsTxt,
  summarize,
} from "@kyboxscore/parsers";
import { requireUser } from "../../../lib/auth";

export type UploadState = { error?: string };

// A box score export is a few kilobytes. Anything far larger is not one, and
// the whole file is retained in the database so a parser fix can be replayed.
const MAX_BYTES = 2 * 1024 * 1024;
const VENDORS = new Set(["hudl", "gamechanger", "other"]);

export async function uploadImport(
  _prev: UploadState,
  formData: FormData
): Promise<UploadState> {
  const user = await requireUser("/coach/import");

  const teamSeasonId = Number(formData.get("teamSeasonId"));
  const gameId = Number(formData.get("gameId"));
  const vendorRaw = String(formData.get("vendor") ?? "other");
  const vendor = VENDORS.has(vendorRaw) ? vendorRaw : "other";
  const file = formData.get("file");

  if (!Number.isInteger(teamSeasonId) || teamSeasonId <= 0) {
    return { error: "Choose a team." };
  }
  if (!Number.isInteger(gameId) || gameId <= 0) {
    return { error: "Choose the game this box score belongs to." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "That file is larger than 2 MB. Is it really a box score export?" };
  }

  // Authorization: the grant is what makes this team importable, not the id
  // arriving in the form.
  const allowed = await listImportableTeams(user.id);
  const team = allowed.find((t) => t.teamSeasonId === teamSeasonId);
  if (!team) return { error: "You do not have access to that team." };

  const text = await file.text();
  const sha256 = createHash("sha256").update(text).digest("hex");

  // The same bytes for the same team is the same import. Send them to it.
  const existing = await findBatchBySha(teamSeasonId, sha256);
  if (existing) redirect(`/coach/import/${existing.id}?duplicate=1`);

  const parsed = parseMaxPrepsTxt(text);
  if (!parsed.ok) {
    const first = parsed.issues.find((i) => i.severity === "error");
    return {
      error: first
        ? `That file could not be read: ${first.message}`
        : "That file could not be read as a MaxPreps export.",
    };
  }

  const [roster, aliasRows] = await Promise.all([
    getRosterForMatching(teamSeasonId),
    getJerseyAliases(teamSeasonId),
  ]);
  const aliases = new Map(aliasRows.map((a) => [a.rawName, a.playerId]));

  const mapped = parsed.rows.map(mapBaseballRow);
  const matches = mapped.map((m) => matchRow(m.jersey, roster, aliases));
  const summary = summarize(
    matches,
    mapped.map((m) => m.didNotPlay)
  );

  const batchId = await createImportBatch({
    dataSourceSlug: "coach-upload",
    uploadedById: user.id,
    teamSeasonId,
    gameId,
    vendor,
    format: "maxpreps_txt",
    originalFilename: file.name || null,
    byteSize: file.size,
    sha256,
    rawText: text,
    parsedSummary: {
      ...summary,
      columns: parsed.columns,
      vendorGameId: parsed.vendorGameId,
    },
    // Anything unmatched needs a human before this can be committed.
    status: summary.unmatched > 0 ? "awaiting_review" : "parsed",
  });

  await insertImportRows(
    batchId,
    mapped.map((m, i) => ({
      rowNumber: m.lineNumber,
      // Everything needed to commit without re-parsing, plus what the file
      // literally said, so a dispute can be traced to the source bytes.
      raw: {
        jersey: m.jersey,
        values: parsed.rows[i].values,
        stats: m.stats,
        didNotPlay: m.didNotPlay,
        unmapped: m.unmapped,
        line: parsed.rows[i].raw,
      },
      parsedJersey: m.jersey,
      matchedPlayerId: matches[i].playerId,
      matchConfidence: matches[i].confidence,
      matchMethod: matches[i].method,
    }))
  );

  const issues = [
    ...parsed.issues.map((i) => ({
      severity: i.severity,
      code: i.code,
      message: i.message,
      context: i.line === undefined ? undefined : { line: i.line },
    })),
    ...matches.flatMap((m, i) =>
      m.playerId === null
        ? [
            {
              severity: "warning",
              code: m.reason ?? "unmatched",
              message:
                m.reason === "ambiguous_jersey"
                  ? `Jersey ${mapped[i].jersey} is worn by more than one player on this roster.`
                  : m.reason === "blank_jersey"
                    ? "A row carried no jersey number."
                    : `No player on this roster wears jersey ${mapped[i].jersey}.`,
              context: { jersey: mapped[i].jersey },
            },
          ]
        : []
    ),
    // Unmapped columns are reported, never dropped silently.
    ...[...new Set(mapped.flatMap((m) => m.unmapped))].map((column) => ({
      severity: "info",
      code: "unmapped_column",
      message: `Column "${column}" has no stat definition yet and was not imported.`,
      context: { column },
    })),
  ];
  await insertImportIssues(batchId, issues);

  redirect(`/coach/import/${batchId}`);
}

export async function resolveRow(formData: FormData) {
  const batchId = Number(formData.get("batchId"));
  const rowId = Number(formData.get("rowId"));
  const raw = String(formData.get("playerId") ?? "");
  const playerId = raw === "" ? null : Number(raw);

  const user = await requireUser(`/coach/import/${batchId}`);
  const batch = await getImportBatchForUser(batchId, user.id);
  if (!batch) return;
  if (batch.status === "committed") return;

  await setRowMatch(batchId, rowId, playerId, user.id);

  // Remember the correction so the next upload matches it automatically.
  if (playerId !== null) {
    const rows = await getImportRows(batchId);
    const row = rows.find((r) => r.id === rowId);
    if (row?.parsedJersey) {
      await rememberJerseyAlias(
        batch.teamSeasonId,
        row.parsedJersey,
        playerId,
        batch.vendor,
        user.id
      );
    }
  }

  revalidatePath(`/coach/import/${batchId}`);
}

export type CommitState = { error?: string; committed?: string };

export async function commitBatch(
  _prev: CommitState,
  formData: FormData
): Promise<CommitState> {
  const batchId = Number(formData.get("batchId"));
  const user = await requireUser(`/coach/import/${batchId}`);

  const batch = await getImportBatchForUser(batchId, user.id);
  if (!batch) return { error: "That import could not be found." };
  if (batch.status === "committed") return { error: "This import is already committed." };
  if (batch.gameId === null) return { error: "This import has no game attached." };

  const rows = await getImportRows(batchId);
  const statsByRow = new Map<number, Record<string, number>>();
  const didNotPlay = new Set<number>();
  for (const r of rows) {
    const raw = r.raw as { stats?: Record<string, number>; didNotPlay?: boolean };
    statsByRow.set(r.id, raw.stats ?? {});
    if (raw.didNotPlay) didNotPlay.add(r.id);
  }

  try {
    const result = await commitImportBatch(batchId, user.id, statsByRow, didNotPlay);
    revalidatePath(`/coach/import/${batchId}`);
    return {
      committed:
        `${result.linesWritten} player line${result.linesWritten === 1 ? "" : "s"} written` +
        (result.rowsSkipped > 0 ? `, ${result.rowsSkipped} unmatched row skipped` : ""),
    };
  } catch (err) {
    // Surface the reason. "Never fail silently."
    return { error: err instanceof Error ? err.message : "The import could not be committed." };
  }
}
