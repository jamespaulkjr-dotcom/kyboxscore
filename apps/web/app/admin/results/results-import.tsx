"use client";

import { useActionState } from "react";
import {
  commitResultsAction,
  previewResultsAction,
  type ResultsState,
} from "./actions";

const FIELD =
  "mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-fg";

const EXAMPLE = `# Kentucky High School Football Scores — September 19, 2026

## Final Scores

| Away Team | Away | Home Team | Home |
|---|---:|---|---:|
| Shelby County | 6 | Franklin County | 42 |

## Postponed or Rescheduled

| Away Team | Home Team | Status |
|---|---|---|
| Ballard | Fern Creek | Postponed |
| Seneca | North Oldham | Rescheduled for September 21 at 6:00 p.m. |
| Fairdale | Spencer County | Played September 19; Fairdale won 35-34 |`;

const MISS_REASON: Record<string, string> = {
  unmatched_school: "school not matched",
  not_on_schedule: "not on the schedule",
  ambiguous: "two meetings, cannot tell which",
};

export function ResultsImport({
  sports,
}: {
  sports: { id: number; name: string; hasSeason: boolean }[];
}) {
  const [state, formAction, pending] = useActionState<ResultsState, FormData>(
    previewResultsAction,
    {}
  );
  const [commitState, commitAction, committing] = useActionState<
    ResultsState,
    FormData
  >(commitResultsAction, {});

  // Once something has been written, that run is what matters on screen.
  const shown = commitState.plans ? commitState : state;
  const plans = shown.plans ?? [];
  const result = commitState.committed;

  const changing = plans.filter((p) => p.gameId && p.changes.length > 0);
  const quiet = plans.filter((p) => p.gameId && p.changes.length === 0);
  const missing = plans.filter((p) => !p.gameId);

  return (
    <>
      <form action={formAction} className="mt-5 space-y-4">
        {shown.error && (
          <p
            role="alert"
            className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss"
          >
            {shown.error}
          </p>
        )}

        <div className="sm:max-w-xs">
          <label htmlFor="sportId" className="block text-sm font-medium">
            Sport
          </label>
          <select
            id="sportId"
            name="sportId"
            required
            defaultValue={shown.sportId ?? ""}
            className={FIELD}
          >
            <option value="">Choose…</option>
            {sports.map((s) => (
              <option key={s.id} value={s.id} disabled={!s.hasSeason}>
                {s.name}
                {s.hasSeason ? "" : " (season not open)"}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="text" className="block text-sm font-medium">
            Paste the scores document, away team first
          </label>
          <textarea
            id="text"
            name="text"
            rows={16}
            required
            defaultValue={shown.text ?? ""}
            placeholder={EXAMPLE}
            spellCheck={false}
            className="mt-1 w-full rounded-md border border-border bg-surface p-3 font-mono text-sm text-fg"
          />
          <p className="mt-1 text-xs text-fg-muted">
            Keep the heading line with the date. Pipe tables only; headings,
            counts and bylines are ignored. A row can say{" "}
            <span className="font-mono">Postponed</span>,{" "}
            <span className="font-mono">Rescheduled for September 21 at 6:00 p.m.</span>,{" "}
            <span className="font-mono">Played September 19; Fairdale won 35-34</span>,{" "}
            <span className="font-mono">Canceled; ruled no contest</span> or{" "}
            <span className="font-mono">Suspended</span>.
          </p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-md bg-brand-fill px-4 font-medium text-on-brand disabled:opacity-60"
        >
          {pending ? "Reading…" : "Preview"}
        </button>
      </form>

      {shown.issues && shown.issues.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Rows I could not read
          </h2>
          <ul className="mt-2 space-y-1">
            {shown.issues.map((i) => (
              <li
                key={i.lineNumber}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs text-fg-muted">
                  line {i.lineNumber}
                </span>{" "}
                {i.message}
                <span className="block font-mono text-xs text-fg-muted">
                  {i.raw}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {plans.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-fg-muted">
            {shown.date}
            {" · "}
            {changing.length} to change
            {quiet.length > 0 && ` · ${quiet.length} already right`}
            {missing.length > 0 && ` · ${missing.length} not found`}
          </h2>

          <ul className="mt-2 space-y-2">
            {plans.map((p) => {
              const away = p.dbAwayName ?? p.awayName;
              const home = p.dbHomeName ?? p.homeName;
              return (
                <li
                  key={p.lineNumber}
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium">
                      {away} at {home}
                    </span>
                    {p.gameId ? (
                      <span className="font-mono text-xs text-fg-muted">
                        {p.currentDate} · {p.currentStatus}
                      </span>
                    ) : (
                      <span className="text-xs text-loss">
                        {MISS_REASON[p.miss ?? ""] ?? "not found"}
                        {p.unmatched.length > 0 && `: ${p.unmatched.join(", ")}`}
                      </span>
                    )}
                  </div>

                  {p.changes.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {p.changes.map((c, i) => (
                        <li key={i} className="text-fg">
                          → {c}
                        </li>
                      ))}
                    </ul>
                  )}
                  {p.gameId && p.changes.length === 0 && (
                    <p className="mt-1 text-xs text-fg-muted">
                      Already says this. Nothing to do.
                    </p>
                  )}
                  {p.warnings.map((w, i) => (
                    <p key={i} className="mt-1 text-xs text-loss">
                      {w}
                    </p>
                  ))}
                </li>
              );
            })}
          </ul>

          {missing.length > 0 && (
            <p className="mt-3 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg-muted">
              A game that is not on the schedule is never created here, and an
              unmatched school is never guessed. Add the fixture on the schedule
              screen first, or fix the spelling above and preview again.
            </p>
          )}

          {result ? (
            <div className="mt-6 rounded-md border border-win/40 bg-win/10 px-3 py-3 text-sm text-win">
              <p>
                {result.applied} game{result.applied === 1 ? "" : "s"} updated
                {result.skipped > 0 && `, ${result.skipped} left alone`}.
              </p>
              {result.failed.length > 0 && (
                <ul className="mt-2 space-y-1 text-loss">
                  {result.failed.map((f) => (
                    <li key={f.lineNumber}>
                      line {f.lineNumber}: {f.reason}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-fg-muted">
                Records rebuild as each game is written. The RPI picks the
                change up on its next hourly run.
              </p>
            </div>
          ) : (
            changing.length > 0 && (
              <form action={commitAction} className="mt-6">
                <input type="hidden" name="text" value={shown.text ?? ""} />
                <input
                  type="hidden"
                  name="sportId"
                  value={String(shown.sportId ?? "")}
                />
                <button
                  type="submit"
                  disabled={committing}
                  className="min-h-11 rounded-md bg-brand-fill px-4 font-medium text-on-brand disabled:opacity-60"
                >
                  {committing
                    ? "Writing…"
                    : `Apply ${changing.length} change${changing.length === 1 ? "" : "s"}`}
                </button>
                <p className="mt-2 text-xs text-fg-muted">
                  Read the warnings above first. Anything in red is a result
                  that already existed and would be overwritten.
                </p>
              </form>
            )
          )}
        </>
      )}
    </>
  );
}
