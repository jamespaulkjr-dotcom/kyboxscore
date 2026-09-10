import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getScoreboard,
  getSlateDates,
  getSportSeason,
  listSeasonGroups,
  listSports,
  resolveSlateDate,
} from "@kyboxscore/db";
import { findGroup, groupNoun, groupRows } from "../../lib/alignment-group";
import { SiteHeader } from "./site-header";
import { BottomNav } from "./bottom-nav";
import { GameRow } from "./game-row";
import { LiveScores } from "./live-scores";
import { formatSlateDate, formatShortDate } from "../../lib/format";

export async function ScoresView({
  sportSlug,
  date,
  classParam = "",
}: {
  sportSlug: string;
  date?: string;
  classParam?: string;
}) {
  const [sports, season] = await Promise.all([
    listSports(),
    getSportSeason(sportSlug),
  ]);
  if (!season) notFound();

  // From the season's alignments, not from this date's games: which pills
  // exist must not change as you step from one Friday to the next.
  const groups = groupRows(await listSeasonGroups(season.id));
  const selected = classParam ? findGroup(groups, classParam) : undefined;
  // A ?class= nobody can be in is a wrong URL, not an empty scoreboard.
  if (classParam && !selected) notFound();
  const noun = groupNoun(groups);
  const query = selected ? `?class=${selected.param}` : "";

  const slate = await resolveSlateDate(season.id, date);
  const [games, allDates] = await Promise.all([
    slate
      ? getScoreboard(season.id, slate, "region", selected?.slug)
      : Promise.resolve([]),
    getSlateDates(season.id),
  ]);

  const idx = allDates.findIndex((d) => d.localDate === slate);
  const prev = idx > 0 ? allDates[idx - 1] : null;
  const next = idx >= 0 && idx < allDates.length - 1 ? allDates[idx + 1] : null;

  // Poll only when it could matter: something is already live, or this is
  // today's slate and a game could start at any moment. Yesterday's scores
  // never change, so yesterday's readers never poll.
  const today = new Date().toISOString().slice(0, 10);
  const watchLive =
    games.some((g) => g.status === "in_progress") || slate === today;

  // Group by class/region, in alignment order rather than alphabetically:
  // sorting the names put Region 10 above Region 2. Ungrouped games (out of
  // state, independents) come last under "Other".
  const sections = new Map<string, { ordinal: number; games: typeof games }>();
  for (const g of games) {
    const key = g.groupName ?? "Other";
    if (!sections.has(key)) {
      sections.set(key, { ordinal: g.groupName ? g.groupOrdinal ?? 998 : 999, games: [] });
    }
    sections.get(key)!.games.push(g);
  }
  const ordered = [...sections.entries()].sort(
    (x, y) => x[1].ordinal - y[1].ordinal
  );

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
              {selected && (
                <>
                  <span className="mx-1.5">·</span>
                  {selected.label}
                </>
              )}
              <span className="mx-1.5">·</span>
              {season.seasonLabel}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <DateStep
              href={prev ? `/${sportSlug}/scores/${prev.localDate}${query}` : null}
              label={prev ? formatShortDate(prev.localDate) : "Earlier"}
              dir="prev"
            />
            <DateStep
              href={next ? `/${sportSlug}/scores/${next.localDate}${query}` : null}
              label={next ? formatShortDate(next.localDate) : "Later"}
              dir="next"
            />
          </div>
        </div>

        {groups.length > 1 && (
          <nav
            aria-label={`Filter by ${noun}`}
            className="mt-4 flex flex-wrap gap-1.5"
          >
            {[
              {
                label: "All games",
                href: slate ? `/${sportSlug}/scores/${slate}` : `/${sportSlug}/scores`,
                active: !selected,
              },
              ...groups.map((g) => ({
                label: g.name,
                href: slate
                  ? `/${sportSlug}/scores/${slate}?class=${g.param}`
                  : `/${sportSlug}/scores?class=${g.param}`,
                active: selected?.slug === g.slug,
              })),
            ].map((t) => (
              <Link
                key={t.href}
                href={t.href}
                aria-current={t.active ? "page" : undefined}
                className={`rounded-full border px-3 py-1 text-sm font-medium ${
                  t.active
                    ? "border-accent bg-accent-fill text-on-accent"
                    : "border-border bg-surface text-fg-muted hover:text-fg"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        )}

        {games.length === 0 ? (
          <p className="mt-10 rounded-lg border border-border bg-surface px-4 py-8 text-center text-fg-muted">
            No {selected ? `${selected.label} ` : ""}
            {season.sportName.toLowerCase()} games on this date.
          </p>
        ) : (
          <LiveScores sportSlug={sportSlug} enabled={watchLive}>
          <div className="mt-5 space-y-6">
            {selected ? (
              // Filtered, every game is already under one heading at the top,
              // and a game against another class would otherwise be filed
              // under that class on a page about this one.
              <ul className="overflow-hidden rounded-lg border border-border bg-surface">
                {games.map((g) => (
                  <GameRow
                    key={g.id}
                    game={g}
                    sportSlug={sportSlug}
                    urlYear={season.urlYear}
                  />
                ))}
              </ul>
            ) : (
              ordered.map(([group, section]) => (
                <section key={group} aria-labelledby={`grp-${group}`}>
                  <h2
                    id={`grp-${group}`}
                    className="mb-2 text-xs font-semibold uppercase tracking-widest text-fg-muted"
                  >
                    {group}
                  </h2>
                  <ul className="overflow-hidden rounded-lg border border-border bg-surface">
                    {section.games.map((g) => (
                      <GameRow
                        key={g.id}
                        game={g}
                        sportSlug={sportSlug}
                        urlYear={season.urlYear}
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
          </LiveScores>
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
      className={`${cls} text-fg hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-link`}
    >
      {dir === "prev" ? arrow : null}
      {label}
      {dir === "next" ? arrow : null}
    </Link>
  );
}
