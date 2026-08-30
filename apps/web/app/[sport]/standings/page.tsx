import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getDistrictStandings,
  getSportSeason,
  listSports,
  type DistrictStanding,
} from "@kyboxscore/db";
import { SiteHeader } from "../../components/site-header";
import { BottomNav } from "../../components/bottom-nav";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/[sport]/standings">
): Promise<Metadata> {
  const { sport } = await props.params;
  return {
    title: "Standings",
    description: `District standings for Kentucky high school ${sport}, by district record — the order that decides postseason placement.`,
  };
}

const pct = (w: number, l: number) =>
  w + l === 0 ? "—" : (w / (w + l)).toFixed(3).replace(/^0/, "");

export default async function Page(props: PageProps<"/[sport]/standings">) {
  const { sport } = await props.params;
  const [season, sports] = await Promise.all([getSportSeason(sport), listSports()]);
  if (!season) notFound();

  const standings = await getDistrictStandings(season.id);

  // Group into class -> district, preserving the query's ordering.
  const classes = new Map<string, Map<string, DistrictStanding[]>>();
  for (const row of standings) {
    if (!classes.has(row.className)) classes.set(row.className, new Map());
    const districts = classes.get(row.className)!;
    if (!districts.has(row.districtName)) districts.set(row.districtName, []);
    districts.get(row.districtName)!.push(row);
  }

  return (
    <>
      <SiteHeader sports={sports} activeSport={sport} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5 pb-24">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
          {season.sportName} standings
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          {season.seasonLabel} · ordered by district record
        </p>
        <p className="mt-3 max-w-prose text-sm text-fg-muted">
          District placement is what decides the postseason, and it is decided by{" "}
          <strong>district record</strong> — not overall record and not RPI. Both
          are shown because they are what people argue about, but neither moves a
          team up this table.{" "}
          <Link href={`/${sport}/rpi`} className="text-link underline">
            Statewide RPI ranking →
          </Link>
        </p>

        {classes.size === 0 && (
          <p className="mt-6 rounded-lg border border-border bg-surface px-4 py-6 text-sm text-fg-muted">
            No teams have been assigned to a district for this season yet.
          </p>
        )}

        {[...classes].map(([className, districts]) => (
          <section key={className} className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
              Class {className}
            </h2>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              {[...districts].map(([districtName, teams]) => (
                <div key={districtName} className="overflow-hidden rounded-lg border border-border bg-surface">
                  <h3 className="border-b border-border px-3 py-2 text-sm font-semibold">
                    {districtName}
                  </h3>
                  <table className="w-full border-collapse text-sm">
                    <thead className="sr-only">
                      <tr>
                        <th scope="col">Position</th>
                        <th scope="col">Team</th>
                        <th scope="col">District record</th>
                        <th scope="col">Overall record</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teams.map((t) => (
                        <tr key={t.teamId} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 tabular-nums text-fg-muted">
                            {t.districtRank}
                          </td>
                          <td className="px-1 py-2">
                            <Link
                              href={`/${sport}/${season.urlYear}/teams/${t.schoolSlug}`}
                              className="font-medium text-link underline"
                            >
                              {t.schoolName}
                            </Link>
                            {t.stateRank && (
                              <span className="ml-2 text-xs text-fg-muted">
                                state #{t.stateRank}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold">
                            {t.districtWins}-{t.districtLosses}
                            <span className="ml-1 text-xs font-normal text-fg-muted">
                              {pct(t.districtWins, t.districtLosses)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-fg-muted">
                            {t.wins}-{t.losses}
                            {t.ties > 0 ? `-${t.ties}` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </section>
        ))}

        <p className="mt-8 max-w-prose text-xs text-fg-muted">
          Teams level on district record are ordered by overall record, then
          alphabetically. KHSAA&rsquo;s formal tie-breaking procedure — head to
          head, then common opponents — is not applied here, so a genuine tie is
          shown as a tie rather than resolved by a rule we invented.
        </p>
      </main>
      <BottomNav sportSlug={sport} />
    </>
  );
}
