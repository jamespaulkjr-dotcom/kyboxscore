"use client";

import { useActionState } from "react";
import { commitSheetAction, previewSheetAction, type SheetState } from "./actions";

const FIELD = "mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-fg";

export function SheetImport({
  sports,
}: {
  sports: { id: number; name: string; hasSeason: boolean }[];
}) {
  const [state, formAction, pending] = useActionState<SheetState, FormData>(
    previewSheetAction,
    {}
  );
  const [commitState, commitAction, committing] = useActionState<SheetState, FormData>(
    commitSheetAction,
    {}
  );

  const s = state.summary;
  const done = commitState.committed;

  return (
    <>
      <form action={formAction} className="mt-5 space-y-4">
        {state.error && (
          <p role="alert" className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
            {state.error}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="sportId" className="block text-sm font-medium">Sport</label>
            <select id="sportId" name="sportId" required defaultValue={state.sportId ?? ""} className={FIELD}>
              <option value="">Choose…</option>
              {sports.map((sp) => (
                <option key={sp.id} value={sp.id} disabled={!sp.hasSeason}>
                  {sp.name}{sp.hasSeason ? "" : " — season not open"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="gender" className="block text-sm font-medium">Boys / girls</label>
            <select id="gender" name="gender" defaultValue={state.gender ?? "boys"} className={FIELD}>
              <option value="boys">Boys</option>
              <option value="girls">Girls</option>
              <option value="coed">Coed</option>
            </select>
          </div>
          <div>
            <label htmlFor="level" className="block text-sm font-medium">Level</label>
            <select id="level" name="level" defaultValue={state.level ?? "varsity"} className={FIELD}>
              <option value="varsity">Varsity</option>
              <option value="jv">JV</option>
              <option value="freshman">Freshman</option>
              <option value="middle_school">Middle school</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="file" className="block text-sm font-medium">Schedule CSV</label>
          <input
            id="file" name="file" type="file" accept=".csv,text/csv" required
            className="mt-1 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-brand-fill file:px-4 file:font-medium file:text-on-brand"
          />
          <p className="mt-1 text-xs text-fg-muted">
            One row per team per game. Columns are found by name — School, Date,
            Home/Away, Opponent, Result, School Score, Opponent Score, Game
            Status, Game Title — so a spreadsheet that gains or loses a column
            still imports. Save the games tab as CSV from Excel.
          </p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-md bg-brand-fill px-4 font-medium text-on-brand disabled:opacity-60"
        >
          {pending ? "Reading…" : "Preview"}
        </button>
      </form>

      {s && (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-fg-muted">
            {state.fileName}
          </h2>
          <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Ready to import", s.ready],
              ["With a result", s.withScores],
              ["Scrimmages", s.scrimmages],
              ["Canceled", s.canceled],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-border bg-surface py-3 text-center">
                <dt className="text-xs uppercase tracking-wide text-fg-muted">{label}</dt>
                <dd className="mt-1 text-2xl font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          {s.unmatched.length > 0 && (
            <>
              <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-fg-muted">
                {s.unmatched.length} school{s.unmatched.length === 1 ? "" : "s"} not recognised
              </h3>
              <p className="mt-1 text-sm text-fg-muted">
                Games involving these are skipped, never guessed. Most will be
                out-of-state opponents, which are not in the Kentucky school list.
              </p>
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border bg-surface p-2 text-sm">
                {s.unmatched.map((u) => (
                  <li key={u.name} className="px-2 py-1">
                    <span className="font-medium">{u.name}</span>
                    <span className="text-fg-muted"> · {u.games} game{u.games === 1 ? "" : "s"}</span>
                    {u.candidates.length > 0 && (
                      <span className="block text-xs text-fg-muted">
                        did you mean {u.candidates.join(", ")}?
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {s.issues.length > 0 && (
            <>
              <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-fg-muted">
                Rows I could not read
              </h3>
              <ul className="mt-2 space-y-1 text-sm">
                {s.issues.map((i) => (
                  <li key={i.rowNumber} className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2">
                    <span className="font-mono text-xs">row {i.rowNumber}</span> {i.message}
                  </li>
                ))}
              </ul>
            </>
          )}

          {done ? (
            <div className="mt-6 rounded-md border border-win/40 bg-win/10 px-3 py-3 text-sm text-win">
              {done.created} game{done.created === 1 ? "" : "s"} created
              {done.duplicates > 0 && `, ${done.duplicates} already on the schedule`}
              {done.teamsCreated > 0 && `, ${done.teamsCreated} team${done.teamsCreated === 1 ? "" : "s"} created`}
              {done.failed > 0 && `, ${done.failed} failed`}.
              <span className="mt-1 block">
                Records and ratings have been rebuilt for every team touched.
              </span>
            </div>
          ) : (
            <form action={commitAction} className="mt-6">
              <input type="hidden" name="csv" value={state.csv ?? ""} />
              <input type="hidden" name="sportId" value={state.sportId ?? ""} />
              <input type="hidden" name="gender" value={state.gender ?? "boys"} />
              <input type="hidden" name="level" value={state.level ?? "varsity"} />
              {commitState.error && (
                <p role="alert" className="mb-3 rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
                  {commitState.error}
                </p>
              )}
              <button
                type="submit"
                disabled={committing || s.ready === 0}
                className="min-h-11 w-full rounded-md bg-brand-fill px-4 font-medium text-on-brand disabled:opacity-60"
              >
                {committing ? "Importing…" : `Import ${s.ready} games`}
              </button>
              <p className="mt-2 text-xs text-fg-muted">
                Every game appears twice in an export like this, once on each
                team&rsquo;s rows. The second copy is recognised, not duplicated.
              </p>
            </form>
          )}
        </>
      )}
    </>
  );
}
