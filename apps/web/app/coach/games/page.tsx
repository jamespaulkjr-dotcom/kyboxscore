import type { Metadata } from "next";
import Link from "next/link";
import {
  listScorableDates,
  listScorableGames,
  listSports,
  type ScorableGame,
} from "@kyboxscore/db";
import { SiteHeader } from "../../components/site-header";
import { requireUser } from "../../../lib/auth";
import { formatShortDate, formatSlateDate } from "../../../lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Scores",
  robots: { index: false, follow: false },
};

export default async function Page(props: PageProps<"/coach/games">) {
  const user = await requireUser("/coach/games");
  const params = await props.searchParams;
  const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : null;
  const date = one(params.date);
  const query = one(params.q);

  const [{ games, truncated }, dates, sports] = await Promise.all([
    listScorableGames(user.id, { date, query }),
    listScorableDates(user.id),
    listSports(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const totalGames = dates.reduce((n, d) => n + d.games, 0);

  // Anything being scored right now goes to the top, on its own, and comes
  // out of its date group so it is not in two places at once. On a Friday with
  // a hundred games the one you are actually keeping should never need
  // finding.
  const live = games.filter((g) => g.isLive);
  const rest = games.filter((g) => !g.isLive);

  // The rest grouped by date, each group in kick-off order. Somebody holding
  // one team sees a short list either way; somebody holding every school in
  // Kentucky sees a hundred rows, and a date heading is the difference between
  // scanning that and giving up.
  const byDate = new Map<string, (typeof games)[number][]>();
  for (const g of rest) {
    if (!byDate.has(g.localDate)) byDate.set(g.localDate, []);
    byDate.get(g.localDate)!.push(g);
  }

  const href = (next: { date?: string | null; q?: string | null }) => {
    const sp = new URLSearchParams();
    const d = next.date === undefined ? date : next.date;
    const q = next.q === undefined ? query : next.q;
    if (d) sp.set("date", d);
    if (q) sp.set("q", q);
    const s = sp.toString();
    return s ? `/coach/games?${s}` : "/coach/games";
  };

  const chip = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link ${
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
          Scores
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          Tap a game to keep the score live, or just post the final when it is
          over.
        </p>

        {/* Dates are the navigation. Holding one team this is a short strip;
            holding every school in Kentucky it is how you say "Friday" without
            knowing a single school name. */}
        {dates.length > 1 && (
          <nav aria-label="Date" className="mt-4">
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              <Link href={href({ date: null })} className={chip(!date)}>
                All {totalGames}
              </Link>
              {dates.map((d) => (
                <Link
                  key={d.localDate}
                  href={href({ date: d.localDate })}
                  aria-current={date === d.localDate ? "page" : undefined}
                  className={`${chip(date === d.localDate)} ${
                    d.isPast && date !== d.localDate ? "opacity-60" : ""
                  }`}
                >
                  {d.localDate === today ? "Today" : formatShortDate(d.localDate)}
                  <span className="ml-1.5 font-normal text-fg-muted">
                    {d.games}
                  </span>
                </Link>
              ))}
            </div>
          </nav>
        )}

        {/* And a plain box for when you half-remember a name. Partial is fine,
            either team matches, and it works with JavaScript off. */}
        <form method="get" className="mt-3 flex gap-2">
          {date && <input type="hidden" name="date" value={date} />}
          <input
            name="q"
            defaultValue={query ?? ""}
            placeholder="Narrow by school"
            aria-label="Narrow by school"
            className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-surface px-3"
          />
          <button
            type="submit"
            className="min-h-11 shrink-0 rounded-md border border-border px-4 text-sm font-medium"
          >
            Find
          </button>
          {query && (
            <Link
              href={href({ q: null })}
              className="flex min-h-11 shrink-0 items-center px-2 text-sm text-link underline"
            >
              Clear
            </Link>
          )}
        </form>

        {live.length > 0 && (
          <section className="mt-5">
            <h2 className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-fg-muted">
              <span className="inline-flex items-center gap-1 rounded-full bg-live-fill px-1.5 py-0.5 text-xs font-bold tracking-wide text-on-live">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-on-live motion-safe:animate-pulse"
                  aria-hidden
                />
                Live
              </span>
              being scored now
            </h2>
            <GameList games={live} showDate />
          </section>
        )}

        {games.length === 0 ? (
          <p className="mt-5 rounded-lg border border-border bg-surface px-4 py-6 text-sm text-fg-muted">
            {totalGames === 0 ? (
              <>
                No games are scheduled for your teams yet. Email{" "}
                <a className="text-link underline" href="mailto:help@kyboxscore.com">
                  help@kyboxscore.com
                </a>{" "}
                if your schedule is missing.
              </>
            ) : (
              <>
                Nothing matches that.{" "}
                <Link href="/coach/games" className="text-link underline">
                  Show everything
                </Link>
              </>
            )}
          </p>
        ) : (
          [...byDate.entries()].map(([groupDate, list]) => (
            <section key={groupDate} className="mt-5">
              <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-fg-muted">
                {groupDate === today ? "Today" : formatSlateDate(groupDate)}
              </h2>
              <GameList games={list} showDate={false} />
            </section>
          ))
        )}

        {truncated && (
          <p className="mt-5 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
            That is as many as this page shows at once. Pick a date above, or
            narrow by school, to see the rest.
          </p>
        )}
      </main>
    </>
  );
}

/**
 * One renderer for both the pinned live group and the date groups, so they
 * cannot drift apart. The pinned group carries its own date, because a game
 * lifted out of Friday still needs to say it is Friday's.
 */
function GameList({
  games,
  showDate,
}: {
  games: ScorableGame[];
  showDate: boolean;
}) {
  return (
    <ul className="overflow-hidden rounded-lg border border-border bg-surface">
      {games.map((g) => (
        <li key={g.gameId} className="border-b border-border last:border-0">
          <Link
            href={`/coach/games/${g.shortCode}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-link"
          >
            <span className="min-w-0 flex-1">
              {/* Away at home, the way the rest of the site reads a fixture.
                  Your own team is the bold one. */}
              <span className="block truncate font-medium">
                <span
                  className={
                    g.awayIsMine ? "font-semibold" : "font-normal text-fg-muted"
                  }
                >
                  {g.awayName}
                </span>
                <span className="font-normal text-fg-muted"> at </span>
                <span
                  className={
                    g.homeIsMine ? "font-semibold" : "font-normal text-fg-muted"
                  }
                >
                  {g.homeName}
                </span>
              </span>
              <span className="block text-sm text-fg-muted">
                {showDate ? `${formatShortDate(g.localDate)} · ` : ""}
                {g.localTime ?? "Time to be confirmed"}
              </span>
            </span>
            {g.isLive && (
              <span className="shrink-0 rounded-full bg-live-fill px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-on-live">
                Live
              </span>
            )}
            {g.awayScore !== null && g.homeScore !== null && (
              <span className="tabular shrink-0 font-semibold">
                {g.awayScore}–{g.homeScore}
              </span>
            )}
            {g.status === "scheduled" && !g.isLive && (
              <span className="shrink-0 text-sm text-scheduled">Not started</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
