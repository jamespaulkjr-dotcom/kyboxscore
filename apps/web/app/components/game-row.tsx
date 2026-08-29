import Link from "next/link";
import type { ScoreboardGame } from "@kyboxscore/db";
import { StatusLabel } from "./status";
import { formatTipTime, zoneAbbrev } from "../../lib/format";

function statusDetail(g: ScoreboardGame): string {
  switch (g.status) {
    case "final":
      return g.periodsPlayed && g.periodsPlayed > 4
        ? `Final/${g.periodsPlayed - 4}OT`
        : "Final";
    case "in_progress":
      return "In progress";
    case "postponed":
      return "Postponed";
    case "canceled":
      return "Canceled";
    case "forfeit":
      return "Forfeit";
    default:
      return (
        formatTipTime(g.startsAt, g.timeZone) ?? `TBA ${zoneAbbrev(g.timeZone)}`
      );
  }
}

export function GameRow({
  game,
  sportSlug,
  urlYear,
}: {
  game: ScoreboardGame;
  sportSlug: string;
  urlYear: number;
}) {
  const played = game.home.score !== null && game.away.score !== null;
  const homeWon = played && game.home.score! > game.away.score!;
  const awayWon = played && game.away.score! > game.home.score!;

  const sides = [
    { side: game.away, won: awayWon },
    { side: game.home, won: homeWon },
  ];

  return (
    <li className="relative border-b border-border last:border-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1 space-y-1">
          {sides.map(({ side, won }) => (
            <div key={side.teamId} className="flex items-baseline gap-3">
              <Link
                href={`/${sportSlug}/${urlYear}/teams/${side.schoolSlug}`}
                className={`relative z-10 truncate hover:underline ${
                  played && !won ? "text-fg-muted" : "font-semibold text-fg"
                }`}
              >
                {side.shortName ?? side.schoolName}
              </Link>
              <span className="flex-1" />
              {side.score !== null && (
                <span
                  className={`tabular shrink-0 text-lg leading-none ${
                    won ? "font-bold text-fg" : "text-fg-muted"
                  }`}
                >
                  {side.score}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="w-28 shrink-0 text-right text-sm">
          <StatusLabel status={game.status} detail={statusDetail(game)} />
        </div>
      </div>
      {/* Whole row is a link to the game, but team links stay clickable. */}
      <Link
        href={`/${sportSlug}/${urlYear}/games/${game.shortCode}`}
        className="absolute inset-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-link"
        aria-label={`Box score: ${game.away.schoolName} at ${game.home.schoolName}`}
      />
    </li>
  );
}
