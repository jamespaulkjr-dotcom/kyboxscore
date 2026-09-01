import type { Metadata } from "next";
import Link from "next/link";
import {
  type HomeSummary,
  getHomeSummaries,
  getRpiStandings,
  getScoreboard,
  getSportSeason,
  listSports,
} from "@kyboxscore/db";
import { SiteHeader } from "./components/site-header";
import { BottomNav } from "./components/bottom-nav";
import { GameRow } from "./components/game-row";
import { Following } from "./components/following";
import { LiveScores } from "./components/live-scores";
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

  // The sport actually being played: the one whose most recent slate is the
  // most recent, not the first in display order. Taking the first would pin
  // the front page to football's last September game all through basketball
  // season, because football's slate never stops existing once it has one.
  const active =
    summaries
      .filter((s) => s.slate)
      .sort((a, b) => (a.slate! < b.slate! ? 1 : a.slate! > b.slate! ? -1 : 0))[0] ??
    summaries.find((s) => s.teams > 0) ??
    summaries[0] ??
    null;

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
        {/* The h1 used to be screen-reader-only, which left a first-time
            visitor to work out what the site was from a football scoreboard.
            It is two lines of text: no hero, no image, and it does not push
            the scores off a phone screen. */}
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
          Every Kentucky high school game. Every box score.
        </h1>
        <p className="mt-1 max-w-prose text-sm text-fg-muted">
          Scores, statistics, district standings and KHSAA RPI — for every
          sport, free for everyone, no account required.{" "}
          <Link href="/about" className="text-link underline">
            Why this exists
          </Link>
        </p>

        {/* Renders nothing until somebody follows a team, so a first-time
            visitor is not shown an empty promise. */}
        {active && <Following sport={active.sportSlug} />}

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

            <LiveScores
              sportSlug={active.sportSlug}
              enabled={
                games.some((g) => g.status === "in_progress") ||
                active.slate === new Date().toISOString().slice(0, 10)
              }
            >
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
            </LiveScores>
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

        {/* James asked why the site looks like football. It is because
            football is the only sport with data in it - the page picks
            whichever sport has a recent slate. This section says so plainly
            rather than letting a volleyball parent draw their own conclusion. */}
        <section className="mt-10" aria-labelledby="sports">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <h2 id="sports" className="text-lg font-bold tracking-tight">
              Every sport
            </h2>
            <Link href="/sports" className="text-sm text-link underline">
              All KHSAA sports →
            </Link>
          </div>
          <p className="mt-1 max-w-prose text-sm text-fg-muted">
            Sports arrive one season at a time, and we would rather show you an
            empty season than a wrong one.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {summaries.map((s) => (
              <SportCard key={s.sportSlug} summary={s} />
            ))}
          </ul>
        </section>

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

/**
 * One sport, and an honest sentence about how much of it we actually have.
 * A sport with nothing in it still gets a row: hiding it would imply the site
 * is only ever going to be football.
 */
function SportCard({ summary }: { summary: HomeSummary }) {
  const has = summary.teams > 0;
  const detail = !has
    ? `${summary.seasonLabel} — nothing yet`
    : summary.gamesPlayed > 0
      ? `${summary.gamesPlayed.toLocaleString()} games played · ${summary.teams} teams · ${summary.players.toLocaleString()} players`
      : summary.gamesScheduled > 0
        ? `Schedule up · ${summary.teams} teams`
        : `${summary.teams} teams · season not started`;

  return (
    <li>
      <Link
        href={`/${summary.sportSlug}/scores`}
        className="flex min-h-14 flex-col justify-center rounded-lg border border-border bg-surface px-4 py-2 hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-link"
      >
        <span className="font-medium">
          {summary.sportName}
          {!has && (
            <span className="ml-2 rounded-full border border-border px-2 py-0.5 align-middle text-xs font-normal text-fg-muted">
              Coming
            </span>
          )}
        </span>
        <span className="text-sm text-fg-muted">{detail}</span>
      </Link>
    </li>
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
