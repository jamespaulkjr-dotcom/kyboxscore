import type { Metadata } from "next";
import Link from "next/link";
import {
  getHomeSummaries,
  getRpiStandings,
  getScoreboard,
  getSportSeason,
  listSports,
} from "@kyboxscore/db";
import { SiteHeader } from "./components/site-header";
import { BottomNav } from "./components/bottom-nav";
import { GameRow } from "./components/game-row";
import { formatSlateDate } from "../lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Kentucky High School Sports · KY BOXSCORE" },
  description:
    "Scores, box scores, statistics, district standings and KHSAA RPI for Kentucky high school sports. Every game. Every box score.",
};

/**
 * The front page.
 *
 * Leads with the most recent slate, because the person arriving is usually
 * looking for a score and the brief's target is finding one in under three
 * seconds. What follows exists to answer the other question - why this and not
 * any other scoreboard - with the two things nobody else publishes: a KHSAA
 * RPI, and district standings ordered by district record.
 *
 * No hero, no carousel, no stock photography. The data is the design.
 */
export default async function Home() {
  const [sports, summaries] = await Promise.all([listSports(), getHomeSummaries()]);

  // The sport actually being played: the one with a recent slate.
  const active = summaries.find((s) => s.slate) ?? summaries[0] ?? null;

  const season = active ? await getSportSeason(active.sportSlug) : null;
  const [games, rpi] = await Promise.all([
    season && active?.slate
      ? getScoreboard(season.id, active.slate)
      : Promise.resolve([]),
    active ? getRpiStandings(active.sportSlug) : Promise.resolve([]),
  ]);

  const shown = games.slice(0, 8);
  const more = games.length - shown.length;

  return (
    <>
      <SiteHeader sports={sports} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5 pb-24">
        <h1 className="sr-only">Kentucky high school sports</h1>

        {active && active.slate ? (
          <section aria-labelledby="latest">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 id="latest" className="text-xl font-bold tracking-tight sm:text-2xl">
                {active.sportName}
              </h2>
              <Link
                href={`/${active.sportSlug}/scores`}
                className="text-sm text-link underline"
              >
                All scores and dates →
              </Link>
            </div>
            <p className="mt-1 text-sm text-fg-muted">
              {formatSlateDate(active.slate)} · {active.seasonLabel}
            </p>

            <ul className="mt-3 overflow-hidden rounded-lg border border-border bg-surface">
              {shown.map((game) => (
                <GameRow
                  key={game.id}
                  game={game}
                  sportSlug={active.sportSlug}
                  urlYear={active.urlYear}
                />
              ))}
            </ul>
            {more > 0 && (
              <p className="mt-2 text-sm">
                <Link href={`/${active.sportSlug}/scores`} className="text-link underline">
                  {more} more {more === 1 ? "game" : "games"} on this date →
                </Link>
              </p>
            )}
          </section>
        ) : (
          <section className="rounded-lg border border-border bg-surface px-4 py-8 text-center">
            <p className="font-medium">No games have been played yet.</p>
            <p className="mt-1 text-sm text-fg-muted">
              Scores appear here as soon as the season starts.
            </p>
          </section>
        )}

        {rpi.length > 0 && active && (
          <section className="mt-10" aria-labelledby="rpi">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 id="rpi" className="text-lg font-bold tracking-tight">
                Statewide RPI
              </h2>
              <Link href={`/${active.sportSlug}/rpi`} className="text-sm text-link underline">
                Full ranking →
              </Link>
            </div>
            <p className="mt-1 max-w-prose text-sm text-fg-muted">
              The KHSAA formula: 35% your own record, 35% your opponents&rsquo;,
              30% theirs. Margin of victory never counts.
            </p>
            <ol className="mt-3 overflow-hidden rounded-lg border border-border bg-surface">
              {rpi.slice(0, 5).map((t) => (
                <li
                  key={t.teamId}
                  className="flex items-baseline gap-3 border-b border-border px-4 py-2.5 last:border-0"
                >
                  <span className="tabular w-6 shrink-0 text-right text-fg-muted">
                    {t.stateRank}
                  </span>
                  <Link
                    href={`/${active.sportSlug}/${active.urlYear}/teams/${t.schoolSlug}`}
                    className="min-w-0 flex-1 truncate font-medium hover:underline"
                  >
                    {t.schoolName}
                  </Link>
                  <span className="tabular shrink-0 text-sm text-fg-muted">
                    {t.wins}-{t.losses}
                  </span>
                  <span className="tabular w-14 shrink-0 text-right font-semibold">
                    {t.rpi.toFixed(3)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="mt-10" aria-labelledby="more">
          <h2 id="more" className="text-lg font-bold tracking-tight">
            The rest of it
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {active && (
              <>
                <HomeLink
                  href={`/${active.sportSlug}/standings`}
                  title="District standings"
                  detail="Ordered by district record — what decides the postseason"
                />
                <HomeLink
                  href={`/${active.sportSlug}/teams`}
                  title={`All ${active.teams} teams`}
                  detail="Records, schedules and rosters"
                />
                <HomeLink
                  href={`/${active.sportSlug}/stats`}
                  title="Statistical leaders"
                  detail="Statewide leaderboards from submitted box scores"
                />
              </>
            )}
            <HomeLink
              href="/sports"
              title="Every KHSAA sport"
              detail="Team sports, individual sports and sport activities"
            />
            <HomeLink
              href="/search"
              title="Search"
              detail="Any school, team or player"
            />
          </ul>
        </section>

        {active && (
          <p className="mt-10 max-w-prose text-sm text-fg-muted">
            {active.players.toLocaleString()} players and{" "}
            {(active.gamesPlayed + active.gamesScheduled).toLocaleString()} games
            across {active.teams} {active.sportName.toLowerCase()} teams.
            An independent record of Kentucky high school sports — not
            affiliated with the KHSAA.
          </p>
        )}
      </main>
      <BottomNav sportSlug={active?.sportSlug ?? "football"} />
    </>
  );
}

function HomeLink({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-14 flex-col justify-center rounded-lg border border-border bg-surface px-4 py-2 hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-link"
      >
        <span className="font-medium">{title}</span>
        <span className="text-sm text-fg-muted">{detail}</span>
      </Link>
    </li>
  );
}
