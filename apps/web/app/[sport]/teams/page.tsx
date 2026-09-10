import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSportSeason, listSports, listTeams } from "@kyboxscore/db";
import { findGroup, groupNoun, groupRows } from "../../../lib/alignment-group";
import { SiteHeader } from "../../components/site-header";
import { BottomNav } from "../../components/bottom-nav";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/[sport]/teams">
): Promise<Metadata> {
  const { sport } = await props.params;
  const name = sport.charAt(0).toUpperCase() + sport.slice(1);
  return { title: `${name} teams`, description: `Every Kentucky high school ${sport} team.` };
}

export default async function Page(props: PageProps<"/[sport]/teams">) {
  const { sport } = await props.params;
  const params = await props.searchParams;
  const classParam = typeof params.class === "string" ? params.class : "";
  const [sports, season] = await Promise.all([listSports(), getSportSeason(sport)]);
  if (!season) notFound();
  const all = await listTeams(season.id);

  const groups = groupRows(all);
  const selected = classParam ? findGroup(groups, classParam) : undefined;
  // A ?class= nobody can be in is a wrong URL, not an empty list of teams.
  if (classParam && !selected) notFound();

  // Alphabetical either way. Inside one class the list is short enough to
  // scan, and across the state alphabetical is how somebody looks up a school.
  const teams = selected ? selected.rows : all;
  const noun = groupNoun(groups);

  return (
    <>
      <SiteHeader sports={sports} activeSport={sport} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
          {season.sportName} teams
        </h1>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link
            href={`/${sport}/standings${selected ? `?class=${selected.param}` : ""}`}
            className="text-link underline"
          >
            {selected ? `${selected.label} standings →` : "District standings →"}
          </Link>
          <Link
            href={`/${sport}/rpi${selected ? `?class=${selected.param}` : ""}`}
            className="text-link underline"
          >
            {selected ? `${selected.label} RPI →` : "RPI ranking →"}
          </Link>
        </p>
        <p className="mt-2 text-sm text-fg-muted">
          {teams.length} teams · {selected ? `${selected.label} · ` : ""}
          {season.seasonLabel}
        </p>

        {groups.length > 1 && (
          <nav
            aria-label={`Filter by ${noun}`}
            className="mt-4 flex flex-wrap gap-1.5"
          >
            {[
              { label: "All teams", href: `/${sport}/teams`, active: !selected },
              ...groups.map((g) => ({
                label: g.name,
                href: `/${sport}/teams?class=${g.param}`,
                active: selected?.slug === g.slug,
              })),
            ].map((t) => (
              <Link
                key={t.href}
                href={t.href}
                aria-current={t.active ? "page" : undefined}
                className={`rounded-full border px-3 py-1 text-sm font-medium ${
                  t.active
                    ? "border-accent bg-accent-fill text-on-accent"
                    : "border-border bg-surface text-fg-muted hover:text-fg"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        )}
        <ul className="mt-5 grid grid-cols-1 gap-x-6 overflow-hidden rounded-lg border border-border bg-surface px-4 sm:grid-cols-2">
          {teams.map((t) => (
            <li key={t.schoolSlug} className="border-b border-border last:border-0">
              <Link
                href={`/${sport}/${season.urlYear}/teams/${t.schoolSlug}`}
                className="-mx-2 flex items-baseline gap-3 rounded px-2 py-3 hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-link"
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {t.schoolName}
                  {/* Plain text, not a link: the whole row is already one. */}
                  {!selected && t.groupName && (
                    <span className="ml-2 text-xs font-normal text-fg-muted">
                      {t.groupName}
                    </span>
                  )}
                </span>
                <span className="tabular shrink-0 text-sm text-fg-muted">
                  {t.wins}-{t.losses}
                  {t.districtName && (
                    <span className="ml-2 text-xs">
                      ({t.districtWins}-{t.districtLosses} dist)
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <BottomNav sportSlug={sport} active="teams" />
    </>
  );
}
