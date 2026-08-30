import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getImportBatchForUser,
  getImportIssues,
  getImportRows,
  getRosterForMatching,
  listSports,
} from "@kyboxscore/db";
import { outsToInnings } from "@kyboxscore/parsers";
import { SiteHeader } from "../../../components/site-header";
import { requireUser } from "../../../../lib/auth";
import { resolveRow } from "../actions";
import { CommitForm } from "./commit-form";

export const metadata: Metadata = {
  title: "Import preview",
  robots: { index: false, follow: false },
};

/** The batting line a coach expects to see, in the order a box score prints. */
const BATTING = ["ab", "r", "h", "rbi", "bb", "so", "hr"] as const;

const SEVERITY_STYLE: Record<string, string> = {
  error: "border-loss/40 bg-loss/10 text-loss",
  warning: "border-border bg-surface text-fg",
  info: "border-border bg-surface text-fg-muted",
};

export default async function Page(props: PageProps<"/coach/import/[id]">) {
  const { id } = await props.params;
  const { duplicate } = await props.searchParams;
  const batchId = Number(id);
  if (!Number.isInteger(batchId)) notFound();

  const user = await requireUser(`/coach/import/${batchId}`);
  const batch = await getImportBatchForUser(batchId, user.id);
  if (!batch) notFound();

  const [rows, issues, roster, sports] = await Promise.all([
    getImportRows(batchId),
    getImportIssues(batchId),
    getRosterForMatching(batch.teamSeasonId),
    listSports(),
  ]);

  const unmatched = rows.filter((r) => r.matchedPlayerId === null).length;
  const committed = batch.status === "committed";

  return (
    <>
      <SiteHeader sports={sports} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <Link href="/coach/import" className="text-sm text-link underline">
          ← Import another file
        </Link>

        <h1 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
          {batch.schoolName}
          {batch.opponentName ? ` vs ${batch.opponentName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          {batch.gameDate ?? "no date"} · {batch.originalFilename ?? "uploaded file"}
          {batch.vendor ? ` · ${batch.vendor}` : ""} · {batch.status}
        </p>

        {duplicate === "1" && (
          <p className="mt-4 rounded-md border border-border bg-surface px-3 py-2 text-sm">
            You have uploaded this exact file before. This is the original
            import rather than a second copy of it.
          </p>
        )}

        <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
          {[
            ["Rows", rows.length],
            ["Matched", rows.length - unmatched],
            ["Needs a player", unmatched],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-border bg-surface py-3">
              <dt className="text-xs uppercase tracking-wide text-fg-muted">{label}</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        {issues.length > 0 && (
          <>
            <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-fg-muted">
              What the importer noticed
            </h2>
            <ul className="mt-2 space-y-2">
              {issues.map((i, n) => (
                <li
                  key={n}
                  className={`rounded-md border px-3 py-2 text-sm ${SEVERITY_STYLE[i.severity] ?? SEVERITY_STYLE.info}`}
                >
                  {i.message}
                </li>
              ))}
            </ul>
          </>
        )}

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Every row, exactly as the file had it
        </h2>

        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[36rem] border-collapse bg-surface text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="px-3 py-2 font-semibold">#</th>
                <th scope="col" className="px-3 py-2 font-semibold">Player</th>
                {BATTING.map((k) => (
                  <th key={k} scope="col" className="px-2 py-2 text-right font-semibold uppercase">
                    {k}
                  </th>
                ))}
                <th scope="col" className="px-2 py-2 text-right font-semibold">IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const raw = r.raw as {
                  stats?: Record<string, number>;
                  didNotPlay?: boolean;
                };
                const stats = raw.stats ?? {};
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 align-top">
                    <td className="px-3 py-2 font-mono tabular-nums">
                      {r.parsedJersey || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {r.matchedPlayerId ? (
                        <>
                          <span className="font-medium">{r.playerName}</span>
                          {r.matchMethod === "manual" && (
                            <span className="ml-2 text-xs text-fg-muted">you chose this</span>
                          )}
                        </>
                      ) : committed ? (
                        <span className="text-fg-muted">skipped, no player</span>
                      ) : (
                        // Resolution is a plain form per row: no JavaScript
                        // required, and each choice is independently saved.
                        <form action={resolveRow} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="batchId" value={batchId} />
                          <input type="hidden" name="rowId" value={r.id} />
                          <label className="sr-only" htmlFor={`p-${r.id}`}>
                            Player for jersey {r.parsedJersey}
                          </label>
                          <select
                            id={`p-${r.id}`}
                            name="playerId"
                            defaultValue=""
                            className="min-h-9 rounded-md border border-border-strong bg-surface-raised px-2 text-sm"
                          >
                            <option value="">Who is this?</option>
                            {roster.map((p) => (
                              <option key={p.playerId} value={p.playerId}>
                                {p.jersey ? `#${p.jersey} ` : ""}
                                {p.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="min-h-9 rounded-md border border-border px-3 text-sm font-medium"
                          >
                            Save
                          </button>
                        </form>
                      )}
                      {raw.didNotPlay && (
                        <span className="ml-2 text-xs text-fg-muted">did not play</span>
                      )}
                    </td>
                    {BATTING.map((k) => (
                      <td key={k} className="px-2 py-2 text-right tabular-nums">
                        {stats[k] ?? "—"}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right tabular-nums">
                      {stats.ip_outs === undefined ? "—" : outsToInnings(stats.ip_outs)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <CommitForm batchId={batchId} unmatched={unmatched} committed={committed} />
      </main>
    </>
  );
}
