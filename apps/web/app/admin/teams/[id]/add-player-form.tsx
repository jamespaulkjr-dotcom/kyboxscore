"use client";

import { useActionState, useRef, useEffect } from "react";
import { addPlayerAction, type RosterState } from "../actions";

const FIELD =
  "mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-fg";

export function AddPlayerForm({ teamId }: { teamId: number }) {
  const [state, formAction, pending] = useActionState<RosterState, FormData>(
    addPlayerAction,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  // Entering a roster is a dozen repetitions of the same shape. Clear the
  // fields and return focus so the next player can be typed without reaching
  // for the mouse.
  useEffect(() => {
    if (state.added) {
      formRef.current?.reset();
      firstRef.current?.focus();
    }
  }, [state.added]);

  return (
    <form ref={formRef} action={formAction} className="mt-3 grid gap-3 sm:grid-cols-4">
      {state.error && (
        <p role="alert" className="sm:col-span-4 rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
          {state.error}
        </p>
      )}
      {state.added && (
        <p role="status" className="sm:col-span-4 rounded-md border border-win/40 bg-win/10 px-3 py-2 text-sm text-win">
          {state.added}
        </p>
      )}

      <input type="hidden" name="teamId" value={teamId} />

      <div className="sm:col-span-1">
        <label htmlFor="jersey" className="block text-sm font-medium">Jersey</label>
        <input id="jersey" name="jersey" inputMode="numeric" maxLength={4}
               autoComplete="off" className={FIELD} placeholder="00" />
      </div>
      <div className="sm:col-span-1">
        <label htmlFor="firstName" className="block text-sm font-medium">First name</label>
        <input ref={firstRef} id="firstName" name="firstName" required
               autoComplete="off" className={FIELD} />
      </div>
      <div className="sm:col-span-1">
        <label htmlFor="lastName" className="block text-sm font-medium">Last name</label>
        <input id="lastName" name="lastName" required autoComplete="off" className={FIELD} />
      </div>
      <div className="sm:col-span-1">
        <label htmlFor="grade" className="block text-sm font-medium">Grade</label>
        <input id="grade" name="grade" inputMode="numeric" placeholder="9–12"
               autoComplete="off" className={FIELD} />
      </div>

      <div className="sm:col-span-4">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-md bg-brand-fill px-4 font-medium text-on-brand disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add player"}
        </button>
        <p className="mt-2 text-xs text-fg-muted">
          Name and jersey only. Do not enter addresses, birthdates or contact
          details — these are minors, and the schema deliberately has nowhere to
          put them.
        </p>
      </div>
    </form>
  );
}
