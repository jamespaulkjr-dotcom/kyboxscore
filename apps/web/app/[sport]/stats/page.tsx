import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getLeaderboard,
  getSportSeason,
  listLeaderboardStats,
  listSports,
} from "@kyboxscore/db";
import { SiteHeader } from "../../components/site-header";
import { BottomNav } from "../../components/bottom-nav";
import { num, pct } from "../../../lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/[sport]/stats">
): Promise<Metadata> {
  const { sport } = await props.params;
  const name = sport.charAt(0).toUpperCase() + sport.slice(1);
  return {
    title: `${name} leaders`,
    description: `Statewide Kentucky high school ${sport} statistical leaders.`,
  };
}

const RATE_KEYS = new Set(["fg_pct", "tp_pct", "ft_pct", "cmp_pct"]);

export default async function Page(props: PageProps<"/[sport]/stats">) {
  const { sport } = await props.params;
  const { stat } = await props.searchParams;
  const [sports, season] = await Promise.all([listSports(), getSportSeason(sport)]);
  if (!season) notFound();

  const categories = await listLeaderboardStats(sport);
  const active =
    (typeof stat === "string" && categories.find((c) => c.key === stat)?.key) ??
    categories[0]?.key;
  const rows = active ? await getLeaderboard(season.id, active, 25) : [];
  const isRate = active ? RATE_KEYS.has(active) : false;

  return (
    <>
      <SiteHeader sports={sports} activeSport={sport} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
          {season.sportName} leaders
        </h1>
        <p className="text-sm text-fg-muted">Statewide · {season.seasonLabel}</p>
        <p className="mt-2 text-sm">
          <Link href={`/${sport}/rpi`} className="text-link underline">
            RPI ratings and rankings →
          </Link>
        </p>

        <nav aria-label="Statistic" className="mt-4 flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <Link
              key={c.key}
              href={`/${sport}/stats?stat=${c.key}`}
              aria-current={c.key === active ? "page" : undefined}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                c.key === active
                  ? "bg-brand-fill text-on-brand"
                  : "border border-border text-fg-muted hover:bg-surface hover:text-fg"
              }`}
            >
              {c.abbrev}
            </Link>
          ))}
        </nav>

        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
          <ol>
            {rows.map((r) => (
              <li key={r.playerSlug} className="flex items-baseline gap-3 border-b border-border px-4 py-3 last:border-0">
                <span className="tabular w-6 shrink-0 text-right text-sm text-fg-muted">{r.rank}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.playerName}</span>
                  <Link
                    href={`/${sport}/${season.urlYear}/teams/${r.schoolSlug}`}
                    className="block truncate text-sm text-fg-muted hover:underline"
                  >
                    {r.schoolName}
                  </Link>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tabular block text-lg font-bold leading-tight">
                    {isRate ? pct(r.value) : num(r.value)}
                  </span>
                  <span className="tabular block text-xs text-fg-muted">
                    {isRate ? `${r.gamesPlayed} GP` : `${num(r.perGame, 1)}/g · ${r.gamesPlayed} GP`}
                  </span>
                </span>
              </li>
            ))}
            {rows.length === 0 && (
              <li className="px-4 py-8 text-center text-fg-muted">
                No qualifying players yet this season.
              </li>
            )}
          </ol>
        </div>
        <p className="mt-3 text-sm text-fg-muted">
          Leaders are gated by the minimums attached to each statistic, so a
          single hot night cannot top a percentage board.
        </p>
      </main>
      <BottomNav sportSlug={sport} active="stats" />
    </>
  );
}
