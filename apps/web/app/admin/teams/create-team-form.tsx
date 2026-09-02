"use client";

import { useActionState } from "react";
import { createTeamAction, type TeamState } from "./actions";

const FIELD =
  "mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-fg";

export function CreateTeamForm({
  schools,
  sports,
}: {
  schools: { id: number; name: string }[];
  sports: { id: number; name: string; hasSeason: boolean }[];
}) {
  const [state, formAction, pending] = useActionState<TeamState, FormData>(
    createTeamAction,
    {}
  );

  return (
    <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-2">
      {state.error && (
        <p
          role="alert"
          className="sm:col-span-2 rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss"
        >
          {state.error}
        </p>
      )}

      <div className="sm:col-span-2">
        <label htmlFor="schoolId" className="block text-sm font-medium">School</label>
        <select id="schoolId" name="schoolId" required className={FIELD}>
          <option value="">Choose a school…</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="sportId" className="block text-sm font-medium">Sport</label>
        <select id="sportId" name="sportId" required className={FIELD}>
          <option value="">Choose a sport…</option>
          {sports.map((s) => (
            <option key={s.id} value={s.id} disabled={!s.hasSeason}>
              {s.name}
              {s.hasSeason ? "" : " (season not open)"}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="gender" className="block text-sm font-medium">Boys / girls</label>
        <select id="gender" name="gender" required defaultValue="" className={FIELD}>
          <option value="">Choose…</option>
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

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 w-full rounded-md bg-brand-fill px-4 font-medium text-on-brand disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create team"}
        </button>
        <p className="mt-2 text-xs text-fg-muted">
          The team is attached to the current season automatically. Creating a
          team that already exists opens it rather than duplicating it.
        </p>
      </div>
    </form>
  );
}
