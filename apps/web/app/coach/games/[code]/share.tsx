"use client";

import { useActionState, useState } from "react";
import type { Scorekeeper } from "@kyboxscore/db";
import { createLinkAction, revokeLinkAction, type ScoreState } from "../actions";

/**
 * Handing scorekeeping to whoever is actually in the press box.
 *
 * The person keeping a high school football score is usually a team mom, a
 * student manager, or somebody's uncle - not the coach, and not somebody who
 * is going to create an account twenty minutes before kick-off. So the coach
 * mints a link and texts it.
 *
 * It is a bearer token, and treated like one: it is good for this one game,
 * expires the same night, can be revoked from here, cannot mint further links,
 * and can only move a score. The raw link is shown exactly once, because only
 * its hash is stored.
 */
export function ShareScoring({
  code,
  sides,
}: {
  code: string;
  sides: { teamId: number; name: string; keepers: Scorekeeper[] }[];
}) {
  const [state, submit, pending] = useActionState<ScoreState, FormData>(
    createLinkAction,
    {}
  );
  const [copied, setCopied] = useState(false);

  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold tracking-tight">
        Let somebody else keep it
      </h2>
      <p className="mt-1 max-w-prose text-sm text-fg-muted">
        Creates a link for this game only. It expires tonight, you can revoke it
        here, and whoever holds it can move the score but nothing else. No
        rosters, no other games.
      </p>

      <form action={submit} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="code" value={code} />
        <label className="flex-1">
          <span className="block text-sm font-medium">Who is it for?</span>
          <input
            name="label"
            required
            maxLength={60}
            placeholder="Press box, Dana"
            className="mt-1 min-h-12 w-full rounded-md border border-border bg-surface px-3"
          />
        </label>
        <label>
          <span className="block text-sm font-medium">Team</span>
          <select
            name="teamId"
            className="mt-1 min-h-12 rounded-md border border-border bg-surface px-2"
          >
            {sides.map((s) => (
              <option key={s.teamId} value={s.teamId}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="min-h-12 rounded-lg border border-border px-4 font-medium disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create link"}
        </button>
      </form>

      {state.error && (
        <p role="alert" className="mt-2 text-sm text-loss">
          {state.error}
        </p>
      )}

      {state.link && (
        <div className="mt-3 rounded-lg border border-accent bg-surface p-3">
          <p className="text-sm font-medium">
            Copy this now. It is not shown again.
          </p>
          <p className="mt-2 break-all rounded bg-bg px-2 py-1.5 font-mono text-xs">
            {state.link}
          </p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(state.link!).then(
                () => setCopied(true),
                () => setCopied(false)
              );
            }}
            className="mt-2 min-h-11 rounded-md border border-border px-3 text-sm font-medium"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      )}

      {sides.map((s) =>
        s.keepers.length === 0 ? null : (
          <div key={s.teamId} className="mt-4">
            <h3 className="text-sm font-semibold">{s.name}</h3>
            <ul className="mt-1 overflow-hidden rounded-lg border border-border bg-surface">
              {s.keepers.map((k) => {
                const dead = k.revokedAt !== null || new Date(k.expiresAt) < new Date();
                return (
                  <li
                    key={k.id}
                    className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-0"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className={dead ? "text-fg-muted line-through" : "font-medium"}>
                        {k.label}
                      </span>
                      <span className="ml-2 text-xs text-fg-muted">
                        {k.revokedAt
                          ? "revoked"
                          : new Date(k.expiresAt) < new Date()
                            ? "expired"
                            : k.lastUsedAt
                              ? "in use"
                              : "not opened yet"}
                      </span>
                    </span>
                    {!dead && (
                      <form action={revokeLinkAction}>
                        <input type="hidden" name="code" value={code} />
                        <input type="hidden" name="keeperId" value={k.id} />
                        <input type="hidden" name="teamId" value={s.teamId} />
                        <button
                          type="submit"
                          className="min-h-9 rounded-md border border-border px-3 text-sm"
                        >
                          Revoke
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )
      )}
    </section>
  );
}
