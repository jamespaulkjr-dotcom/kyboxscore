import type { Metadata } from "next";
import Link from "next/link";
import { listSports, searchAll } from "@kyboxscore/db";
import { SiteHeader } from "../components/site-header";
import { BottomNav } from "../components/bottom-nav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search",
  description: "Find any Kentucky high school team, school, player or coach.",
};

const LABEL: Record<string, string> = {
  school: "School",
  player: "Player",
  coach: "Coach",
};

export default async function Page(props: PageProps<"/search">) {
  const { q } = await props.searchParams;
  const query = typeof q === "string" ? q : "";
  const sports = await listSports();
  const primary = sports[0]?.slug ?? "basketball";
  const year = sports[0]?.urlYear;
  // Labelled from the same sport the results link into, so the class on a row
  // describes the team page that row opens.
  const results = query ? await searchAll(query, 20, primary) : [];

  return (
    <>
      <SiteHeader sports={sports} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Search</h1>
        {/* A plain GET form: works with JavaScript disabled, like every read view. */}
        <form action="/search" method="get" className="mt-4 flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="School, team, player or coach"
            aria-label="Search schools, players and coaches"
            autoComplete="off"
            className="min-h-11 flex-1 rounded-md border border-border bg-surface px-3 text-fg placeholder:text-fg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-link"
          />
          <button
            type="submit"
            className="min-h-11 rounded-md bg-brand-fill px-4 font-medium text-on-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
          >
            Search
          </button>
        </form>

        <p className="mt-3 text-sm text-fg-muted">
          Looking for a whole class rather than one name?{" "}
          <Link href={`/${primary}/teams`} className="text-link underline">
            Browse every team by class →
          </Link>
        </p>

        {query && (
          <ul className="mt-5 overflow-hidden rounded-lg border border-border bg-surface">
            {results.map((r) => {
              // Class first: it is what tells two schools of the same name
              // apart, and what a player's name alone never could. The school
              // leads for a player, because that is who they are.
              const detail = [
                r.entityType === "player" ? r.schoolName : null,
                r.groupName,
                r.subtitle || null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
              <li key={`${r.entityType}-${r.slug}`} className="border-b border-border last:border-0">
                <Link
                  href={
                    r.entityType === "school"
                      ? `/${primary}/${year}/teams/${r.slug}`
                      : // A player has no page of their own yet, but their
                        // team does. Sending them back to the same search
                        // they just ran was a dead end. The sport comes from
                        // the roster the label was read off, so the link and
                        // the label cannot disagree.
                        r.schoolSlug && r.sportSlug && r.urlYear
                        ? `/${r.sportSlug}/${r.urlYear}/teams/${r.schoolSlug}`
                        : `/search?q=${encodeURIComponent(r.title)}`
                  }
                  className="flex items-baseline gap-3 px-4 py-3 hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-link"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.title}</span>
                    {detail && (
                      <span className="block truncate text-sm text-fg-muted">
                        {detail}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs uppercase tracking-widest text-fg-muted">
                    {LABEL[r.entityType] ?? r.entityType}
                  </span>
                </Link>
              </li>
              );
            })}
            {results.length === 0 && (
              <li className="px-4 py-8 text-center text-fg-muted">
                Nothing matched “{query}”.
              </li>
            )}
          </ul>
        )}
      </main>
      <BottomNav sportSlug={primary} active="search" />
    </>
  );
}
