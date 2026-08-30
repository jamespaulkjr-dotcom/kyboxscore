"use client";

import { useActionState } from "react";
import { uploadImport, type UploadState } from "./actions";

export function UploadForm({
  teamSeasonId,
  games,
}: {
  teamSeasonId: number;
  games: { gameId: number; localDate: string; opponentName: string; isHome: boolean }[];
}) {
  const [state, formAction, pending] = useActionState<UploadState, FormData>(
    uploadImport,
    {}
  );

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <input type="hidden" name="teamSeasonId" value={teamSeasonId} />

      {state.error && (
        <p
          role="alert"
          className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss"
        >
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="gameId" className="block text-sm font-medium">
          Game
        </label>
        {games.length === 0 ? (
          <p className="mt-1 text-sm text-fg-muted">
            This team has no games on its schedule yet, so there is nothing to
            attach a box score to.
          </p>
        ) : (
          <select
            id="gameId"
            name="gameId"
            required
            className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-fg"
          >
            <option value="">Choose a game…</option>
            {games.map((g) => (
              <option key={g.gameId} value={g.gameId}>
                {g.localDate} {g.isHome ? "vs" : "at"} {g.opponentName}
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <label htmlFor="vendor" className="block text-sm font-medium">
          Where the file came from
        </label>
        <select
          id="vendor"
          name="vendor"
          defaultValue="gamechanger"
          className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-fg"
        >
          <option value="gamechanger">GameChanger</option>
          <option value="hudl">Hudl</option>
          <option value="other">Somewhere else</option>
        </select>
        <p className="mt-1 text-xs text-fg-muted">
          Both export the same MaxPreps format. This is only recorded for
          provenance.
        </p>
      </div>

      <div>
        <label htmlFor="file" className="block text-sm font-medium">
          Box score file (.txt)
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".txt,text/plain"
          required
          className="mt-1 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-brand-fill file:px-4 file:font-medium file:text-on-brand"
        />
      </div>

      <button
        type="submit"
        disabled={pending || games.length === 0}
        className="min-h-11 w-full rounded-md bg-brand-fill px-4 font-medium text-on-brand disabled:opacity-60"
      >
        {pending ? "Reading the file…" : "Upload and preview"}
      </button>

      <p className="text-xs text-fg-muted">
        Nothing is saved to the record book yet. You will see exactly what was
        read and can fix anything before it counts.
      </p>
    </form>
  );
}
