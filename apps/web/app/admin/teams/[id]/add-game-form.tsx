"use client";

import { useActionState, useRef, useEffect } from "react";
import { addGameAction, type GameState } from "../actions";

const FIELD =
  "mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-fg";

export function AddGameForm({
  teamId,
  opponents,
}: {
  teamId: number;
  opponents: { teamId: number; label: string }[];
}) {
  const [state, formAction, pending] = useActionState<GameState, FormData>(
    addGameAction,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.added) formRef.current?.reset();
  }, [state.added]);

  if (opponents.length === 0) {
    return (
      <p className="mt-3 rounded-lg border border-border bg-surface px-4 py-5 text-sm text-fg-muted">
        There is nobody to play. Another team in this sport and season has to
        exist before a game can be scheduled, so create the opponent first.
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="mt-3 grid gap-3 sm:grid-cols-2">
      {state.error && (
        <p role="alert" className="sm:col-span-2 rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
          {state.error}
        </p>
      )}
      {state.added && (
        <p role="status" className="sm:col-span-2 rounded-md border border-win/40 bg-win/10 px-3 py-2 text-sm text-win">
          {state.added}
        </p>
      )}

      <input type="hidden" name="teamId" value={teamId} />

      <div className="sm:col-span-2">
        <label htmlFor="opponentTeamId" className="block text-sm font-medium">Opponent</label>
        <select id="opponentTeamId" name="opponentTeamId" required className={FIELD}>
          <option value="">Choose an opponent…</option>
          {opponents.map((o) => (
            <option key={o.teamId} value={o.teamId}>{o.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="localDate" className="block text-sm font-medium">Date</label>
        <input id="localDate" name="localDate" type="date" required className={FIELD} />
      </div>

      <div>
        <label htmlFor="venue" className="block text-sm font-medium">Home or away</label>
        <select id="venue" name="venue" defaultValue="home" className={FIELD}>
          <option value="home">Home</option>
          <option value="away">Away</option>
        </select>
      </div>

      <div>
        <label htmlFor="status" className="block text-sm font-medium">Status</label>
        <select id="status" name="status" defaultValue="scheduled" className={FIELD}>
          <option value="scheduled">Scheduled</option>
          <option value="in_progress">In progress</option>
          <option value="final">Final</option>
          <option value="postponed">Postponed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="ourScore" className="block text-sm font-medium">Us</label>
          <input id="ourScore" name="ourScore" inputMode="numeric" className={FIELD} />
        </div>
        <div>
          <label htmlFor="theirScore" className="block text-sm font-medium">Them</label>
          <input id="theirScore" name="theirScore" inputMode="numeric" className={FIELD} />
        </div>
      </div>

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-md bg-brand-fill px-4 font-medium text-on-brand disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add game"}
        </button>
        <p className="mt-2 text-xs text-fg-muted">
          Scores are optional until the game is final. A box score is imported
          separately and attaches to the game.
        </p>
      </div>
    </form>
  );
}
