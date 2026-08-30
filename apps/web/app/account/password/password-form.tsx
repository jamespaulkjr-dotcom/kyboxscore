"use client";

import { useActionState } from "react";
import { changePassword, type PasswordState } from "./actions";

const FIELD =
  "mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-fg";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState<PasswordState, FormData>(
    changePassword,
    {}
  );

  if (state.done) {
    return (
      <p className="mt-6 rounded-md border border-win/40 bg-win/10 px-3 py-3 text-sm text-win">
        Password changed. Every other signed-in session has been ended; this one
        is still good.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {state.error && (
        <p role="alert" className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="current" className="block text-sm font-medium">Current password</label>
        <input id="current" name="current" type="password" required
               autoComplete="current-password" className={FIELD} />
      </div>
      <div>
        <label htmlFor="next" className="block text-sm font-medium">New password</label>
        <input id="next" name="next" type="password" required minLength={12}
               autoComplete="new-password" className={FIELD} />
        <p className="mt-1 text-xs text-fg-muted">
          At least 12 characters. Length matters more than symbols — a short
          phrase you can remember beats something you will write down.
        </p>
      </div>
      <div>
        <label htmlFor="confirm" className="block text-sm font-medium">New password again</label>
        <input id="confirm" name="confirm" type="password" required minLength={12}
               autoComplete="new-password" className={FIELD} />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded-md bg-brand-fill px-4 font-medium text-on-brand disabled:opacity-60"
      >
        {pending ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
