import type { Metadata } from "next";
import Link from "next/link";
import { listDeletedGames, listSports } from "@kyboxscore/db";
import { SiteHeader } from "../../components/site-header";
import { requireAdmin } from "../../../lib/auth";
import { formatSlateDate } from "../../../lib/format";
import { restoreGameAction } from "../../coach/games/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Deleted games",
  robots: { index: false, follow: false },
};

/**
 * Everything that has been taken off the schedule, and a way back.
 *
 * This page is the reason delete is safe to use. Without it a deletion is a
 * decision nobody can revisit, and the first real deletion on this site was
 * wrong within the hour.
 */
export default async function Page() {
  await requireAdmin("/admin/deleted-games");
  const [games, sports] = await Promise.all([listDeletedGames(), listSports()]);

  return (
    <>
      <SiteHeader sports={sports} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-24">
        <Link href="/coach" className="text-sm text-link underline">
          ← Back to your teams
        </Link>
        <h1 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
          Deleted games
        </h1>
        <p className="mt-1 max-w-prose text-sm text-fg-muted">
          Nothing here has been thrown away. A deleted game is hidden from the
          scoreboard, from both teams&rsquo; records and from the RPI, and it
          comes back whole with everything that was entered against it.
        </p>

        {games.length === 0 ? (
          <p className="mt-5 rounded-lg border border-border bg-surface px-4 py-6 text-sm text-fg-muted">
            No games have been deleted.
          </p>
        ) : (
          <ul className="mt-5 overflow-hidden rounded-lg border border-border bg-surface">
            {games.map((g) => (
              <li
                key={g.gameId}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 last:border-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{g.fixture}</span>
                  <span className="block text-sm text-fg-muted">
                    {formatSlateDate(g.localDate)}
                    {g.scoreLine ? ` · ${g.scoreLine}` : ""}
                    {g.status === "final" ? " · final" : ""}
                  </span>
                  <span className="block text-xs text-fg-muted">
                    Deleted {g.deletedAt.slice(0, 16).replace("T", " ")}
                    {g.deletedBy ? ` by ${g.deletedBy}` : ""}
                    {g.plays > 0 || g.statLines > 0
                      ? ` · keeps ${[
                          g.plays > 0 ? `${g.plays} scoring plays` : null,
                          g.statLines > 0 ? `${g.statLines} stat lines` : null,
                        ]
                          .filter(Boolean)
                          .join(" and ")}`
                      : ""}
                  </span>
                </span>
                <form action={restoreGameAction}>
                  <input type="hidden" name="gameId" value={g.gameId} />
                  <button
                    type="submit"
                    className="min-h-11 shrink-0 rounded-md border border-border px-4 text-sm font-medium"
                  >
                    Restore
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
