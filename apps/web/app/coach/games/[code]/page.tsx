import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getScoringGame,
  listGameRoster,
  listScorekeepers,
  listSports,
} from "@kyboxscore/db";
import { SiteHeader } from "../../../components/site-header";
import { ScoringConsole } from "../../../components/scoring-console";
import { isAdmin, requireUser } from "../../../../lib/auth";
import { resolveScorer } from "../../../../lib/scoring-auth";
import { formatSlateDate } from "../../../../lib/format";
import { ResetGame } from "./reset";
import { ShareScoring } from "./share";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Keep score",
  robots: { index: false, follow: false },
};

export default async function Page(props: PageProps<"/coach/games/[code]">) {
  const { code } = await props.params;
  const user = await requireUser(`/coach/games/${code}`);

  const game = await getScoringGame(code);
  if (!game) notFound();

  // A signed-in user without a grant on either side gets a 404, not a 403:
  // there is no reason to confirm which games exist.
  const scorer = await resolveScorer(game.id);
  if (!scorer) notFound();

  const [sports, roster, homeKeepers, awayKeepers] = await Promise.all([
    listSports(),
    listGameRoster(game.id),
    listScorekeepers(game.id, game.home.teamId),
    listScorekeepers(game.id, game.away.teamId),
  ]);

  return (
    <>
      <SiteHeader sports={sports} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-24">
        <Link href="/coach/games" className="text-sm text-link underline">
          ← All your games
        </Link>
        <h1 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
          {game.away.shortName ?? game.away.schoolName} at{" "}
          {game.home.shortName ?? game.home.schoolName}
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          {formatSlateDate(game.localDate)}
          {game.localTime ? ` · ${game.localTime}` : ""} ·{" "}
          <Link
            href={`/${game.sportSlug}/${game.urlYear}/games/${game.shortCode}`}
            className="text-link underline"
          >
            public game page
          </Link>
        </p>

        <div className="mt-5">
          <ScoringConsole game={game} scorerLabel={scorer.label} roster={roster} />
        </div>

        {scorer.canDelegate && (
          <ShareScoring
            code={game.shortCode}
            sides={[
              {
                teamId: game.home.teamId,
                name: game.home.shortName ?? game.home.schoolName,
                keepers: homeKeepers,
              },
              {
                teamId: game.away.teamId,
                name: game.away.shortName ?? game.away.schoolName,
                keepers: awayKeepers,
              },
            ]}
          />
        )}

        {/* Last on the page, under everything, because it is the only control
            here that destroys something. */}
        {isAdmin(user) && <ResetGame code={game.shortCode} />}
      </main>
    </>
  );
}
