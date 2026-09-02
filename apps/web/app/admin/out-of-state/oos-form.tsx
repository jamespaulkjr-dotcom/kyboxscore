"use client";

import { useActionState } from "react";
import { saveOutOfStateAction, type OosState } from "./actions";

const FIELD = "mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-fg";

export function OutOfStateForm({
  sportSeasonId,
  today,
  example,
}: {
  sportSeasonId: number;
  today: string;
  example: string;
}) {
  const [state, formAction, pending] = useActionState<OosState, FormData>(
    saveOutOfStateAction,
    {}
  );

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <input type="hidden" name="sportSeasonId" value={sportSeasonId} />

      {state.error && (
        <p role="alert" className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
          {state.error}
        </p>
      )}
      {state.saved && (
        <div className="rounded-md border border-win/40 bg-win/10 px-3 py-3 text-sm text-win">
          {state.saved.written} record{state.saved.written === 1 ? "" : "s"} saved.
          {state.saved.recomputed && " Records and ratings recomputed."}
          {state.saved.unmatched.length > 0 && (
            <span className="mt-1 block">
              Not recognised as an out-of-state opponent this season:{" "}
              {state.saved.unmatched.join(", ")}
            </span>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="sourceName" className="block text-sm font-medium">
            Where these came from
          </label>
          <input
            id="sourceName" name="sourceName" required
            placeholder="TSSAA published standings"
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="asOf" className="block text-sm font-medium">Accurate as of</label>
          <input id="asOf" name="asOf" type="date" required defaultValue={today} className={FIELD} />
        </div>
      </div>

      <div>
        <label htmlFor="sourceUrl" className="block text-sm font-medium">
          Link <span className="font-normal text-fg-muted">(optional)</span>
        </label>
        <input id="sourceUrl" name="sourceUrl" type="url" className={FIELD} />
      </div>

      <div>
        <label htmlFor="text" className="block text-sm font-medium">
          One school per line: name, wins, losses
        </label>
        <textarea
          id="text" name="text" rows={10} required
          placeholder={example}
          spellCheck={false}
          className="mt-1 w-full rounded-md border border-border bg-surface p-3 font-mono text-sm text-fg"
        />
        <p className="mt-1 text-xs text-fg-muted">
          Ties optional as a fourth column. Only schools Kentucky teams actually
          played are accepted. Everyone else is reported rather than created.
        </p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-md bg-brand-fill px-4 font-medium text-on-brand disabled:opacity-60"
      >
        {pending ? "Saving and recomputing…" : "Save and recompute ratings"}
      </button>
    </form>
  );
}
