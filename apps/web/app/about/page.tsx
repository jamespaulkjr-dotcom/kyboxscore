import type { Metadata } from "next";
import Link from "next/link";
import { getHomeSummaries, listSports } from "@kyboxscore/db";
import { SiteHeader } from "../components/site-header";
import { BottomNav } from "../components/bottom-nav";

// Reads the database for the coverage numbers, and the image has to build
// without one. Every other data-backed page is dynamic for the same reason.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why KY BOXSCORE exists: a free, independent record of Kentucky high school sports — scores, box scores, statistics, district standings and KHSAA RPI, for every sport.",
};

/**
 * The page the front page's "Why this exists" link points at.
 *
 * It carries the claims that do not belong above a scoreboard: free, every
 * sport, independent, and honest about what is not here yet. Text only — the
 * performance budget applies to this page too.
 */
export default async function Page() {
  const [sports, summaries] = await Promise.all([listSports(), getHomeSummaries()]);
  const covered = summaries.filter((s) => s.teams > 0);
  const waiting = summaries.filter((s) => s.teams === 0);

  return (
    <>
      <SiteHeader sports={sports} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-24">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Every Kentucky high school game. Every box score.
        </h1>
        <p className="mt-3 text-base text-fg-muted">
          Free for everyone, no account required, no popups asking you to make
          one.
        </p>

        <Section title="Why this exists">
          <p>
            For twenty-nine years Kentucky high school sports ran on the Riherds
            Scoreboard, built and kept going by one man. It stopped updating on
            June 30, 2026. What replaced it has schedules and scores.
          </p>
          <p>
            What it does not have is the part parents, players and coaches
            actually argue about: box scores, season statistics, statewide
            leaderboards, district standings, and the KHSAA RPI that decides
            postseason seeding. That missing layer is this site.
          </p>
        </Section>

        <Section title="What it costs">
          <p>
            Nothing. There is no subscription, no paywall over a box score, and
            no account needed to read anything. You can follow your teams
            without signing up — that list is kept in your own browser, not on
            our servers.
          </p>
          <p>
            Coaches and athletic directors do get accounts, because submitting
            statistics for a team has to be somebody&rsquo;s name on the record.
          </p>
        </Section>

        <Section title="Every sport, one season at a time">
          <p>
            The site is built sport-agnostic from the schema up, so adding a
            sport is a matter of getting the data, not rewriting anything.
            Right now that means:
          </p>
          <ul className="mt-2 space-y-1.5">
            {covered.map((s) => (
              <li key={s.sportSlug} className="flex flex-wrap items-baseline gap-x-2">
                <Link
                  href={`/${s.sportSlug}/scores`}
                  className="font-medium text-link underline"
                >
                  {s.sportName}
                </Link>
                <span className="text-sm text-fg-muted">
                  {s.teams} teams · {s.players.toLocaleString()} players ·{" "}
                  {(s.gamesPlayed + s.gamesScheduled).toLocaleString()} games
                </span>
              </li>
            ))}
            {waiting.length > 0 && (
              <li className="text-sm text-fg-muted">
                {waiting.map((s) => s.sportName).join(", ")} —{" "}
                {waiting.length === 1 ? "its season" : "their seasons"} will go
                up before the first game is played.
              </li>
            )}
          </ul>
          <p className="mt-3">
            <Link href="/sports" className="text-link underline">
              Every sport and activity the KHSAA sanctions →
            </Link>
          </p>
        </Section>

        <Section title="Where the numbers come from">
          <p>
            Coaches and athletic directors submit them, through our own forms or
            by uploading the same export file they already send elsewhere. We do
            not scrape the KHSAA, ArbiterLive or the Riherds archive — those
            sites prohibit it, and a record built that way would be somebody
            else&rsquo;s to take away.
          </p>
          <p>
            Every record carries where it came from and when it arrived. When a
            coach says a number is wrong, we can show them exactly where it came
            from — and fix it.
          </p>
        </Section>

        <Section title="About the RPI">
          <p>
            We publish the official KHSAA formula: 35% your own winning
            percentage, 35% your opponents&rsquo;, 30% theirs, with a class
            factor for playing up. Margin of victory never counts.
          </p>
          <p>
            We also publish a second number nobody else does. The official
            formula gives every out-of-state opponent a flat .500 record, which
            coaches near the state line have complained about for years. Shadow
            RPI runs the same arithmetic with those opponents&rsquo; real
            records, and shows the difference. Every stored rating keeps its
            inputs, so the arithmetic can be shown to anyone who disputes it.
          </p>
        </Section>

        <Section title="About the players">
          <p>
            Names, schools, jersey numbers, positions, heights, weights and game
            statistics. Nothing else. No addresses, no birthdates, no contact
            information, no photographs. These are minors, and when a field is a
            close call it does not go in.
          </p>
        </Section>

        <Section title="Found something wrong?">
          <p>
            Tell us and it gets fixed. A wrong score, a misspelled name, a
            missing game, a player on the wrong roster —{" "}
            <a className="text-link underline" href="mailto:help@kyboxscore.com">
              help@kyboxscore.com
            </a>
            .
          </p>
          <p>
            If you coach a team and want your statistics on here, the same
            address works, or start at the{" "}
            <Link href="/coach" className="text-link underline">
              coach dashboard
            </Link>
            .
          </p>
        </Section>

        <p className="mt-10 border-t border-border pt-4 text-sm text-fg-muted">
          KY BOXSCORE is an independent record of Kentucky high school sports.
          It is not affiliated with, endorsed by, or operated by the KHSAA.
        </p>
      </main>
      <BottomNav sportSlug={summaries[0]?.sportSlug ?? "football"} />
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      <div className="mt-2 space-y-3 text-fg-muted [&_p]:max-w-prose">
        {children}
      </div>
    </section>
  );
}
