"use client";

import { useActionState } from "react";
import { importRostersAction, type RosterState } from "./actions";

const FIELD = "mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-fg";

export function RosterImport({
  sports,
}: {
  sports: { id: number; name: string; hasSeason: boolean }[];
}) {
  const [state, formAction, pending] = useActionState<RosterState, FormData>(
    importRostersAction,
    {}
  );
  const s = state.summary;

  return (
    <form action={formAction} className="mt-5 space-y-4">
      {state.error && (
        <p role="alert" className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
          {state.error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="sportId" className="block text-sm font-medium">Sport</label>
          <select id="sportId" name="sportId" required className={FIELD}>
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
          <select id="gender" name="gender" defaultValue="boys" className={FIELD}>
            <option value="boys">Boys</option>
            <option value="girls">Girls</option>
            <option value="coed">Coed</option>
          </select>
        </div>
        <div>
          <label htmlFor="level" className="block text-sm font-medium">Level</label>
          <select id="level" name="level" defaultValue="varsity" className={FIELD}>
            <option value="varsity">Varsity</option>
            <option value="jv">JV</option>
            <option value="freshman">Freshman</option>
            <option value="middle_school">Middle school</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="file" className="block text-sm font-medium">
          Roster workbook (.xlsx), one tab per school
        </label>
        <input
          id="file" name="file" type="file" accept=".xlsx" required
          className="mt-1 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-brand-fill file:px-4 file:font-medium file:text-on-brand"
        />
        <p className="mt-1 text-xs text-fg-muted">
          Each tab needs <strong>First Name</strong> and <strong>Last Name</strong>{" "}
          columns; Jersey, Class, Position(s), Height Inches and Weight are used
          when present. Columns are found by name, so extra ones are ignored and
          a reordered sheet still works.
        </p>
      </div>

      {s && (
        <div className="rounded-lg border border-border bg-surface p-3 text-sm">
          <p>
            <strong>{s.players.toLocaleString()}</strong> players across{" "}
            <strong>{s.teams}</strong> tabs · {s.matchedTeams} schools matched
            {s.unmatched.length > 0 && ` · ${s.unmatched.length} not recognised`}
          </p>
          {s.withoutJersey > 0 && (
            <p className="mt-1 text-fg-muted">
              {s.withoutJersey} players have no jersey number. They import fine,
              but a box score cannot be matched to them — MaxPreps exports carry
              jerseys only, never names.
            </p>
          )}
          {s.skippedSheets.length > 0 && (
            <p className="mt-1 text-fg-muted">
              Skipped sheets: {s.skippedSheets.join(", ")}
            </p>
          )}
          {s.unmatched.length > 0 && (
            <p className="mt-1 text-loss">
              No such school: {s.unmatched.map((u) => `${u.name} (${u.players})`).join(", ")}
            </p>
          )}
        </div>
      )}

      {state.committed ? (
        <p role="status" className="rounded-md border border-win/40 bg-win/10 px-3 py-3 text-sm text-win">
          {state.committed.added.toLocaleString()} players added across{" "}
          {state.committed.teams} teams
          {state.committed.refreshed > 0 &&
            `, ${state.committed.refreshed.toLocaleString()} already on a roster and refreshed`}
          .
        </p>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={pending}
            className="min-h-11 rounded-md border border-border px-4 font-medium disabled:opacity-60"
          >
            {pending ? "Reading…" : "Preview"}
          </button>
          <button
            type="submit" name="commit" value="yes"
            disabled={pending}
            className="min-h-11 flex-1 rounded-md bg-brand-fill px-4 font-medium text-on-brand disabled:opacity-60"
          >
            {pending ? "Working…" : "Import rosters"}
          </button>
        </div>
      )}
      <p className="text-xs text-fg-muted">
        Safe to run twice: a player already on the roster under the same name
        and jersey is refreshed rather than duplicated.
      </p>
    </form>
  );
}
