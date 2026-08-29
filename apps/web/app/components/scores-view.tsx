import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getScoreboard,
  getSlateDates,
  getSportSeason,
  listSports,
  resolveSlateDate,
} from "@kyboxscore/db";
import { SiteHeader } from "./site-header";
import { BottomNav } from "./bottom-nav";
import { GameRow } from "./game-row";
import { formatSlateDate, formatShortDate } from "../../lib/format";

export async function ScoresView({
  sportSlug,
  date,
}: {
  sportSlug: string;
  date?: string;
}) {
  const [sports, season] = await Promise.all([
    listSports(),
    getSportSeason(sportSlug),
  ]);
  if (!season) notFound();

  const slate = await resolveSlateDate(season.id, date);
  const [games, allDates] = await Promise.all([
    slate ? getScoreboard(season.id, slate) : Promise.resolve([]),
    getSlateDates(season.id),
  ]);

  const idx = allDates.findIndex((d) => d.localDate === slate);
  const prev = idx > 0 ? allDates[idx - 1] : null;
  const next = idx >= 0 && idx < allDates.length - 1 ? allDates[idx + 1] : null;

  // Group by region/class. Ungrouped games (out of state, independents) last.
  const groups = new Map<string, typeof games>();
  for (const g of games) {
    const key = g.groupName ?? "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(g);
  }

  return (
    <>
      <SiteHeader sports={sports} activeSport={sportSlug} />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              {season.sportName} scores
            </h1>
            <p className="text-sm text-fg-muted">
              {slate ? formatSlateDate(slate) : "No games scheduled"}
              <span className="mx-1.5">·</span>
              {season.seasonLabel}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <DateStep
              href={prev ? `/${sportSlug}/scores/${prev.localDate}` : null}
              label={prev ? formatShortDate(prev.localDate) : "Earlier"}
              dir="prev"
            />
            <DateStep
              href={next ? `/${sportSlug}/scores/${next.localDate}` : null}
              label={next ? formatShortDate(next.localDate) : "Later"}
              dir="next"
            />
          </div>
        </div>

        {games.length === 0 ? (
          <p className="mt-10 rounded-lg border border-border bg-surface px-4 py-8 text-center text-fg-muted">
            No {season.sportName.toLowerCase()} games on this date.
          </p>
        ) : (
          <div className="mt-5 space-y-6">
            {[...groups.entries()].map(([group, list]) => (
              <section key={group} aria-labelledby={`grp-${group}`}>
                <h2
                  id={`grp-${group}`}
                  className="mb-2 text-xs font-semibold uppercase tracking-widest text-fg-muted"
                >
                  {group}
                </h2>
                <ul className="overflow-hidden rounded-lg border border-border bg-surface">
                  {list.map((g) => (
                    <GameRow
                      key={g.id}
                      game={g}
                      sportSlug={sportSlug}
                      urlYear={season.urlYear}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>

      <BottomNav sportSlug={sportSlug} active="scores" />
    </>
  );
}

function DateStep({
  href,
  label,
  dir,
}: {
  href: string | null;
  label: string;
  dir: "prev" | "next";
}) {
  const arrow = dir === "prev" ? "‹" : "›";
  const cls =
    "inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 text-sm";
  if (!href) {
    return (
      <span className={`${cls} cursor-default text-fg-muted opacity-50`} aria-disabled>
        {dir === "prev" ? arrow : null}
        {label}
        {dir === "next" ? arrow : null}
      </span>
    );
  }
  return (
    <Link
      href={href}
      rel={dir}
      className={`${cls} text-fg hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand`}
    >
      {dir === "prev" ? arrow : null}
      {label}
      {dir === "next" ? arrow : null}
    </Link>
  );
}
