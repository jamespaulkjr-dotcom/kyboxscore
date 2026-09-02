import type { Metadata } from "next";
import Link from "next/link";
import { listScorableGames, listSports } from "@kyboxscore/db";
import { SiteHeader } from "../../components/site-header";
import { requireUser } from "../../../lib/auth";
import { formatSlateDate } from "../../../lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Scores",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const user = await requireUser("/coach/games");
  const [games, sports] = await Promise.all([
    listScorableGames(user.id),
    listSports(),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  // Grouped by date, and each group kept in kick-off order. Somebody holding
  // one team sees a short list either way; somebody holding every school in
  // Kentucky sees a hundred rows, and a date heading is the difference between
  // scanning them and giving up.
  const byDate = new Map<string, (typeof games)[number][]>();
  for (const g of games) {
    if (!byDate.has(g.localDate)) byDate.set(g.localDate, []);
    byDate.get(g.localDate)!.push(g);
  }

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
          Every game your teams are in. Tap one to keep the score live, or just
          post the final when it is over.
        </p>

        {games.length === 0 ? (
          <p className="mt-5 rounded-lg border border-border bg-surface px-4 py-6 text-sm text-fg-muted">
            No games are scheduled for your teams yet. Email{" "}
            <a className="text-link underline" href="mailto:help@kyboxscore.com">
              help@kyboxscore.com
            </a>{" "}
            if your schedule is missing.
          </p>
        ) : (
          [...byDate.entries()].map(([date, list]) => (
          <section key={date} className="mt-5">
            <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-fg-muted">
              {date === today ? "Today" : formatSlateDate(date)}
            </h2>
          <ul className="overflow-hidden rounded-lg border border-border bg-surface">
            {list.map((g) => (
              <li key={g.gameId} className="border-b border-border last:border-0">
                <Link
                  href={`/coach/games/${g.shortCode}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-link"
                >
                  <span className="min-w-0 flex-1">
                    {/* Away at home, the way the rest of the site reads a
                        fixture. "at Breckinridge County" on its own left an
                        administrator holding every school with no idea who was
                        visiting. Your own team is the bold one. */}
                    <span className="block truncate font-medium">
                      <span className={g.awayIsMine ? "font-semibold" : "font-normal text-fg-muted"}>
                        {g.awayName}
                      </span>
                      <span className="font-normal text-fg-muted"> at </span>
                      <span className={g.homeIsMine ? "font-semibold" : "font-normal text-fg-muted"}>
                        {g.homeName}
                      </span>
                    </span>
                    <span className="block text-sm text-fg-muted">
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
                    <span className="shrink-0 text-sm text-scheduled">
                      Not started
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          </section>
          ))
        )}
      </main>
    </>
  );
}
