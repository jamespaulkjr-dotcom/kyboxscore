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
          <ul className="mt-5 overflow-hidden rounded-lg border border-border bg-surface">
            {games.map((g) => (
              <li key={g.gameId} className="border-b border-border last:border-0">
                <Link
                  href={`/coach/games/${g.shortCode}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-link"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {g.isHome ? "vs" : "at"} {g.opponentName}
                    </span>
                    <span className="block text-sm text-fg-muted">
                      {g.localDate === today
                        ? "Today"
                        : formatSlateDate(g.localDate)}
                      {g.localTime ? ` · ${g.localTime}` : ""}
                    </span>
                  </span>
                  {g.isLive && (
                    <span className="shrink-0 rounded-full bg-live-fill px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-on-live">
                      Live
                    </span>
                  )}
                  {g.ourScore !== null && g.theirScore !== null && (
                    <span className="tabular shrink-0 font-semibold">
                      {g.ourScore}–{g.theirScore}
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
        )}
      </main>
    </>
  );
}
