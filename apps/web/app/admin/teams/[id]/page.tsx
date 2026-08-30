import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTeamAdmin, listRosterAdmin, listSports } from "@kyboxscore/db";
import { SiteHeader } from "../../../components/site-header";
import { requireAdmin } from "../../../../lib/auth";
import { removeRosterAction, updateRosterAction } from "../actions";
import { AddPlayerForm } from "./add-player-form";

export const metadata: Metadata = {
  title: "Team",
  robots: { index: false, follow: false },
};

export default async function Page(props: PageProps<"/admin/teams/[id]">) {
  await requireAdmin("/admin/teams");
  const { id } = await props.params;
  const teamId = Number(id);
  if (!Number.isInteger(teamId)) notFound();

  const team = await getTeamAdmin(teamId);
  if (!team) notFound();

  const [roster, navSports] = await Promise.all([
    team.teamSeasonId ? listRosterAdmin(team.teamSeasonId) : Promise.resolve([]),
    listSports(),
  ]);

  return (
    <>
      <SiteHeader sports={navSports} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Link href="/admin/teams" className="text-sm text-link underline">
          ← All teams
        </Link>

        <h1 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
          {team.schoolName}
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          {team.sportName} · {team.gender} · {team.level} ·{" "}
          {team.seasonLabel ?? "no season open"}
        </p>

        {team.teamSeasonId === null ? (
          <p className="mt-6 rounded-lg border border-border bg-surface px-4 py-5 text-sm text-fg-muted">
            {team.sportName} has no season open, so this team cannot hold a
            roster yet. Season dates have to be loaded first.
          </p>
        ) : (
          <>
            <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-fg-muted">
              Add a player
            </h2>
            <AddPlayerForm teamId={teamId} />

            <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-fg-muted">
              Roster · {roster.length} player{roster.length === 1 ? "" : "s"}
            </h2>

            {roster.length === 0 ? (
              <p className="mt-2 rounded-lg border border-border bg-surface px-4 py-5 text-sm text-fg-muted">
                Nobody on the roster yet. The importer matches by jersey number,
                so every player who appears in a box score needs to be here with
                the number they wear.
              </p>
            ) : (
              <ul className="mt-2 overflow-hidden rounded-lg border border-border bg-surface">
                {roster.map((p) => (
                  <li
                    key={p.playerSeasonId}
                    className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-0"
                  >
                    <span className="min-w-[10rem] flex-1 font-medium">
                      {p.firstName} {p.lastName}
                    </span>

                    {/* Jersey and grade are the two fields that get corrected,
                        so they are editable in place rather than behind a
                        separate edit screen. */}
                    <form action={updateRosterAction} className="flex items-center gap-2">
                      <input type="hidden" name="teamId" value={teamId} />
                      <input type="hidden" name="playerSeasonId" value={p.playerSeasonId} />
                      <label className="sr-only" htmlFor={`j-${p.playerSeasonId}`}>
                        Jersey for {p.firstName} {p.lastName}
                      </label>
                      <input
                        id={`j-${p.playerSeasonId}`}
                        name="jersey"
                        defaultValue={p.jersey ?? ""}
                        maxLength={4}
                        placeholder="#"
                        className="min-h-9 w-16 rounded-md border border-border-strong bg-surface-raised px-2 text-center font-mono"
                      />
                      <label className="sr-only" htmlFor={`g-${p.playerSeasonId}`}>
                        Grade for {p.firstName} {p.lastName}
                      </label>
                      <input
                        id={`g-${p.playerSeasonId}`}
                        name="grade"
                        defaultValue={p.grade ?? ""}
                        placeholder="Gr"
                        className="min-h-9 w-14 rounded-md border border-border-strong bg-surface-raised px-2 text-center"
                      />
                      <button
                        type="submit"
                        className="min-h-9 rounded-md border border-border px-3 text-sm font-medium"
                      >
                        Save
                      </button>
                    </form>

                    {p.hasStats ? (
                      <span className="text-xs text-fg-muted">
                        has statistics — cannot be removed
                      </span>
                    ) : (
                      <form action={removeRosterAction}>
                        <input type="hidden" name="teamId" value={teamId} />
                        <input type="hidden" name="playerSeasonId" value={p.playerSeasonId} />
                        <button
                          type="submit"
                          className="min-h-9 rounded-md border border-border px-3 text-sm font-medium text-loss"
                        >
                          Remove
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </>
  );
}
