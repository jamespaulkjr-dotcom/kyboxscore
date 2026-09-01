import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getScoringGame, listGameRoster } from "@kyboxscore/db";
import { ScoringConsole } from "../../components/scoring-console";
import { resolveScorer } from "../../../lib/scoring-auth";
import { formatSlateDate } from "../../../lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Keep score",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The keeper's console. Same component the coach sees, minus delegation — a
 * link cannot hand out further links.
 *
 * No site header and no sport navigation: this is a tool for one job, held in
 * one hand, and every extra tappable thing on it is a way to lose the game.
 */
export default async function Page(props: PageProps<"/score/[code]">) {
  const { code } = await props.params;
  const game = await getScoringGame(code);
  if (!game) notFound();

  const scorer = await resolveScorer(game.id);
  if (!scorer) notFound();

  const roster = await listGameRoster(game.id);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-24">
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
        {game.away.shortName ?? game.away.schoolName} at{" "}
        {game.home.shortName ?? game.home.schoolName}
      </h1>
      <p className="mt-1 text-sm text-fg-muted">
        {formatSlateDate(game.localDate)}
        {game.localTime ? ` · ${game.localTime}` : ""}
      </p>

      <div className="mt-5">
        <ScoringConsole game={game} scorerLabel={scorer.label} roster={roster} />
      </div>

      <p className="mt-10 border-t border-border pt-4 text-sm text-fg-muted">
        Everything you tap here is public within seconds, on{" "}
        <Link
          href={`/${game.sportSlug}/${game.urlYear}/games/${game.shortCode}`}
          className="text-link underline"
        >
          the game page
        </Link>
        . If you get something wrong, undo it. Nobody minds.
      </p>
    </main>
  );
}
