"use client";

import { useActionState, useEffect, useOptimistic, useRef, useState } from "react";
import type { GameRosterPlayer, ScoringGame, ScoringPlay } from "@kyboxscore/db";
import {
  addPlayAction,
  finalScoreAction,
  startGameAction,
  undoPlayAction,
  updatePlayAction,
  type ScoreState,
} from "../coach/games/actions";

/** Mirrors FOOTBALL_PLAYS on the server, which is what actually decides points. */
const PLAYS = [
  {
    key: "td",
    label: "TD",
    points: 6,
    methods: [
      ["rush", "Rush", false],
      ["pass", "Pass", true],
      ["kick_return", "Kickoff return", false],
      ["punt_return", "Punt return", false],
      ["interception", "Interception return", false],
      ["fumble", "Fumble return", false],
      ["blocked_kick", "Blocked kick return", false],
    ],
  },
  { key: "pat", label: "PAT", points: 1, methods: [["kick", "Kick", false]] },
  {
    key: "two",
    label: "2PT",
    points: 2,
    methods: [
      ["rush", "Rush", false],
      ["pass", "Pass", true],
    ],
  },
  { key: "fg", label: "FG", points: 3, methods: [["kick", "Kick", false]] },
  { key: "safety", label: "Safety", points: 2, methods: [] },
] as const satisfies readonly {
  key: string;
  label: string;
  points: number;
  methods: readonly (readonly [string, string, boolean])[];
}[];

const PERIODS = [1, 2, 3, 4, 5] as const;
const periodLabel = (p: number) => (p > 4 ? `OT${p - 4}` : `Q${p}`);

/**
 * The scoring console.
 *
 * Written for one person: somebody on a phone, in the dark, in a press box
 * with two bars of signal, who is also watching the game. That drives every
 * decision here - big targets, the score enormous, one tap per play, an undo
 * that is always in reach, and an optimistic update so a slow round trip never
 * makes them wonder whether the tap registered and press it twice.
 *
 * Every form is a real form with real submit buttons, so it still works with
 * JavaScript off. The interactivity is a layer on top, not the mechanism.
 */
export function ScoringConsole({
  game,
  scorerLabel,
  roster,
}: {
  game: ScoringGame;
  scorerLabel: string;
  roster: GameRosterPlayer[];
}) {
  const [period, setPeriod] = useState<number>(
    Math.min(Math.max(game.periodsPlayed ?? 1, 1), 5)
  );

  const [addState, addPlay, addPending] = useActionState<ScoreState, FormData>(
    addPlayAction,
    {}
  );
  const [undoState, undo, undoPending] = useActionState<ScoreState, FormData>(
    undoPlayAction,
    {}
  );
  const [startState, start, startPending] = useActionState<ScoreState, FormData>(
    startGameAction,
    {}
  );

  // The score the server last told us, plus whatever taps have not landed yet.
  const [optimistic, addOptimistic] = useOptimistic(
    { home: game.home.score ?? 0, away: game.away.score ?? 0 },
    (score, d: { side: "home" | "away"; points: number }) => ({
      ...score,
      [d.side]: score[d.side] + d.points,
    })
  );

  const error = addState.error ?? undoState.error ?? startState.error;
  const started = game.status === "in_progress" || game.status === "final";

  return (
    <div>
      <p className="text-sm text-fg-muted">
        Scoring as <span className="font-medium text-fg">{scorerLabel}</span>
      </p>

      {/* The score, as large as it goes. This is the only thing on the page
          that has to be readable at arm's length. */}
      <div className="mt-3 overflow-hidden rounded-lg border border-border bg-surface">
        {(["away", "home"] as const).map((side) => (
          <div
            key={side}
            className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">
                {game[side].shortName ?? game[side].schoolName}
              </span>
              <span className="text-xs uppercase tracking-wide text-fg-muted">
                {side === "home" ? "Home" : "Away"}
              </span>
            </span>
            <span className="tabular text-4xl font-bold leading-none">
              {optimistic[side]}
            </span>
          </div>
        ))}
      </div>

      <TypeTheScore game={game} />

      {error && (
        <p role="alert" className="mt-3 rounded-md border border-loss px-3 py-2 text-sm text-loss">
          {error}
        </p>
      )}

      {game.status === "final" ? (
        <p className="mt-4 rounded-md border border-border bg-surface px-4 py-3 text-sm">
          This game is posted as final. Correcting it below will update the
          public score straight away.
        </p>
      ) : !started ? (
        <form action={start} className="mt-4">
          <input type="hidden" name="code" value={game.shortCode} />
          <button
            type="submit"
            disabled={startPending}
            className="min-h-14 w-full rounded-lg bg-brand-fill px-4 text-lg font-semibold text-on-brand disabled:opacity-60"
          >
            {startPending ? "Starting…" : "Start scoring"}
          </button>
          <p className="mt-2 text-sm text-fg-muted">
            This puts the game on the public scoreboard as live at 0–0. You can
            also just tap a score below and it will start itself.
          </p>
        </form>
      ) : null}

      {/* Quarter. Duplicated into each form as a hidden field so the whole
          console still submits correctly with JavaScript off. */}
      <fieldset className="mt-5">
        <legend className="text-sm font-medium">Quarter</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className={`min-h-12 min-w-14 rounded-lg border px-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link ${
                period === p
                  ? "border-accent bg-accent-fill text-on-accent"
                  : "border-border bg-surface text-fg"
              }`}
            >
              {periodLabel(p)}
            </button>
          ))}
        </div>
      </fieldset>

      {(["away", "home"] as const).map((side) => (
        <form key={side} action={addPlay} className="mt-5">
          <input type="hidden" name="code" value={game.shortCode} />
          <input type="hidden" name="side" value={side} />
          {/* A no-JS visitor gets a real control instead of the pills above. */}
          <noscript>
            <label className="text-sm">
              Quarter{" "}
              <select name="period" defaultValue={period} className="min-h-11 rounded-md border border-border bg-surface px-2">
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {periodLabel(p)}
                  </option>
                ))}
              </select>
            </label>
          </noscript>
          <input type="hidden" name="period" value={period} />

          <h2 className="text-sm font-semibold">
            {game[side].shortName ?? game[side].schoolName} scored
          </h2>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {PLAYS.map((p) => (
              <button
                key={p.key}
                type="submit"
                name="play"
                value={p.key}
                disabled={addPending}
                onClick={() => addOptimistic({ side, points: p.points })}
                className="flex min-h-16 flex-col items-center justify-center rounded-lg border border-border bg-surface font-semibold hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link disabled:opacity-60"
              >
                <span>{p.label}</span>
                <span className="text-xs font-normal text-fg-muted">
                  +{p.points}
                </span>
              </button>
            ))}
          </div>
        </form>
      ))}

      <form action={undo} className="mt-5">
        <input type="hidden" name="code" value={game.shortCode} />
        <button
          type="submit"
          disabled={undoPending || game.plays.length === 0}
          className="min-h-12 w-full rounded-lg border border-border px-4 font-medium disabled:opacity-50"
        >
          {undoPending ? "Undoing…" : "Undo last play"}
        </button>
      </form>

      <PlayList game={game} roster={roster} />
    </div>
  );
}

function PlayList({
  game,
  roster,
}: {
  game: ScoringGame;
  roster: GameRosterPlayer[];
}) {
  if (game.plays.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
        Scoring plays
      </h2>
      <p className="mt-1 text-sm text-fg-muted">
        Open one to say who scored and how. None of it is required — the score
        is already right without it.
      </p>
      <ol className="mt-2 space-y-2">
        {[...game.plays].reverse().map((play) => (
          <PlayDetail
            key={play.id}
            play={play}
            game={game}
            roster={roster.filter((r) => r.participantId === play.participantId)}
          />
        ))}
      </ol>
    </section>
  );
}

/**
 * One scoring play, and the detail behind it.
 *
 * A native <details>, so the disclosure needs no JavaScript and the form
 * inside submits on its own if the client bundle never arrives.
 */
function PlayDetail({
  play,
  game,
  roster,
}: {
  play: ScoringPlay;
  game: ScoringGame;
  roster: GameRosterPlayer[];
}) {
  const [state, submit, pending] = useActionState<ScoreState, FormData>(
    updatePlayAction,
    {}
  );

  const kind = PLAYS.find((p) => p.key === play.playKey);
  const teamName =
    play.participantId === game.home.participantId
      ? (game.home.shortName ?? game.home.schoolName)
      : (game.away.shortName ?? game.away.schoolName);
  const named = (p: GameRosterPlayer) =>
    p.jersey ? `#${p.jersey} ${p.name}` : p.name;

  return (
    <li className="overflow-hidden rounded-lg border border-border bg-surface">
      <details>
        <summary className="flex cursor-pointer list-none items-baseline gap-3 px-4 py-2.5 text-sm">
          <span className="tabular w-16 shrink-0 text-fg-muted">
            {periodLabel(play.periodNumber)}
            {play.clock ? ` ${play.clock}` : ""}
          </span>
          <span className="min-w-0 flex-1">
            <span className="font-medium">{teamName}</span>{" "}
            <span className="text-fg-muted">{play.description}</span>
          </span>
          <span className="tabular shrink-0 font-semibold">+{play.points}</span>
          <span aria-hidden className="shrink-0 text-fg-muted">
            ▾
          </span>
        </summary>

        <form action={submit} className="border-t border-border px-4 py-3">
          <input type="hidden" name="code" value={game.shortCode} />
          <input type="hidden" name="playId" value={play.id} />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="block text-sm font-medium">Scored by</span>
              <select
                name="playerId"
                defaultValue={play.playerId ?? ""}
                className="mt-1 min-h-12 w-full rounded-md border border-border bg-bg px-2"
              >
                <option value="">Nobody in particular</option>
                {roster.map((p) => (
                  <option key={p.playerId} value={p.playerId}>
                    {named(p)}
                  </option>
                ))}
              </select>
            </label>

            {kind && kind.methods.length > 0 && (
              <label className="block">
                <span className="block text-sm font-medium">How</span>
                <select
                  name="method"
                  defaultValue={play.method ?? ""}
                  className="mt-1 min-h-12 w-full rounded-md border border-border bg-bg px-2"
                >
                  <option value="">Not said</option>
                  {kind.methods.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {kind?.methods.some(([, , passer]) => passer) && (
              <label className="block">
                <span className="block text-sm font-medium">
                  Thrown by{" "}
                  <span className="font-normal text-fg-muted">(if a pass)</span>
                </span>
                <select
                  name="assistPlayerId"
                  defaultValue={play.assistPlayerId ?? ""}
                  className="mt-1 min-h-12 w-full rounded-md border border-border bg-bg px-2"
                >
                  <option value="">Nobody</option>
                  {roster.map((p) => (
                    <option key={p.playerId} value={p.playerId}>
                      {named(p)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="flex gap-3">
              <label className="block">
                <span className="block text-sm font-medium">Quarter</span>
                <select
                  name="period"
                  defaultValue={play.periodNumber}
                  className="mt-1 min-h-12 rounded-md border border-border bg-bg px-2"
                >
                  {PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {periodLabel(p)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-sm font-medium">
                  Clock{" "}
                  <span className="font-normal text-fg-muted">(optional)</span>
                </span>
                <input
                  name="clock"
                  inputMode="numeric"
                  placeholder="4:12"
                  defaultValue={play.clock ?? ""}
                  className="tabular mt-1 min-h-12 w-24 rounded-md border border-border bg-bg px-3"
                />
              </label>
            </div>
          </div>

          {state.error && (
            <p role="alert" className="mt-2 text-sm text-loss">
              {state.error}
            </p>
          )}
          {state.note && !state.error && (
            <p role="status" className="mt-2 text-sm text-win">
              {state.note}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-3 min-h-12 rounded-lg border border-border px-4 font-medium disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save detail"}
          </button>
        </form>
      </details>
    </li>
  );
}

/**
 * Type the score in directly.
 *
 * Sits with the score rather than at the bottom of the page, because it is not
 * only an end-of-game action: somebody picking a game up at half time types
 * what is on the scoreboard and starts tapping from there. The server keeps
 * the difference as an adjustment, so a later tap adds to what was typed
 * instead of overwriting it.
 */
function TypeTheScore({ game }: { game: ScoringGame }) {
  const [state, submit, pending] = useActionState<ScoreState, FormData>(
    finalScoreAction,
    {}
  );
  const [saved, setSaved] = useState(false);
  const seen = useRef(state);

  useEffect(() => {
    if (state !== seen.current) {
      seen.current = state;
      if (state.ok) setSaved(true);
    }
  }, [state]);

  return (
    <details className="mt-2 overflow-hidden rounded-lg border border-border bg-surface">
      <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-medium">
        Type the score instead ▾
      </summary>
      <form action={submit} className="border-t border-border px-4 py-3">
        <input type="hidden" name="code" value={game.shortCode} />
        <p className="max-w-prose text-sm text-fg-muted">
          Use this if you picked the game up late, or if the buttons and the
          scoreboard have drifted apart. Anything you tap afterwards is added on
          top of what you type here.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          {(["away", "home"] as const).map((side) => (
            <label key={side} className="block">
              <span className="block truncate text-sm font-medium">
                {game[side].shortName ?? game[side].schoolName}
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={999}
                name={`${side}Score`}
                defaultValue={game[side].score ?? ""}
                className="tabular mt-1 min-h-12 w-full rounded-md border border-border bg-bg px-3 text-lg"
              />
            </label>
          ))}
        </div>

        <label className="mt-3 block text-sm">
          Quarters played{" "}
          <span className="text-fg-muted">(5 or more means overtime)</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={10}
            name="periodsPlayed"
            defaultValue={game.periodsPlayed ?? 4}
            className="tabular mt-1 min-h-12 w-24 rounded-md border border-border bg-bg px-3"
          />
        </label>

        {state.error && (
          <p role="alert" className="mt-3 text-sm text-loss">
            {state.error}
          </p>
        )}
        {saved && !state.error && (
          <p role="status" className="mt-3 text-sm text-win">
            Saved. It is on the public scoreboard now.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="submit"
            name="final"
            value="no"
            disabled={pending}
            className="min-h-12 flex-1 rounded-lg border border-border px-4 font-medium disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save score"}
          </button>
          <button
            type="submit"
            name="final"
            value="yes"
            disabled={pending}
            className="min-h-12 rounded-lg bg-brand-fill px-4 font-semibold text-on-brand disabled:opacity-60"
          >
            Save as final
          </button>
        </div>
      </form>
    </details>
  );
}
