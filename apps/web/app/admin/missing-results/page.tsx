import type { Metadata } from "next";
import Link from "next/link";
import { listGamesMissingResults, listSports } from "@kyboxscore/db";
import { SiteHeader } from "../../components/site-header";
import { requireAdmin } from "../../../lib/auth";
import { formatSlateDate } from "../../../lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Games without a result",
  robots: { index: false, follow: false },
};

const WINDOWS = [
  { days: 7, label: "Last week" },
  { days: 21, label: "Last 3 weeks" },
  { days: 120, label: "All season" },
];

/**
 * Every game whose date has passed with nothing on it.
 *
 * Closing out a Friday used to mean reconciling a hundred-row list by hand to
 * find the dozen gaps. This is the gaps, and nothing else.
 */
export default async function Page(props: PageProps<"/admin/missing-results">) {
  await requireAdmin("/admin/missing-results");
  const params = await props.searchParams;
  const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : null;
  const days = Number(one(params.days)) || 21;
  const sport = one(params.sport);

  const [games, sports] = await Promise.all([
    listGamesMissingResults({ days, sportSlug: sport }),
    listSports(),
  ]);

  const byDate = new Map<string, (typeof games)[number][]>();
  for (const g of games) {
    if (!byDate.has(g.localDate)) byDate.set(g.localDate, []);
    byDate.get(g.localDate)!.push(g);
  }

  const href = (next: { days?: number; sport?: string | null }) => {
    const p = new URLSearchParams();
    const d = next.days ?? days;
    const s = next.sport === undefined ? sport : next.sport;
    if (d !== 21) p.set("days", String(d));
    if (s) p.set("sport", s);
    const q = p.toString();
    return q ? `/admin/missing-results?${q}` : "/admin/missing-results";
  };
  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${
      active
        ? "border-accent bg-accent-fill text-on-accent"
        : "border-border bg-surface text-fg hover:bg-surface-raised"
    }`;

  return (
    <>
      <SiteHeader sports={sports} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-24">
        <Link href="/coach" className="text-sm text-link underline">
          ← Back to your teams
        </Link>
        <h1 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
          Games without a result
        </h1>
        <p className="mt-1 max-w-prose text-sm text-fg-muted">
          Games whose date has passed with nothing posted. Postponed and
          canceled games are not here, because somebody has already said what
          happened to those. A game left in progress is: the keeper going home
          at half time leaves the same hole, and it is published as live.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {WINDOWS.map((w) => (
            <Link key={w.days} href={href({ days: w.days })} className={chip(days === w.days)}>
              {w.label}
            </Link>
          ))}
          <span className="w-full sm:hidden" />
          <Link href={href({ sport: null })} className={chip(!sport)}>
            All sports
          </Link>
          {sports.map((s) => (
            <Link key={s.slug} href={href({ sport: s.slug })} className={chip(sport === s.slug)}>
              {s.name}
            </Link>
          ))}
        </div>

        {games.length === 0 ? (
          <p className="mt-6 rounded-lg border border-win bg-surface px-4 py-6 text-center">
            <span className="font-medium text-win">Everything is accounted for.</span>
            <span className="mt-1 block text-sm text-fg-muted">
              No game in this window is missing a result.
            </span>
          </p>
        ) : (
          <>
            <p className="mt-5 text-sm font-medium">
              {games.length} {games.length === 1 ? "game needs" : "games need"} a
              result
            </p>
            {[...byDate.entries()].map(([date, list]) => (
              <section key={date} className="mt-5">
                <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-fg-muted">
                  {formatSlateDate(date)}
                  <span className="ml-2 font-normal normal-case tracking-normal">
                    {list[0].daysAgo} {list[0].daysAgo === 1 ? "day" : "days"} ago
                    {" · "}
                    {list.length}
                  </span>
                </h2>
                <ul className="overflow-hidden rounded-lg border border-border bg-surface">
                  {list.map((g) => (
                    <li key={g.gameId} className="border-b border-border last:border-0">
                      <Link
                        href={`/coach/games/${g.shortCode}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-link"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {g.awayName}
                            <span className="font-normal text-fg-muted"> at </span>
                            {g.homeName}
                          </span>
                          <span className="block text-sm text-fg-muted">
                            {g.localTime ?? "time not set"}
                            {sports.length > 1 ? ` · ${g.sportName}` : ""}
                          </span>
                        </span>
                        {/* A part-scored game is a different problem from an
                            untouched one, so it says so. */}
                        {g.status === "in_progress" ? (
                          <span className="shrink-0 text-right text-sm">
                            <span className="block font-medium text-live">
                              still open
                            </span>
                            {g.awayScore !== null && g.homeScore !== null && (
                              <span className="tabular block text-fg-muted">
                                {g.awayScore}–{g.homeScore}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="shrink-0 text-sm text-scheduled">
                            nothing entered
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </main>
    </>
  );
}
