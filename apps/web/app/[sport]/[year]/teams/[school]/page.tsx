import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getRoster,
  getSportSeason,
  getTeamSchedule,
  getTeamRankings,
  getTeamSeason,
  getTeamSeasonStats,
  listSports,
} from "@kyboxscore/db";
import { SiteHeader } from "../../../../components/site-header";
import { BottomNav } from "../../../../components/bottom-nav";
import { formatShortDate, num, pct } from "../../../../../lib/format";

export const dynamic = "force-dynamic";

async function load(sport: string, year: string, school: string) {
  const season = await getSportSeason(sport, Number(year));
  if (!season) return null;
  const team = await getTeamSeason(season.id, school);
  if (!team) return null;
  return { season, team };
}

export async function generateMetadata(
  props: PageProps<"/[sport]/[year]/teams/[school]">
): Promise<Metadata> {
  const { sport, year, school } = await props.params;
  const data = await load(sport, year, school);
  if (!data) return { title: "Team not found" };
  const { team, season } = data;
  return {
    title: `${team.schoolName} ${season.sportName} ${season.seasonLabel}`,
    description: `${team.schoolName} ${team.mascot ?? ""} ${season.sportName.toLowerCase()} schedule, results, roster and season statistics for ${season.seasonLabel}.`.trim(),
  };
}

export default async function Page(
  props: PageProps<"/[sport]/[year]/teams/[school]">
) {
  const { sport, year, school } = await props.params;
  const data = await load(sport, year, school);
  if (!data) notFound();
  const { season, team } = data;

  const [sports, schedule, roster, stats, ranks] = await Promise.all([
    listSports(),
    getTeamSchedule(season.id, team.teamId),
    getRoster(team.teamSeasonId),
    getTeamSeasonStats(team.teamSeasonId),
    getTeamRankings(season.id, team.schoolSlug),
  ]);

  // "2nd" reads better than "#2" for a district position, which is a placing
  // rather than a rank out of the whole state.
  const ordinal = (n: number) => {
    const suffix =
      n % 100 >= 11 && n % 100 <= 13
        ? "th"
        : ["th", "st", "nd", "rd"][n % 10] ?? "th";
    return `${n}${suffix}`;
  };

  return (
    <>
      <SiteHeader sports={sports} activeSport={sport} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {team.schoolName}
          {team.mascot && (
            <span className="ml-2 font-normal text-fg-muted">{team.mascot}</span>
          )}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
          <span className="tabular font-semibold text-fg">
            {team.wins}-{team.losses}
            {team.ties > 0 ? `-${team.ties}` : ""}
          </span>
          {/* District standing decides postseason placement, so it sits beside
              the overall record rather than buried further down the page. */}
          {team.districtName && (
            <span className="tabular text-fg-muted">
              (District {team.districtWins}-{team.districtLosses})
            </span>
          )}
          {ranks?.stateRank && (
            <>
              <span>·</span>
              <Link href={`/${sport}/rpi`} className="text-link underline">
                State #{ranks.stateRank}
              </Link>
            </>
          )}
          {ranks?.districtRank && team.districtName && (
            <>
              <span>·</span>
              <Link href={`/${sport}/standings`} className="text-link underline">
                {ordinal(ranks.districtRank)} in {team.districtName}
              </Link>
            </>
          )}
          <span>·</span>
          <span>{season.sportName} {season.seasonLabel}</span>
          {team.districtName && (<><span>·</span><span>{team.districtName}</span></>)}
          {team.regionName && (<><span>·</span><span>{team.regionName}</span></>)}
          {team.city && (<><span>·</span><span>{team.city}</span></>)}
        </p>

        <section className="mt-8" aria-labelledby="schedule">
          <h2 id="schedule" className="mb-2 text-xs font-semibold uppercase tracking-widest text-fg-muted">
            Schedule and results
          </h2>
          <ul className="overflow-hidden rounded-lg border border-border bg-surface">
            {schedule.length === 0 && (
              <li className="px-4 py-6 text-center text-fg-muted">No games scheduled.</li>
            )}
            {schedule.map((row) => (
              <li key={row.shortCode} className="border-b border-border last:border-0">
                <Link
                  href={`/${sport}/${season.urlYear}/games/${row.shortCode}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-link"
                >
                  <span className="tabular w-14 shrink-0 text-sm text-fg-muted">
                    {formatShortDate(row.localDate)}
                  </span>
                  <span className="w-8 shrink-0 text-sm text-fg-muted">
                    {row.neutralSite ? "vs" : row.isHome ? "vs" : "at"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{row.opponentName}</span>
                  {row.result ? (
                    <span className="shrink-0 text-sm">
                      <span
                        className={`font-bold ${
                          row.result === "W" ? "text-win" : row.result === "L" ? "text-loss" : "text-fg-muted"
                        }`}
                      >
                        {row.result}
                      </span>
                      <span className="tabular ml-1.5 text-fg-muted">
                        {row.teamScore}-{row.opponentScore}
                      </span>
                    </span>
                  ) : (
                    <span className="shrink-0 text-sm text-scheduled">
                      {row.status === "in_progress" ? "In progress" : "Scheduled"}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8" aria-labelledby="stats">
          <h2 id="stats" className="mb-2 text-xs font-semibold uppercase tracking-widest text-fg-muted">
            Season statistics
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-fg-muted">
                  <th scope="col" className="px-4 py-2 font-semibold">Player</th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">GP</th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">PTS</th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">REB</th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">AST</th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">FG%</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">3PM</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((p) => (
                  <tr key={p.playerId} className="border-b border-border last:border-0">
                    <th scope="row" className="px-4 py-2 text-left font-normal">
                      <span className="tabular mr-2 text-fg-muted">{p.jersey}</span>
                      {p.name}
                    </th>
                    <td className="tabular px-2 py-2 text-right text-fg-muted">{p.gamesPlayed}</td>
                    <td className="tabular px-2 py-2 text-right font-semibold">{num(p.stats.pts)}</td>
                    <td className="tabular px-2 py-2 text-right">{num(p.stats.reb)}</td>
                    <td className="tabular px-2 py-2 text-right">{num(p.stats.ast)}</td>
                    <td className="tabular px-2 py-2 text-right">{pct(p.stats.fg_pct)}</td>
                    <td className="tabular px-4 py-2 text-right">{num(p.stats.tpm)}</td>
                  </tr>
                ))}
                {stats.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-fg-muted">
                      No statistics entered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8" aria-labelledby="roster">
          <h2 id="roster" className="mb-2 text-xs font-semibold uppercase tracking-widest text-fg-muted">
            Roster
          </h2>
          <ul className="grid grid-cols-1 gap-x-6 rounded-lg border border-border bg-surface px-4 py-2 sm:grid-cols-2">
            {roster.map((p) => (
              <li key={p.playerId} className="flex items-baseline gap-3 border-b border-border py-2 last:border-0 sm:last:border-b">
                <span className="tabular w-8 shrink-0 text-right text-fg-muted">{p.jersey}</span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="shrink-0 text-sm text-fg-muted">
                  {p.positions?.join("/")}
                  {p.grade ? ` · ${p.grade}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <BottomNav sportSlug={sport} active="teams" />
    </>
  );
}
