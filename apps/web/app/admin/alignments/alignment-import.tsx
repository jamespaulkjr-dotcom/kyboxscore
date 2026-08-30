"use client";

import { useActionState } from "react";
import {
  commitAlignmentsAction,
  previewAlignmentsAction,
  type AlignState,
} from "./actions";

const FIELD =
  "mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-fg";

const EXAMPLE = `Class 1A
District 1- Ballard Memorial, Caverna, Fulton County, Russellville
District 2- Bethlehem, Campbellsville, Holy Cross (Louisville)

Class 2A
District 1- Caldwell County, Crittenden County, Fort Campbell`;

export function AlignmentImport({
  sports,
}: {
  sports: { id: number; name: string; hasSeason: boolean }[];
}) {
  const [state, formAction, pending] = useActionState<AlignState, FormData>(
    previewAlignmentsAction,
    {}
  );
  const [commitState, commitAction, committing] = useActionState<AlignState, FormData>(
    commitAlignmentsAction,
    {}
  );

  const rows = state.rows ?? [];
  const resolved = rows.filter((r) => r.match.schoolId);
  const unresolved = rows.filter((r) => !r.match.schoolId);
  const result = commitState.committed;

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
            Paste the alignment
          </label>
          <textarea
            id="text" name="text" rows={14} required
            defaultValue={state.text ?? ""}
            placeholder={EXAMPLE}
            spellCheck={false}
            className="mt-1 w-full rounded-md border border-border bg-surface p-3 font-mono text-sm text-fg"
          />
          <p className="mt-1 text-xs text-fg-muted">
            Paste the published block as it comes — class headings, district
            lines, and the prose in between. Cross-bracketing notes and
            withdrawal lists are recognised and skipped, not misread.
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

      {state.withdrawn && state.withdrawn.length > 0 && (
        <p className="mt-6 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg-muted">
          <strong>Withdrawn from play:</strong> {state.withdrawn.join(", ")}. These
          are not assigned to a district.
        </p>
      )}

      {rows.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-fg-muted">
            {resolved.length} assignment{resolved.length === 1 ? "" : "s"} ready
            {unresolved.length > 0 && ` · ${unresolved.length} need a school`}
          </h2>

          {unresolved.length > 0 && (
            <>
              <p className="mt-2 text-sm text-fg-muted">
                These are skipped, never guessed. Correct the spelling in the
                text above and preview again.
              </p>
              <ul className="mt-2 space-y-1">
                {unresolved.map((r, n) => (
                  <li key={n} className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm">
                    <span className="font-medium text-loss">“{r.match.input}”</span>
                    <span className="text-fg-muted">
                      {" "}— Class {r.classOrdinal}A District {r.districtNumber}
                      {r.match.candidates.length > 0 &&
                        ` · did you mean ${r.match.candidates.slice(0, 2).map((c) => c.name).join(", ")}?`}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[30rem] border-collapse bg-surface text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="px-3 py-2 font-semibold">Class</th>
                  <th scope="col" className="px-3 py-2 font-semibold">District</th>
                  <th scope="col" className="px-3 py-2 font-semibold">School</th>
                </tr>
              </thead>
              <tbody>
                {resolved.map((r, n) => (
                  <tr key={n} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 tabular-nums">{r.classOrdinal}A</td>
                    <td className="px-3 py-2 tabular-nums">{r.districtNumber}</td>
                    <td className="px-3 py-2">
                      {r.match.schoolName}
                      {r.match.method !== "exact" && (
                        <span className="ml-2 text-xs text-fg-muted">
                          from “{r.match.input}”
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result ? (
            <div className="mt-6 rounded-md border border-win/40 bg-win/10 px-3 py-3 text-sm text-win">
              <p>
                {result.assigned} assigned
                {result.unchanged > 0 && `, ${result.unchanged} already correct`}
                {result.teamsCreated > 0 && `, ${result.teamsCreated} team${result.teamsCreated === 1 ? "" : "s"} created`}
                .
              </p>
              {result.failed.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {result.failed.map((f, n) => (
                    <li key={n}>{f.schoolName || `line ${f.lineNumber}`}: {f.reason}</li>
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
                {committing ? "Assigning…" : `Assign ${resolved.length} school${resolved.length === 1 ? "" : "s"}`}
              </button>
              <p className="mt-2 text-xs text-fg-muted">
                Assignment lands on this season only. When KHSAA realigns, paste
                the new block against the new season — last season keeps its own
                districts, so past records and ratings stay correct.
              </p>
            </form>
          )}
        </>
      )}

      {state.issues && state.issues.filter((i) => i.severity === "error").length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Lines I could not read
          </h2>
          <ul className="mt-2 space-y-1">
            {state.issues.filter((i) => i.severity === "error").map((i) => (
              <li key={i.lineNumber} className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm">
                <span className="font-mono text-xs">line {i.lineNumber}</span> {i.message}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
