"use client";

import { useActionState } from "react";
import {
  commitScheduleAction,
  previewScheduleAction,
  type ScheduleState,
} from "./actions";

const FIELD =
  "mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-fg";

const EXAMPLE = `2026-08-21, John Hardin, Central Hardin
2026-08-28, Male, Trinity (Louisville), 21, 14
8/21/2026 | Belfry | Pikeville`;

export function ScheduleImport({
  sports,
}: {
  sports: { id: number; name: string; hasSeason: boolean }[];
}) {
  const [state, formAction, pending] = useActionState<ScheduleState, FormData>(
    previewScheduleAction,
    {}
  );
  const [commitState, commitAction, committing] = useActionState<ScheduleState, FormData>(
    commitScheduleAction,
    {}
  );

  const result = commitState.committed;
  const rows = state.rows ?? [];
  const resolved = rows.filter((r) => r.home.schoolId && r.away.schoolId);
  const unresolved = rows.filter((r) => !r.home.schoolId || !r.away.schoolId);

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
              {sports.map((s) => (
                <option key={s.id} value={s.id} disabled={!s.hasSeason}>
                  {s.name}{s.hasSeason ? "" : " — season not open"}
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
          <label htmlFor="text" className="block text-sm font-medium">
            Paste the schedule — one game per line, home team first
          </label>
          <textarea
            id="text"
            name="text"
            rows={12}
            required
            defaultValue={state.text ?? ""}
            placeholder={EXAMPLE}
            spellCheck={false}
            className="mt-1 w-full rounded-md border border-border bg-surface p-3 font-mono text-sm text-fg"
          />
          <p className="mt-1 text-xs text-fg-muted">
            Separate with commas, tabs or pipes. Dates as 2026-08-21 or
            8/21/2026. Scores optional, both or neither. Lines starting with #
            are ignored.
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

      {state.issues && state.issues.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Lines I could not read
          </h2>
          <ul className="mt-2 space-y-1">
            {state.issues.map((i) => (
              <li key={i.lineNumber} className="rounded-md border border-border bg-surface px-3 py-2 text-sm">
                <span className="font-mono text-xs text-fg-muted">line {i.lineNumber}</span>{" "}
                {i.message}
                <span className="block font-mono text-xs text-fg-muted">{i.raw}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {rows.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-fg-muted">
            {resolved.length} game{resolved.length === 1 ? "" : "s"} ready
            {unresolved.length > 0 && ` · ${unresolved.length} need a school`}
          </h2>

          <div className="mt-2 overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[34rem] border-collapse bg-surface text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="px-3 py-2 font-semibold">Date</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Home</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Away</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Score</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.lineNumber} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{r.date}</td>
                    {[r.home, r.away].map((m, i) => (
                      <td key={i} className="px-3 py-2">
                        {m.schoolId ? (
                          <>
                            <span className={m.method === "exact" ? "" : "text-fg"}>
                              {m.schoolName}
                            </span>
                            {m.method !== "exact" && (
                              <span className="block text-xs text-fg-muted">
                                matched “{m.input}”
                                {m.confidence !== null && m.method === "similar"
                                  ? ` · ${Math.round(m.confidence * 100)}%`
                                  : ""}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="text-loss">“{m.input}” — no match</span>
                            {m.candidates.length > 0 && (
                              <span className="block text-xs text-fg-muted">
                                did you mean {m.candidates.slice(0, 2).map((c) => c.name).join(", ")}?
                              </span>
                            )}
                          </>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.homeScore === null ? "—" : `${r.homeScore}–${r.awayScore}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {unresolved.length > 0 && (
            <p className="mt-3 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg-muted">
              Games with an unmatched school are skipped, never guessed. Fix the
              spelling in the text above and preview again — or the school may
              genuinely not be in the database.
            </p>
          )}

          {result ? (
            <div className="mt-6 rounded-md border border-win/40 bg-win/10 px-3 py-3 text-sm text-win">
              <p>
                {result.created} game{result.created === 1 ? "" : "s"} created
                {result.duplicates > 0 && `, ${result.duplicates} already on the schedule`}
                {result.teamsCreated > 0 && `, ${result.teamsCreated} team${result.teamsCreated === 1 ? "" : "s"} created`}
                .
              </p>
              {result.failed.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {result.failed.map((f) => (
                    <li key={f.lineNumber}>line {f.lineNumber}: {f.reason}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <form action={commitAction} className="mt-6">
              <input type="hidden" name="text" value={state.text ?? ""} />
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
                disabled={committing || resolved.length === 0}
                className="min-h-11 w-full rounded-md bg-brand-fill px-4 font-medium text-on-brand disabled:opacity-60"
              >
                {committing
                  ? "Creating…"
                  : `Create ${resolved.length} game${resolved.length === 1 ? "" : "s"}`}
              </button>
              <p className="mt-2 text-xs text-fg-muted">
                Teams are created for any school that does not have one in this
                sport yet. Re-pasting a corrected block is safe: a game already
                on the schedule is recognised, not duplicated.
              </p>
            </form>
          )}
        </>
      )}
    </>
  );
}
