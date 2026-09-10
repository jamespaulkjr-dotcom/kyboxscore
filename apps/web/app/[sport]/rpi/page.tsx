import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getLatestRpiRun,
  getRpiStandings,
  getSportSeason,
  listSports,
  type RpiStanding,
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
    description: `KHSAA RPI ratings for Kentucky high school ${sport}, statewide and by classification, with a shadow rating that replaces the flat .500 assumption with an adjusted out-of-state opponent winning percentage.`,
  };
}

/** 3 decimal places is how RPI is quoted; more implies precision we do not have. */
const fmt = (n: number) => n.toFixed(3);

const showsDelta = (s: RpiStanding) =>
  s.delta !== null && Math.abs(s.delta) > 0.0005;

const signed = (n: number) => `${n > 0 ? "+" : ""}${fmt(n)}`;

/** How many teams each classification shows before you have to ask for the rest. */
const TOP_N = 10;

type Group = {
  slug: string;
  /** What ?class= carries: "3a" rather than the alignment's "class-3a". */
  param: string;
  /** "1A", or "Region 5". */
  name: string;
  /** "Class 1A", but "Region 5" - the region's name already carries its noun. */
  label: string;
  /** "class" or "region", for prose that has to name the thing. */
  noun: string;
  ordinal: number;
  teams: RpiStanding[];
};

/**
 * Football ranks inside a classification, basketball inside a region. Both
 * live one level above the district, so one grouping covers both - only the
 * word for it changes.
 */
function groupStandings(standings: RpiStanding[]): Group[] {
  const groups = new Map<string, Group>();
  for (const s of standings) {
    if (!s.groupSlug || !s.groupName) continue;
    let g = groups.get(s.groupSlug);
    if (!g) {
      const region = s.groupKind === "region";
      g = {
        slug: s.groupSlug,
        param: s.groupSlug.replace(/^class-/, ""),
        name: s.groupName,
        label: region ? s.groupName : `Class ${s.groupName}`,
        noun: region ? "region" : "class",
        ordinal: s.groupOrdinal ?? 999,
        teams: [],
      };
      groups.set(s.groupSlug, g);
    }
    g.teams.push(s);
  }
  // The standings arrive in state-rank order and both ranks break ties the
  // same way, so each group's teams are already in group-rank order.
  return [...groups.values()].sort((a, b) => a.ordinal - b.ordinal);
}

export default async function Page(props: PageProps<"/[sport]/rpi">) {
  const { sport } = await props.params;
  const params = await props.searchParams;
  const sortByDelta =
    (typeof params.sort === "string" ? params.sort : "") === "delta";
  const classParam = (
    typeof params.class === "string" ? params.class : ""
  ).toLowerCase();
  const byParam = (typeof params.by === "string" ? params.by : "").toLowerCase();
  const byClass = byParam === "class" || byParam === "region";

  const [season, sports] = await Promise.all([
    getSportSeason(sport),
    listSports(),
  ]);
  if (!season) notFound();

  const [standings, run] = await Promise.all([
    getRpiStandings(sport),
    getLatestRpiRun(sport),
  ]);

  const groups = groupStandings(standings);
  const selected = classParam
    ? groups.find((g) => g.param === classParam || g.slug === classParam)
    : undefined;
  // A ?class= nobody can be in is a wrong URL, not a page with an empty table.
  if (classParam && !selected) notFound();

  const groupNoun = groups[0]?.noun ?? "class";

  const withDelta = standings.filter(showsDelta);

  // Sorted by rank the table answers "where do we stand". Sorted by delta it
  // answers a different question - who does the .500 assumption actually move
  // - and for that the teams it does not move are noise, so they come out.
  // Helped at the top, hurt at the bottom, nothing in between.
  const rows = selected
    ? selected.teams
    : sortByDelta
      ? [...withDelta].sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
      : standings;

  // The sort toggle asks a statewide question. Inside one classification, or
  // across the top ten of each, it would be a third axis on a page that does
  // not need one.
  const showSortNav = !selected && !byClass && withDelta.length > 0;
  const visible = byClass
    ? groups.flatMap((g) => g.teams.slice(0, TOP_N))
    : rows;
  const visibleWithDelta = visible.filter(showsDelta);

  const tab = (label: string, href: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
        active
          ? "border-accent bg-accent-fill text-on-accent"
          : "border-border bg-surface text-fg hover:bg-surface-raised"
      }`}
    >
      {label}
    </Link>
  );

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
            {groups.length > 0 && (
              <nav
                aria-label={`Filter by ${groupNoun}`}
                className="mt-4 flex flex-wrap gap-2"
              >
                {tab("Statewide", `/${sport}/rpi`, !selected && !byClass)}
                {tab(
                  `Top ${TOP_N} by ${groupNoun}`,
                  `/${sport}/rpi?by=${groupNoun}`,
                  byClass
                )}
                {groups.map((g) =>
                  tab(
                    g.name,
                    `/${sport}/rpi?class=${g.param}`,
                    selected?.slug === g.slug
                  )
                )}
              </nav>
            )}

            {showSortNav && (
              <nav aria-label="Sort" className="mt-2 flex flex-wrap gap-2">
                {tab("By rank", `/${sport}/rpi`, !sortByDelta)}
                {tab(
                  `Most affected by the .500 assumption (${withDelta.length})`,
                  `/${sport}/rpi?sort=delta`,
                  sortByDelta
                )}
              </nav>
            )}

            {sortByDelta && !selected && !byClass && (
              <p className="mt-3 max-w-prose text-sm text-fg-muted">
                Only the {withDelta.length} teams whose rating moves, ordered by
                how much. The ones at the top are held down by the .500
                assumption; the ones at the bottom are held up by it. The{" "}
                <span className="font-semibold">#</span> column is still their
                official statewide rank.
              </p>
            )}

            {selected && (
              <p className="mt-3 max-w-prose text-sm text-fg-muted">
                <span className="font-semibold text-fg">{selected.label}</span>,
                all {selected.teams.length} ranked teams. The{" "}
                <span className="font-semibold">#</span> column is the rank
                within the {selected.noun};{" "}
                <span className="font-semibold">State</span> is the same team&rsquo;s
                place among every school in Kentucky.
              </p>
            )}

            {byClass && (
              <p className="mt-3 max-w-prose text-sm text-fg-muted">
                The top {TOP_N} in each {groupNoun}, by RPI. Postseason
                brackets are drawn inside a {groupNoun}, so this is the
                comparison that decides anything. A 1A team&rsquo;s statewide
                rank never puts it in a bracket with a 6A team.
              </p>
            )}

            {byClass ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {groups.map((g) => (
                  <section
                    key={g.slug}
                    className="overflow-hidden rounded-lg border border-border bg-surface"
                  >
                    <h2 className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2">
                      <span className="text-sm font-semibold">{g.label}</span>
                      <Link
                        href={`/${sport}/rpi?class=${g.param}`}
                        className="text-xs font-normal text-link underline"
                      >
                        All {g.teams.length} →
                      </Link>
                    </h2>
                    <table className="w-full border-collapse text-sm">
                      <caption className="sr-only">
                        {g.label} RPI, top {TOP_N}
                      </caption>
                      <thead className="sr-only">
                        <tr>
                          <th scope="col">Rank in {g.noun}</th>
                          <th scope="col">Team</th>
                          <th scope="col">Record</th>
                          <th scope="col">RPI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.teams.slice(0, TOP_N).map((s, i) => (
                          <tr
                            key={s.teamId}
                            className="border-b border-border last:border-0"
                          >
                            <td className="px-3 py-2 tabular-nums text-fg-muted">
                              {s.groupRank ?? i + 1}
                            </td>
                            <td className="px-1 py-2">
                              <Link
                                href={`/${sport}/${season.urlYear}/teams/${s.schoolSlug}`}
                                className="font-medium text-link underline"
                              >
                                {s.schoolName}
                              </Link>
                              {s.stateRank && (
                                <span className="ml-2 text-xs text-fg-muted">
                                  state #{s.stateRank}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-fg-muted">
                              {s.wins}-{s.losses}
                              {s.ties ? `-${s.ties}` : ""}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums">
                              {fmt(s.rpi)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                ))}
              </div>
            ) : (
              <div className="mt-5 overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[40rem] border-collapse bg-surface text-sm">
                  <caption className="sr-only">
                    {selected ? `${selected.label} ` : ""}
                    {season.sportName} RPI standings, official and shadow
                  </caption>
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th scope="col" className="px-3 py-2 font-semibold">#</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Team</th>
                      {selected && (
                        <th scope="col" className="px-2 py-2 text-right font-semibold">
                          State
                        </th>
                      )}
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
                    {rows.map((s, i) => (
                      <tr key={s.teamId} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 tabular-nums text-fg-muted">
                          {selected ? (s.groupRank ?? i + 1) : s.stateRank}
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/${sport}/${season.urlYear}/teams/${s.schoolSlug}`}
                            className="font-medium text-link underline"
                          >
                            {s.schoolName}
                          </Link>
                          {!selected && s.groupName && s.groupSlug && (
                            <Link
                              href={`/${sport}/rpi?class=${s.groupSlug.replace(/^class-/, "")}`}
                              className="ml-2 text-xs text-fg-muted underline"
                            >
                              {s.groupName}
                              {s.groupRank ? ` #${s.groupRank}` : ""}
                            </Link>
                          )}
                        </td>
                        {selected && (
                          <td className="px-2 py-2 text-right tabular-nums text-fg-muted">
                            {s.stateRank ?? "—"}
                          </td>
                        )}
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
                            !showsDelta(s)
                              ? "text-fg-muted"
                              : s.delta! > 0
                                ? "text-win"
                                : "text-loss"
                          }`}
                        >
                          {showsDelta(s) ? signed(s.delta!) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

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
                Every team is rated against the whole state, whoever it plays.
                Splitting the table by {groupNoun} recalculates nothing: it
                shows the same ratings, narrowed to the teams a school is
                actually measured against in the postseason.
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
              {visibleWithDelta.length > 0 ? (
                <p className="mt-2">
                  {visibleWithDelta.length} team
                  {visibleWithDelta.length === 1 ? "" : "s"} shown here played
                  someone from out of state, so the assumption is actually
                  moving {visibleWithDelta.length === 1 ? "its" : "their"}{" "}
                  number.
                </p>
              ) : (
                <p className="mt-2">
                  No team shown here has played an out-of-state opponent yet, so
                  the two ratings are identical.
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
