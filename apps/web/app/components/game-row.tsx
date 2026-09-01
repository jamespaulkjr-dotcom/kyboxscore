"use client";

import Link from "next/link";
import type { ScoreboardGame } from "@kyboxscore/db";
import { StatusLabel } from "./status";
import { useLiveGame } from "./live-scores";
import { formatTipTime, zoneAbbrev } from "../../lib/format";

function statusDetail(g: ScoreboardGame): string {
  switch (g.status) {
    case "final":
      return g.periodsPlayed && g.periodsPlayed > 4
        ? `Final/${g.periodsPlayed - 4}OT`
        : "Final";
    case "in_progress":
      // Started, but nobody has moved the score in hours. The keeper went
      // home; say so rather than pretending the game is still on.
      if (!g.isLive) return "Awaiting final";
      // Whichever period the last score landed in, which is the best guess
      // available without a game clock we do not have.
      if (!g.periodsPlayed) return "In progress";
      return g.periodsPlayed > 4 ? `OT${g.periodsPlayed - 4}` : `Q${g.periodsPlayed}`;
    case "postponed":
      return "Postponed";
    case "canceled":
      return "Canceled";
    case "forfeit":
      return "Forfeit";
    default:
      // local_time is what schedules actually carry. starts_at is an exact
      // instant we rarely know, and every game imported so far has none - so
      // preferring it printed "TBA" for a thousand games whose kick-off we
      // knew perfectly well.
      return (
        g.localTime ??
        formatTipTime(g.startsAt, g.timeZone) ??
        `TBA ${zoneAbbrev(g.timeZone)}`
      );
  }
}

export function GameRow({
  game: server,
  sportSlug,
  urlYear,
}: {
  game: ScoreboardGame;
  sportSlug: string;
  urlYear: number;
}) {
  // A game being played right now gets its numbers from the poll instead of
  // from the render. Everything else on the row is server-rendered and stays
  // readable with JavaScript off.
  const live = useLiveGame(server.shortCode);
  const game: ScoreboardGame = live
    ? {
        ...server,
        status: live.status as ScoreboardGame["status"],
        periodsPlayed: live.periodsPlayed,
        // Anything the poll returns is live by definition: the endpoint only
        // ever reports games somebody is actively keeping.
        isLive: true,
        home: { ...server.home, score: live.home },
        away: { ...server.away, score: live.away },
      }
    : server;

  // Nobody has won anything yet while it is still being played, so the
  // winner emphasis waits for full time.
  const played =
    game.status !== "in_progress" &&
    game.home.score !== null &&
    game.away.score !== null;
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
          <StatusLabel
            status={game.status}
            detail={statusDetail(game)}
            isLive={game.isLive}
          />
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
