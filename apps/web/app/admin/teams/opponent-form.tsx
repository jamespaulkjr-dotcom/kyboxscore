"use client";

import { useActionState } from "react";
import { createOpponentAction, type OpponentState } from "./actions";

/**
 * Add a school from outside Kentucky so a game can be scheduled against it.
 *
 * Kentucky schools play across every border, and an opponent that was not in
 * the original seed could not be entered at all: Christian County beat
 * McKenzie of Tennessee 47-28 and there was nowhere to put it.
 */
export function OpponentForm({
  sports,
  states,
}: {
  sports: { id: number; name: string }[];
  states: readonly (readonly [string, string])[];
}) {
  const [state, submit, pending] = useActionState<OpponentState, FormData>(
    createOpponentAction,
    {}
  );

  return (
    <form action={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="block text-sm font-medium">School</span>
        <input
          name="name"
          required
          maxLength={80}
          placeholder="McKenzie"
          className="mt-1 min-h-12 w-full rounded-md border border-border bg-surface px-3"
        />
      </label>
      <label className="block">
        <span className="block text-sm font-medium">State</span>
        <select
          name="state"
          className="mt-1 min-h-12 w-full rounded-md border border-border bg-surface px-2"
        >
          {states.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="block text-sm font-medium">Sport</span>
        <select
          name="sportId"
          className="mt-1 min-h-12 w-full rounded-md border border-border bg-surface px-2"
        >
          {sports.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-sm font-medium">Gender</span>
          <select
            name="gender"
            className="mt-1 min-h-12 w-full rounded-md border border-border bg-surface px-2"
          >
            <option value="boys">Boys</option>
            <option value="girls">Girls</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-sm font-medium">Level</span>
          <select
            name="level"
            className="mt-1 min-h-12 w-full rounded-md border border-border bg-surface px-2"
          >
            <option value="varsity">Varsity</option>
            <option value="jv">JV</option>
            <option value="freshman">Freshman</option>
          </select>
        </label>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-loss sm:col-span-2">
          {state.error}
        </p>
      )}
      {state.added && !state.error && (
        <p role="status" className="text-sm text-win sm:col-span-2">
          {state.added} It can be picked as an opponent now.
        </p>
      )}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="min-h-12 rounded-lg border border-border px-4 font-medium disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add opponent"}
        </button>
      </div>
    </form>
  );
}
