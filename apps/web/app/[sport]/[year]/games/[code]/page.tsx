import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getBoxScore,
  getGameByCode,
  getGameSides,
  listSports,
} from "@kyboxscore/db";
import { SiteHeader } from "../../../../components/site-header";
import { BottomNav } from "../../../../components/bottom-nav";
import { StatusLabel } from "../../../../components/status";
import { formatSlateDate, num, pct } from "../../../../../lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/[sport]/[year]/games/[code]">
): Promise<Metadata> {
  const { code } = await props.params;
  const game = await getGameByCode(code);
  if (!game) return { title: "Game not found" };
  const sides = await getGameSides(game.id);
  const away = sides.find((s) => s.role === "away");
  const home = sides.find((s) => s.role === "home");
  const score =
    game.status === "final" ? ` ${away?.score}-${home?.score}` : "";
  return {
    title: `${away?.schoolName} at ${home?.schoolName}${score}`,
    description: `Box score and scoring summary: ${away?.schoolName} at ${home?.schoolName}, ${formatSlateDate(game.localDate)}.`,
  };
}

const COLUMNS = [
  { key: "min", label: "MIN" },
  { key: "pts", label: "PTS" },
  { key: "reb", label: "REB" },
  { key: "ast", label: "AST" },
  { key: "stl", label: "STL" },
  { key: "blk", label: "BLK" },
  { key: "tov", label: "TO" },
  { key: "pf", label: "PF" },
] as const;

export default async function Page(
  props: PageProps<"/[sport]/[year]/games/[code]">
) {
  const { sport, year, code } = await props.params;
  const game = await getGameByCode(code);
  if (!game) notFound();

  const [sports, sides] = await Promise.all([listSports(), getGameSides(game.id)]);
  const boxes = await Promise.all(
    sides.map(async (s) => ({ side: s, rows: await getBoxScore(s.participantId) }))
  );

  const periods = Math.max(
    game.regulationPeriods,
    ...sides.map((s) => s.periods.length)
  );
  const detail =
    game.status === "final"
      ? game.periodsPlayed && game.periodsPlayed > game.regulationPeriods
        ? `Final/${game.periodsPlayed - game.regulationPeriods}OT`
        : "Final"
      : game.status === "in_progress"
        ? "In progress"
        : "Scheduled";

  return (
    <>
      <SiteHeader sports={sports} activeSport={sport} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5">
        <p className="text-sm text-fg-muted">
          {formatSlateDate(game.localDate)}
          {game.venueName ? ` · ${game.venueName}` : ""}
          {game.eventName ? ` · ${game.eventName}` : ""}
        </p>

        {/* Line score */}
        <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[420px]">
            <caption className="sr-only">Line score by {game.periodNoun}</caption>
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-fg-muted">
                <th scope="col" className="px-4 py-2 text-left font-semibold">Team</th>
                {Array.from({ length: periods }, (_, i) => (
                  <th key={i} scope="col" className="w-10 px-1 py-2 text-center font-semibold">
                    {i < game.regulationPeriods ? i + 1 : `OT${i - game.regulationPeriods + 1}`}
                  </th>
                ))}
                <th scope="col" className="w-14 px-4 py-2 text-right font-semibold">T</th>
              </tr>
            </thead>
            <tbody>
              {sides.map((s) => {
                const isWinner =
                  s.score !== null &&
                  sides.every((o) => o.participantId === s.participantId || (o.score ?? -1) < s.score!);
                return (
                  <tr key={s.participantId} className="border-b border-border last:border-0">
                    <th scope="row" className="px-4 py-2 text-left font-normal">
                      <Link
                        href={`/${sport}/${year}/teams/${s.schoolSlug}`}
                        className={`hover:underline ${isWinner ? "font-bold" : ""}`}
                      >
                        {s.schoolName}
                      </Link>
                    </th>
                    {Array.from({ length: periods }, (_, i) => (
                      <td key={i} className="tabular px-1 py-2 text-center text-fg-muted">
                        {s.periods[i] ?? "—"}
                      </td>
                    ))}
                    <td className={`tabular px-4 py-2 text-right text-lg ${isWinner ? "font-bold" : "text-fg-muted"}`}>
                      {s.score ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-sm">
          <StatusLabel status={game.status} detail={detail} />
        </p>

        {/* Box scores */}
        {boxes.map(({ side, rows }) => (
          <section key={side.participantId} className="mt-8" aria-labelledby={`box-${side.participantId}`}>
            <h2 id={`box-${side.participantId}`} className="mb-2 text-sm font-bold">
              {side.schoolName}
              <span className="ml-2 text-xs font-normal uppercase tracking-widest text-fg-muted">
                {side.role}
              </span>
            </h2>
            {rows.length === 0 ? (
              <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-fg-muted">
                No box score submitted yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-surface">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-fg-muted">
                      <th scope="col" className="px-4 py-2 font-semibold">Player</th>
                      {COLUMNS.map((c) => (
                        <th key={c.key} scope="col" className="px-2 py-2 text-right font-semibold">{c.label}</th>
                      ))}
                      <th scope="col" className="px-2 py-2 text-right font-semibold">FG</th>
                      <th scope="col" className="px-4 py-2 text-right font-semibold">FG%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const reb = (r.stats.oreb ?? 0) + (r.stats.dreb ?? 0);
                      const fgPct = r.stats.fga ? r.stats.fgm / r.stats.fga : undefined;
                      return (
                        <tr key={r.playerId} className="border-b border-border last:border-0">
                          <th scope="row" className="px-4 py-2 text-left font-normal">
                            <span className="tabular mr-2 text-fg-muted">{r.jersey}</span>
                            {r.name}
                            {r.started && <span className="ml-1 text-xs text-fg-muted">*</span>}
                          </th>
                          {COLUMNS.map((c) => (
                            <td key={c.key} className={`tabular px-2 py-2 text-right ${c.key === "pts" ? "font-semibold" : ""}`}>
                              {c.key === "reb" ? num(reb) : num(r.stats[c.key])}
                            </td>
                          ))}
                          <td className="tabular px-2 py-2 text-right text-fg-muted">
                            {num(r.stats.fgm)}-{num(r.stats.fga)}
                          </td>
                          <td className="tabular px-4 py-2 text-right">{pct(fgPct)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
        <p className="mt-4 text-xs text-fg-muted">* denotes starter</p>
      </main>
      <BottomNav sportSlug={sport} active="scores" />
    </>
  );
}
