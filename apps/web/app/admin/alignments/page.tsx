import type { Metadata } from "next";
import Link from "next/link";
import {
  listAlignmentSummary,
  listSports,
  listSportsForSelect,
} from "@kyboxscore/db";
import { SiteHeader } from "../../components/site-header";
import { requireAdmin } from "../../../lib/auth";
import { AlignmentImport } from "./alignment-import";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Import an alignment",
  robots: { index: false, follow: false },
};

export default async function Page() {
  await requireAdmin("/admin/alignments");
  const [sportOptions, navSports, loaded] = await Promise.all([
    listSportsForSelect(),
    listSports(),
    listAlignmentSummary(),
  ]);

  return (
    <>
      <SiteHeader sports={navSports} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/coach" className="text-link underline">← Dashboard</Link>
          <Link href="/admin/teams" className="text-link underline">Teams</Link>
          <Link href="/admin/schedule" className="text-link underline">Schedules</Link>
        </div>

        <h1 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
          Import an alignment
        </h1>
        <p className="mt-2 max-w-prose text-sm text-fg-muted">
          Districts and classes for a whole sport in one paste. KHSAA realigns
          every two years on school population, so this is built to be re-run
          each cycle rather than entered once.
        </p>

        {loaded.length > 0 && (
          <>
            <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-fg-muted">
              Loaded now
            </h2>
            <p className="mt-1 max-w-prose text-sm text-fg-muted">
              What an import for that sport would be replacing, and how many of
              its teams are placed in it.
            </p>
            <ul className="mt-3 overflow-hidden rounded-lg border border-border bg-surface">
              {loaded.map((s) => (
                <li
                  key={s.sportSlug}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3 last:border-0"
                >
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{s.sportName}</span>
                    <span className="text-sm text-fg-muted">
                      {[
                        s.classes > 0 ? `${s.classes} classes` : null,
                        s.regions > 0 ? `${s.regions} regions` : null,
                        s.districts > 0 ? `${s.districts} districts` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "no alignment loaded"}
                    </span>
                  </span>
                  <span className="text-sm text-fg-muted">
                    {s.aligned} placed
                    {s.unaligned > 0 && (
                      <Link
                        href="/admin/teams?gaps=1"
                        className="ml-2 rounded bg-loss/15 px-1.5 py-0.5 text-xs font-semibold text-loss underline"
                      >
                        {s.unaligned} without a district
                      </Link>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <AlignmentImport sports={sportOptions} />
      </main>
    </>
  );
}
