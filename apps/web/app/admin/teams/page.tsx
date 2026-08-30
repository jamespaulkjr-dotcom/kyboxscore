import type { Metadata } from "next";
import Link from "next/link";
import {
  listSchoolsForSelect,
  listSports,
  listSportsForSelect,
  listTeamsAdmin,
} from "@kyboxscore/db";
import { SiteHeader } from "../../components/site-header";
import { requireAdmin } from "../../../lib/auth";
import { CreateTeamForm } from "./create-team-form";

export const metadata: Metadata = {
  title: "Teams",
  robots: { index: false, follow: false },
};

export default async function Page(props: PageProps<"/admin/teams">) {
  await requireAdmin("/admin/teams");
  const { q } = await props.searchParams;
  const query = typeof q === "string" ? q : "";

  const [teams, schools, sportOptions, navSports] = await Promise.all([
    listTeamsAdmin(query),
    listSchoolsForSelect(),
    listSportsForSelect(),
    listSports(),
  ]);

  return (
    <>
      <SiteHeader sports={navSports} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/admin/users" className="text-link underline">← Accounts</Link>
          <Link href="/admin/schedule" className="text-link underline">Import a schedule</Link>
          <Link href="/admin/alignments" className="text-link underline">Import an alignment</Link>
        </div>
        <h1 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">Teams</h1>
        <p className="mt-1 text-sm text-fg-muted">
          A school is not a team. A team is a school, a sport, boys or girls,
          and a level — and it needs a roster before statistics can be imported.
        </p>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Add a team
        </h2>
        <CreateTeamForm schools={schools} sports={sportOptions} />

        <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Existing teams
        </h2>
        <form method="get" className="mt-2 flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="School or sport"
            aria-label="Search teams"
            className="min-h-11 flex-1 rounded-md border border-border bg-surface px-3 text-fg placeholder:text-fg-muted"
          />
          <button type="submit" className="min-h-11 rounded-md border border-border px-4 font-medium">
            Search
          </button>
        </form>

        {teams.length === 0 ? (
          <p className="mt-3 rounded-lg border border-border bg-surface px-4 py-6 text-sm text-fg-muted">
            {query ? "No teams match that search." : "No teams yet."}
          </p>
        ) : (
          <ul className="mt-3 overflow-hidden rounded-lg border border-border bg-surface">
            {teams.map((t) => (
              <li key={t.teamId} className="border-b border-border last:border-0">
                <Link
                  href={`/admin/teams/${t.teamId}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-raised"
                >
                  <span className="font-medium">
                    {t.schoolName}
                    <span className="ml-2 text-sm font-normal text-fg-muted">
                      {t.sportName} · {t.gender} · {t.level}
                    </span>
                  </span>
                  <span className="text-sm text-fg-muted">
                    {t.teamSeasonId === null
                      ? "no season open"
                      : `${t.seasonLabel} · ${t.rosterCount} player${t.rosterCount === 1 ? "" : "s"}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
