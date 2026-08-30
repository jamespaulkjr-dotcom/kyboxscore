import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSportSeason, listSports, listTeams } from "@kyboxscore/db";
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
  const [sports, season] = await Promise.all([listSports(), getSportSeason(sport)]);
  if (!season) notFound();
  const teams = await listTeams(season.id);

  return (
    <>
      <SiteHeader sports={sports} activeSport={sport} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
          {season.sportName} teams
        </h1>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href={`/${sport}/standings`} className="text-link underline">
            District standings →
          </Link>
          <Link href={`/${sport}/rpi`} className="text-link underline">
            RPI ranking →
          </Link>
        </p>
        <p className="mt-2 text-sm text-fg-muted">
          {teams.length} teams · {season.seasonLabel}
        </p>
        <ul className="mt-5 grid grid-cols-1 gap-x-6 overflow-hidden rounded-lg border border-border bg-surface px-4 sm:grid-cols-2">
          {teams.map((t) => (
            <li key={t.schoolSlug} className="border-b border-border last:border-0">
              <Link
                href={`/${sport}/${season.urlYear}/teams/${t.schoolSlug}`}
                className="-mx-2 flex items-baseline gap-3 rounded px-2 py-3 hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-link"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{t.schoolName}</span>
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
