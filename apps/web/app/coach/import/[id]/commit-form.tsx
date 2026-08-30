"use client";

import { useActionState } from "react";
import { commitBatch, type CommitState } from "../actions";

export function CommitForm({
  batchId,
  unmatched,
  committed,
}: {
  batchId: number;
  unmatched: number;
  committed: boolean;
}) {
  const [state, formAction, pending] = useActionState<CommitState, FormData>(
    commitBatch,
    {}
  );

  if (committed || state.committed) {
    return (
      <p className="mt-6 rounded-md border border-win/40 bg-win/10 px-3 py-2 text-sm text-win">
        {state.committed ?? "This import has been committed to the record book."}
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-6">
      <input type="hidden" name="batchId" value={batchId} />

      {state.error && (
        <p
          role="alert"
          className="mb-3 rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss"
        >
          {state.error}
        </p>
      )}

      {unmatched > 0 && (
        <p className="mb-3 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg-muted">
          {unmatched} row{unmatched === 1 ? "" : "s"} still {unmatched === 1 ? "has" : "have"} no
          player. Committing now will skip {unmatched === 1 ? "it" : "them"} — the
          rest will be saved and you can re-upload the corrected file later.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded-md bg-brand-fill px-4 font-medium text-on-brand disabled:opacity-60"
      >
        {pending ? "Saving…" : "Commit to the record book"}
      </button>
    </form>
  );
}
