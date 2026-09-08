import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getLatestRpiRun,
  getRpiStandings,
  getSportSeason,
  listSports,
} from "@kyboxscore/db";
import { SiteHeader } from "../../components/site-header";
import { BottomNav } from "../../components/bottom-nav";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/[sport]/rpi">
): Promise<Metadata> {
  const { sport } = await props.params;
  return {
    title: "RPI",
    description: `KHSAA RPI ratings for Kentucky high school ${sport}, with a shadow rating that replaces the flat .500 assumption with an adjusted out-of-state opponent winning percentage.`,
  };
}

/** 3 decimal places is how RPI is quoted; more implies precision we do not have. */
const fmt = (n: number) => n.toFixed(3);

export default async function Page(props: PageProps<"/[sport]/rpi">) {
  const { sport } = await props.params;
  const params = await props.searchParams;
  const sortByDelta =
    (typeof params.sort === "string" ? params.sort : "") === "delta";

  const [season, sports] = await Promise.all([
    getSportSeason(sport),
    listSports(),
  ]);
  if (!season) notFound();

  const [standings, run] = await Promise.all([
    getRpiStandings(sport),
    getLatestRpiRun(sport),
  ]);

  const withDelta = standings.filter((s) => s.delta !== null && Math.abs(s.delta) > 0.0005);

  // Sorted by rank the table answers "where do we stand". Sorted by delta it
  // answers a different question - who does the .500 assumption actually move
  // - and for that the teams it does not move are noise, so they come out.
  // Helped at the top, hurt at the bottom, nothing in between.
  const rows = sortByDelta
    ? [...withDelta].sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
    : standings;

  return (
    <>
      <SiteHeader sports={sports} activeSport={sport} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5 pb-24">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
          {season.sportName} RPI
        </h1>

        <p className="mt-2 text-sm">
          <Link href={`/${sport}/standings`} className="text-link underline">
            District standings →
          </Link>
        </p>

        {run ? (
          <p className="mt-1 text-sm text-fg-muted">
            Through {run.throughDate} · computed {run.computedAt.slice(0, 16).replace("T", " ")}
          </p>
        ) : (
          <p className="mt-4 rounded-lg border border-border bg-surface px-4 py-6 text-sm text-fg-muted">
            No RPI has been computed for this season yet. It needs completed
            regular-season games with scores.
          </p>
        )}

        {standings.length > 0 && (
          <>
            {withDelta.length > 0 && (
              <nav aria-label="Sort" className="mt-4 flex flex-wrap gap-2">
                {[
                  { label: "By rank", active: !sortByDelta, href: `/${sport}/rpi` },
                  {
                    label: `Most affected by the .500 assumption (${withDelta.length})`,
                    active: sortByDelta,
                    href: `/${sport}/rpi?sort=delta`,
                  },
                ].map((tab) => (
                  <Link
                    key={tab.label}
                    href={tab.href}
                    aria-current={tab.active ? "page" : undefined}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                      tab.active
                        ? "border-accent bg-accent-fill text-on-accent"
                        : "border-border bg-surface text-fg hover:bg-surface-raised"
                    }`}
                  >
                    {tab.label}
                  </Link>
                ))}
              </nav>
            )}

            {sortByDelta && (
              <p className="mt-3 max-w-prose text-sm text-fg-muted">
                Only the {withDelta.length} teams whose rating moves, ordered by
                how much. The ones at the top are held down by the .500
                assumption; the ones at the bottom are held up by it. The{" "}
                <span className="font-semibold">#</span> column is still their
                official statewide rank.
              </p>
            )}

            <div className="mt-5 overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[40rem] border-collapse bg-surface text-sm">
                <caption className="sr-only">
                  {season.sportName} RPI standings, official and shadow
                </caption>
                <thead>
                  <tr className="border-b border-border text-left">
                    <th scope="col" className="px-3 py-2 font-semibold">#</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Team</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">W-L</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">WP</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">OWP</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">OOWP</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">RPI</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">Shadow</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.teamId} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 tabular-nums text-fg-muted">{s.stateRank}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/${sport}/${season.urlYear}/teams/${s.schoolSlug}`}
                          className="font-medium text-link underline"
                        >
                          {s.schoolName}
                        </Link>
                        {s.className && (
                          <span className="ml-2 text-xs text-fg-muted">
                            {s.className}
                            {s.classRank ? ` #${s.classRank}` : ""}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {s.wins}-{s.losses}{s.ties ? `-${s.ties}` : ""}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmt(s.wp)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmt(s.owp)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmt(s.oowp)}</td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">
                        {fmt(s.rpi)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-fg-muted">
                        {s.shadowRpi === null ? "—" : fmt(s.shadowRpi)}
                      </td>
                      <td
                        className={`px-2 py-2 text-right tabular-nums ${
                          s.delta === null || Math.abs(s.delta) < 0.0005
                            ? "text-fg-muted"
                            : s.delta > 0
                              ? "text-win"
                              : "text-loss"
                        }`}
                      >
                        {s.delta === null || Math.abs(s.delta) < 0.0005
                          ? "—"
                          : `${s.delta > 0 ? "+" : ""}${fmt(s.delta)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <section className="mt-8 max-w-prose text-sm text-fg-muted">
              <h2 className="text-sm font-semibold uppercase tracking-wide">
                What these numbers mean
              </h2>
              <p className="mt-2">
                RPI is <strong>35% your own winning percentage</strong>,{" "}
                <strong>35% your opponents&rsquo;</strong>, and{" "}
                <strong>30% your opponents&rsquo; opponents&rsquo;</strong>. Margin of
                victory never counts. Beating someone by forty is worth
                exactly what beating them by one is worth.
              </p>
              <p className="mt-2">
                Under the official formula every out-of-state opponent is
                treated as a .500 team, however good or bad they actually are.{" "}
                <strong>Shadow RPI replaces that one assumption with an
                adjusted out-of-state opponent winning percentage</strong>, and
                Δ is the difference. A positive delta means the .500 assumption
                is costing that team; a negative one means it is helping.
              </p>
              <p className="mt-2">
                That adjusted percentage is the opponent&rsquo;s record with
                only the game against this team removed, which is what the
                formula asks for. An opponent who played two Kentucky schools is
                therefore counted differently by each of them.
              </p>
              {/* Saying exactly what this is, because it is not a second RPI
                  computed from scratch and calling it one would be a claim we
                  cannot support. */}
              <p className="mt-2">
                Everything else in Shadow RPI is the official calculation
                unchanged. We hold out-of-state opponents&rsquo; records but not
                their opponents&rsquo; opponents, so the last 30% of the formula
                still treats an out-of-state opponent&rsquo;s schedule as .500.
                Shadow RPI is the official rating with one input corrected, not
                an independently calculated rating.
              </p>
              {withDelta.length > 0 ? (
                <p className="mt-2">
                  {withDelta.length} team{withDelta.length === 1 ? "" : "s"} here
                  played someone from out of state, so the assumption is actually
                  moving {withDelta.length === 1 ? "its" : "their"} number.
                </p>
              ) : (
                <p className="mt-2">
                  No team here has played an out-of-state opponent yet, so the
                  two ratings are identical.
                </p>
              )}
              <p className="mt-2">
                A team with any missing score is not ranked at all, rather than
                ranked on incomplete data.
              </p>
            </section>
          </>
        )}
      </main>
      <BottomNav sportSlug={sport} />
    </>
  );
}
