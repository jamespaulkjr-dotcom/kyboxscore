"use client";

import { useActionState } from "react";
import { setZoneAction, type TzState } from "./actions";

export function TimeZoneForm() {
  const [state, formAction, pending] = useActionState<TzState, FormData>(
    setZoneAction,
    {}
  );

  return (
    <form action={formAction} className="mt-4 space-y-3">
      {state.error && (
        <p role="alert" className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
          {state.error}
        </p>
      )}
      {state.moved !== undefined && (
        <p role="status" className="rounded-md border border-win/40 bg-win/10 px-3 py-2 text-sm text-win">
          {state.moved} school{state.moved === 1 ? "" : "s"} moved to{" "}
          {state.zone === "America/Chicago" ? "Central" : "Eastern"}.
        </p>
      )}

      <div>
        <label htmlFor="zone" className="block text-sm font-medium">Move to</label>
        <select
          id="zone" name="zone" defaultValue="America/Chicago"
          className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-fg sm:w-64"
        >
          <option value="America/Chicago">Central</option>
          <option value="America/New_York">Eastern</option>
        </select>
      </div>

      <div>
        <label htmlFor="text" className="block text-sm font-medium">
          Counties, one per line
        </label>
        <textarea
          id="text" name="text" rows={10} required spellCheck={false}
          placeholder={"McCracken\nDaviess\nWarren\nChristian\n\nOr a school name for a town that states no county:\nPaducah Tilghman"}
          className="mt-1 w-full rounded-md border border-border bg-surface p-3 font-mono text-sm text-fg"
        />
        <p className="mt-1 text-xs text-fg-muted">
          &ldquo;County&rdquo; on the end is optional. Anything that is not a
          county is tried as a school name, so the town schools can go in the
          same list.
        </p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-md bg-brand-fill px-4 font-medium text-on-brand disabled:opacity-60"
      >
        {pending ? "Moving…" : "Apply"}
      </button>
    </form>
  );
}
