"use client";

import { useActionState } from "react";
import {
  commitTeamScheduleAction,
  previewTeamScheduleAction,
  type TeamScheduleState,
} from "./actions";

const FIELD =
  "mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-fg";

const EXAMPLE = `This is for John Hardin High School

Fri Aug 21 7:30 PM    vs
Hancock County High School
Location: John Hardin High School
Football Stadium    Win
16-3
Non-District Game`;

export function TeamScheduleImport({
  sports,
}: {
  sports: { id: number; name: string; hasSeason: boolean }[];
}) {
  const [state, formAction, pending] = useActionState<TeamScheduleState, FormData>(
    previewTeamScheduleAction,
    {}
  );
  const [commitState, commitAction, committing] = useActionState<TeamScheduleState, FormData>(
    commitTeamScheduleAction,
    {}
  );

  const blocks = state.blocks ?? [];
  const result = commitState.committed;
  const ready = blocks.filter((b) => b.subject?.schoolId && b.year !== null);
  const readyGames = ready.reduce(
    (n, b) => n + b.games.filter((g) => g.opponent.schoolId).length,
    0
  );

  return (
    <>
      <form action={formAction} className="mt-5 space-y-4">
        {state.error && (
          <p role="alert" className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
            {state.error}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label htmlFor="sportId" className="block text-sm font-medium">Sport</label>
            <select id="sportId" name="sportId" required defaultValue={state.sportId ?? ""} className={FIELD}>
              <option value="">Choose…</option>
              {sports.map((s) => (
                <option key={s.id} value={s.id} disabled={!s.hasSeason}>
                  {s.name}{s.hasSeason ? "" : " — season not open"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="gender" className="block text-sm font-medium">Boys / girls</label>
            <select id="gender" name="gender" defaultValue={state.gender ?? "boys"} className={FIELD}>
              <option value="boys">Boys</option>
              <option value="girls">Girls</option>
              <option value="coed">Coed</option>
            </select>
          </div>
          <div>
            <label htmlFor="level" className="block text-sm font-medium">Level</label>
            <select id="level" name="level" defaultValue={state.level ?? "varsity"} className={FIELD}>
              <option value="varsity">Varsity</option>
              <option value="jv">JV</option>
              <option value="freshman">Freshman</option>
              <option value="middle_school">Middle school</option>
            </select>
          </div>
          <div>
            <label htmlFor="year" className="block text-sm font-medium">Year</label>
            <input
              id="year" name="year" inputMode="numeric" placeholder="auto"
              defaultValue={state.year ?? ""} className={FIELD}
            />
          </div>
        </div>

        <div>
          <label htmlFor="text" className="block text-sm font-medium">
            Paste one or more team schedules
          </label>
          <textarea
            id="text" name="text" rows={16} required
            defaultValue={state.text ?? ""}
            placeholder={EXAMPLE}
            spellCheck={false}
            className="mt-1 w-full rounded-md border border-border bg-surface p-3 font-mono text-sm text-fg"
          />
          <p className="mt-1 text-xs text-fg-muted">
            Paste it exactly as it comes — logos, location lines, blank lines and
            all. Start each team with <code>This is for &lt;school&gt;</code> and
            you can paste many teams at once. The year is worked out from the
            weekdays; type one in only if that comes out ambiguous.
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

      {blocks.map((block, bi) => {
        const unmatched = block.games.filter((g) => !g.opponent.schoolId);
        return (
          <section key={bi} className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
              {block.subject?.schoolName ?? block.subjectInput ?? "Unknown team"}
              {block.year !== null && ` · ${block.year}`}
            </h2>

            {!block.subject?.schoolId && (
              <p className="mt-2 rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
                {block.subjectInput
                  ? `“${block.subjectInput}” is not a school I recognise, so these games cannot be placed.`
                  : "No “This is for …” heading, so I do not know whose schedule this is."}
              </p>
            )}

            {block.year === null && (
              <p className="mt-2 rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
                {block.yearCandidates.length === 0
                  ? "No year fits these weekdays. Enter one above."
                  : `The weekdays fit ${block.yearCandidates.join(" and ")}. Enter the year above.`}
              </p>
            )}

            {block.errors.map((e) => (
              <p key={e.lineNumber} className="mt-2 rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
                line {e.lineNumber}: {e.message}
              </p>
            ))}

            <div className="mt-2 overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[34rem] border-collapse bg-surface text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th scope="col" className="px-3 py-2 font-semibold">Date</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Opponent</th>
                    <th scope="col" className="px-2 py-2 font-semibold">Type</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {block.games.map((g, gi) => (
                    <tr key={gi} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                        {block.year ?? "????"}-{String(g.month).padStart(2, "0")}-
                        {String(g.day).padStart(2, "0")}
                        {g.time && <span className="ml-1 text-fg-muted">{g.time}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-fg-muted">{g.isHome ? "vs " : "at "}</span>
                        {g.opponent.schoolId ? (
                          <>
                            {g.opponent.schoolName}
                            {g.opponent.method !== "exact" && (
                              <span className="ml-2 text-xs text-fg-muted">
                                from “{g.opponent.input}”
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-loss">“{g.opponent.input}” — no match</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-xs text-fg-muted">
                        {g.gameType === "scrimmage" ? (
                          <span className="text-accent">scrimmage — excluded from RPI</span>
                        ) : (
                          g.gameType?.replace("_", "-") ?? "—"
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {g.teamScore === null
                          ? "—"
                          : `${g.won ? "W" : "L"} ${g.teamScore}-${g.opponentScore}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {unmatched.length > 0 && (
              <p className="mt-2 text-sm text-fg-muted">
                {unmatched.length} opponent{unmatched.length === 1 ? "" : "s"} did not
                match a known school and {unmatched.length === 1 ? "that game is" : "those games are"}{" "}
                skipped, never guessed.
              </p>
            )}
          </section>
        );
      })}

      {blocks.length > 0 && (
        result ? (
          <div className="mt-6 rounded-md border border-win/40 bg-win/10 px-3 py-3 text-sm text-win">
            {result.created} game{result.created === 1 ? "" : "s"} created
            {result.duplicates > 0 && `, ${result.duplicates} already on the schedule`}
            {result.teamsCreated > 0 && `, ${result.teamsCreated} team${result.teamsCreated === 1 ? "" : "s"} created`}
            {result.skipped > 0 && `, ${result.skipped} skipped`}.
          </div>
        ) : (
          <form action={commitAction} className="mt-6">
            <input type="hidden" name="text" value={state.text ?? ""} />
            <input type="hidden" name="sportId" value={state.sportId ?? ""} />
            <input type="hidden" name="gender" value={state.gender ?? "boys"} />
            <input type="hidden" name="level" value={state.level ?? "varsity"} />
            <input type="hidden" name="year" value={state.year ?? ""} />
            {commitState.error && (
              <p role="alert" className="mb-3 rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
                {commitState.error}
              </p>
            )}
            <button
              type="submit"
              disabled={committing || readyGames === 0}
              className="min-h-11 w-full rounded-md bg-brand-fill px-4 font-medium text-on-brand disabled:opacity-60"
            >
              {committing ? "Creating…" : `Create ${readyGames} game${readyGames === 1 ? "" : "s"}`}
            </button>
            <p className="mt-2 text-xs text-fg-muted">
              A game already on the schedule is recognised, not duplicated — so
              importing both teams&rsquo; schedules is safe and expected.
            </p>
          </form>
        )
      )}
    </>
  );
}
