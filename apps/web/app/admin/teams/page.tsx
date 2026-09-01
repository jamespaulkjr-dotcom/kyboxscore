import type { Metadata } from "next";
import Link from "next/link";
import {
  countTeamsBySport,
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
  const { q, sport } = await props.searchParams;
  const query = typeof q === "string" ? q : "";
  const sportFilter = Number(typeof sport === "string" ? sport : "") || undefined;

  const [teams, schools, sportOptions, navSports, bySport] = await Promise.all([
    listTeamsAdmin(query, sportFilter),
    listSchoolsForSelect(),
    listSportsForSelect(),
    listSports(),
    countTeamsBySport(),
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
        {/* Sport first, because it is the distinction that matters: two teams
            from the same school in different sports are entirely separate
            things, and with several sports loaded the list is unreadable
            without it. */}
        <nav aria-label="Filter by sport" className="mt-3 flex flex-wrap gap-1.5">
          <Link
            href={query ? `/admin/teams?q=${encodeURIComponent(query)}` : "/admin/teams"}
            aria-current={sportFilter ? undefined : "page"}
            className={`min-h-9 rounded-full border px-3 py-1.5 text-sm font-medium ${
              sportFilter
                ? "border-border text-fg-muted hover:bg-surface-raised"
                : "border-brand-fill bg-brand-fill text-on-brand"
            }`}
          >
            All sports
          </Link>
          {bySport.map((s) => {
            const active = sportFilter === s.sportId;
            const params = new URLSearchParams();
            params.set("sport", String(s.sportId));
            if (query) params.set("q", query);
            return (
              <Link
                key={s.sportId}
                href={`/admin/teams?${params}`}
                aria-current={active ? "page" : undefined}
                className={`min-h-9 rounded-full border px-3 py-1.5 text-sm font-medium ${
                  active
                    ? "border-brand-fill bg-brand-fill text-on-brand"
                    : "border-border text-fg-muted hover:bg-surface-raised"
                }`}
              >
                {s.sportName}
                <span className="ml-1.5 tabular opacity-70">{s.teams}</span>
              </Link>
            );
          })}
        </nav>

        <form method="get" className="mt-2 flex gap-2">
          {sportFilter && <input type="hidden" name="sport" value={sportFilter} />}
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="School name"
            aria-label="Search teams"
            className="min-h-11 flex-1 rounded-md border border-border bg-surface px-3 text-fg placeholder:text-fg-muted"
          />
          <button type="submit" className="min-h-11 rounded-md border border-border px-4 font-medium">
            Search
          </button>
        </form>
        <p className="mt-2 text-sm text-fg-muted">
          Showing {teams.length} team{teams.length === 1 ? "" : "s"}
          {sportFilter
            ? ` in ${bySport.find((s) => s.sportId === sportFilter)?.sportName ?? "this sport"}`
            : " across every sport"}
          .
        </p>

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
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    {/* The sport reads as a label, not as trailing prose: it is
                        what separates two otherwise identical rows. */}
                    <span className="rounded bg-surface-raised px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                      {t.sportName}
                    </span>
                    <span className="font-medium">{t.schoolName}</span>
                    <span className="text-sm font-normal text-fg-muted">
                      {t.gender} · {t.level}
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
