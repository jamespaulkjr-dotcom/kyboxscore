import type { Metadata } from "next";
import Link from "next/link";
import {
  listGamesMissingResults,
  listScheduleConflicts,
  listSports,
} from "@kyboxscore/db";
import { SiteHeader } from "../../components/site-header";
import { requireAdmin } from "../../../lib/auth";
import { formatSlateDate } from "../../../lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Games that need attention",
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

  const [games, conflicts, sports] = await Promise.all([
    listGamesMissingResults({ days, sportSlug: sport }),
    listScheduleConflicts(sport),
    listSports(),
  ]);

  // One entry per team and date, holding the games it cannot be in at once.
  const conflictGroups = new Map<string, (typeof conflicts)[number][]>();
  for (const c of conflicts) {
    const key = `${c.teamId}|${c.localDate}`;
    if (!conflictGroups.has(key)) conflictGroups.set(key, []);
    conflictGroups.get(key)!.push(c);
  }

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
          Games that need attention
        </h1>

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

        {/* Double bookings first. A missing result is work to do; a team in
            two places at once is a row that is definitely wrong, and it stays
            wrong until somebody looks. */}
        {conflictGroups.size > 0 && (
          <section className="mt-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-loss">
              Playing twice on one night
            </h2>
            <p className="mt-1 max-w-prose text-sm text-fg-muted">
              Nobody plays two games in an evening, so one of each pair is
              wrong. Six of these turned out to be games recorded against a
              Kentucky school that shares a name with the real out-of-state
              opponent. Jamborees are excluded, because several opponents in a
              preseason evening is the point of a jamboree.
            </p>
            <ul className="mt-3 space-y-3">
              {[...conflictGroups.values()].map((group) => (
                <li
                  key={`${group[0].teamId}-${group[0].localDate}`}
                  className="overflow-hidden rounded-lg border border-loss/40 bg-surface"
                >
                  <p className="border-b border-border px-4 py-2 text-sm font-medium">
                    {group[0].teamName}
                    <span className="ml-2 font-normal text-fg-muted">
                      {formatSlateDate(group[0].localDate)}
                    </span>
                  </p>
                  <ul>
                    {group.map((c) => (
                      <li key={c.gameId} className="border-b border-border last:border-0">
                        <Link
                          href={`/coach/games/${c.shortCode}`}
                          className="flex items-baseline gap-3 px-4 py-2.5 text-sm hover:bg-surface-raised"
                        >
                          <span className="min-w-0 flex-1">
                            {c.isHome ? "vs " : "at "}
                            <span className="font-medium">{c.opponentName}</span>
                          </span>
                          <span className="shrink-0 text-fg-muted">{c.status}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )}

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-fg-muted">
          No result posted
        </h2>
        <p className="mt-1 max-w-prose text-sm text-fg-muted">
          Games whose date has passed with nothing on them. Postponed and
          canceled games are not here, because somebody has already said what
          happened to those. A game left in progress is: the keeper going home
          at half time leaves the same hole, and it is published as live.
        </p>

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
