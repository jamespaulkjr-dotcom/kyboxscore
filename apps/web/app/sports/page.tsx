import type { Metadata } from "next";
import Link from "next/link";
import { listAllSports, listSports } from "@kyboxscore/db";
import { SiteHeader } from "../components/site-header";
import { BottomNav } from "../components/bottom-nav";

// Reads the database, and the image has to build without one. Every other
// data-backed page is dynamic for the same reason.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sports",
  description:
    "Every sport and sport activity the KHSAA sanctions, from football and basketball to archery, bass fishing and esports.",
};

/** KHSAA's own grouping, and the order it presents them in. */
const GROUPS = [
  {
    key: "team",
    title: "Team sports",
    blurb: "Head-to-head, one score per side.",
  },
  {
    key: "individual",
    title: "Individual sports",
    blurb: "Meets and matches, scored by placings and times.",
  },
  {
    key: "activity",
    title: "Sport activities",
    blurb: "Judged and separately scored events.",
  },
] as const;

export default async function Page() {
  const [all, navSports] = await Promise.all([listAllSports(), listSports()]);

  return (
    <>
      <SiteHeader sports={navSports} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-24">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Sports</h1>
        <p className="mt-2 max-w-prose text-sm text-fg-muted">
          Everything the KHSAA sanctions. Sports with a season open are linked;
          the rest are on the way as their schedules are loaded.
        </p>

        {GROUPS.map((group) => {
          const sports = all.filter((s) => s.category === group.key);
          if (sports.length === 0) return null;
          return (
            <section key={group.key} className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
                {group.title}
              </h2>
              <p className="mt-1 text-sm text-fg-muted">{group.blurb}</p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {sports.map((s) => (
                  <li key={s.slug}>
                    {s.urlYear === null ? (
                      // Not a link: there is nothing behind it yet, and a link
                      // to an empty page is worse than an honest label.
                      <span className="flex min-h-11 items-center justify-between rounded-lg border border-border bg-surface px-4 text-fg-muted">
                        {s.name}
                        <span className="text-xs uppercase tracking-wide">
                          season not open
                        </span>
                      </span>
                    ) : (
                      <Link
                        href={`/${s.slug}/scores`}
                        className="flex min-h-11 items-center justify-between rounded-lg border border-border bg-surface px-4 font-medium hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-link"
                      >
                        {s.name}
                        <span className="text-sm text-link">Scores →</span>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </main>
      <BottomNav sportSlug={navSports[0]?.slug ?? "basketball"} />
    </>
  );
}
