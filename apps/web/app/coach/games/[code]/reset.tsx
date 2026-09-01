"use client";

import { useActionState } from "react";
import { resetGameAction, type ScoreState } from "../actions";

/**
 * Put a game back to unplayed. Admin only, and deliberately awkward.
 *
 * It sits at the bottom, under a rule, in loss red, and asks you to type the
 * game's short code. Everything else on this page is built to be tapped
 * quickly in the dark; this one thing should take a moment's thought, because
 * it is the only control here that destroys something.
 */
export function ResetGame({ code }: { code: string }) {
  const [state, submit, pending] = useActionState<ScoreState, FormData>(
    resetGameAction,
    {}
  );

  return (
    <section className="mt-12 border-t border-border pt-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-loss">
        Reset this game
      </h2>
      <p className="mt-1 max-w-prose text-sm text-fg-muted">
        Deletes every scoring play and quarter score, clears both scores and
        puts the game back to scheduled. Use it after testing on a real
        fixture. It cannot be undone, and it will not touch a game that already
        has an imported box score.
      </p>

      <form action={submit} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="code" value={code} />
        <label>
          <span className="block text-sm font-medium">
            Type <code className="font-mono">{code}</code> to confirm
          </span>
          <input
            name="confirm"
            required
            autoComplete="off"
            spellCheck={false}
            className="mt-1 min-h-12 w-40 rounded-md border border-border bg-surface px-3 font-mono"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="min-h-12 rounded-lg border border-loss px-4 font-medium text-loss disabled:opacity-60"
        >
          {pending ? "Resetting…" : "Reset game"}
        </button>
      </form>

      {state.error && (
        <p role="alert" className="mt-2 text-sm text-loss">
          {state.error}
        </p>
      )}
      {state.note && (
        <p role="status" className="mt-2 text-sm text-win">
          {state.note}
        </p>
      )}
    </section>
  );
}
