import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getDistrictStandings,
  getSportSeason,
  listSports,
  type DistrictStanding,
} from "@kyboxscore/db";
import {
  findGroup,
  groupNoun,
  groupRows,
  type AlignmentGroup,
} from "../../../lib/alignment-group";
import { SiteHeader } from "../../components/site-header";
import { BottomNav } from "../../components/bottom-nav";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/[sport]/standings">
): Promise<Metadata> {
  const { sport } = await props.params;
  return {
    title: "Standings",
    description: `District standings for Kentucky high school ${sport}, by classification and by district record, the order that decides postseason placement.`,
  };
}

const pct = (w: number, l: number) =>
  w + l === 0 ? "—" : (w / (w + l)).toFixed(3).replace(/^0/, "");

/** Districts inside one class, in the order the query already put them. */
function districtsOf(group: AlignmentGroup<DistrictStanding>) {
  const districts = new Map<string, DistrictStanding[]>();
  for (const row of group.rows) {
    if (!districts.has(row.districtName)) districts.set(row.districtName, []);
    districts.get(row.districtName)!.push(row);
  }
  return [...districts];
}

export default async function Page(props: PageProps<"/[sport]/standings">) {
  const { sport } = await props.params;
  const params = await props.searchParams;
  const classParam = typeof params.class === "string" ? params.class : "";

  const [season, sports] = await Promise.all([getSportSeason(sport), listSports()]);
  if (!season) notFound();

  const standings = await getDistrictStandings(season.id);

  const groups = groupRows(standings);
  const selected = classParam ? findGroup(groups, classParam) : undefined;
  // A ?class= nobody can be in is a wrong URL, not a page of empty tables.
  if (classParam && !selected) notFound();

  const noun = groupNoun(groups);
  const shown = selected ? [selected] : groups;

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
          <strong>district record</strong>, not overall record and not RPI. Both
          are shown because they are what people argue about, but neither moves a
          team up this table.{" "}
          <Link
            href={
              selected
                ? `/${sport}/rpi?class=${selected.param}`
                : `/${sport}/rpi`
            }
            className="text-link underline"
          >
            {selected ? `${selected.label} RPI ranking →` : "Statewide RPI ranking →"}
          </Link>
        </p>

        {groups.length > 1 && (
          <nav
            aria-label={`Filter by ${noun}`}
            className="mt-4 flex flex-wrap gap-2"
          >
            {[
              {
                label: `All ${noun === "region" ? "regions" : "classes"}`,
                href: `/${sport}/standings`,
                active: !selected,
              },
              ...groups.map((g) => ({
                label: g.name,
                href: `/${sport}/standings?class=${g.param}`,
                active: selected?.slug === g.slug,
              })),
            ].map((t) => (
              <Link
                key={t.href}
                href={t.href}
                aria-current={t.active ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                  t.active
                    ? "border-accent bg-accent-fill text-on-accent"
                    : "border-border bg-surface text-fg hover:bg-surface-raised"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        )}

        {groups.length === 0 && (
          <p className="mt-6 rounded-lg border border-border bg-surface px-4 py-6 text-sm text-fg-muted">
            No teams have been assigned to a district for this season yet.
          </p>
        )}

        {shown.map((group) => (
          <section key={group.slug} className="mt-8">
            <h2 className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
                {group.label}
              </span>
              {!selected && (
                <Link
                  href={`/${sport}/standings?class=${group.param}`}
                  className="text-xs text-link underline"
                >
                  {group.label} on its own →
                </Link>
              )}
            </h2>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              {districtsOf(group).map(([districtName, teams]) => (
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
          alphabetically. KHSAA&rsquo;s formal tie-breaking procedure (head to
          head, then common opponents) is not applied here, so a genuine tie is
          shown as a tie rather than resolved by a rule we invented.
        </p>
      </main>
      <BottomNav sportSlug={sport} />
    </>
  );
}
