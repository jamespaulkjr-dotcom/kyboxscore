import type { Metadata } from "next";
import Link from "next/link";
import { listSports, listSportsForSelect } from "@kyboxscore/db";
import { SiteHeader } from "../../components/site-header";
import { requireAdmin } from "../../../lib/auth";
import { ResultsImport } from "./results-import";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Paste results",
  robots: { index: false, follow: false },
};

export default async function Page() {
  await requireAdmin("/admin/results");
  const [sportOptions, navSports] = await Promise.all([
    listSportsForSelect(),
    listSports(),
  ]);

  return (
    <>
      <SiteHeader sports={navSports} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/coach" className="text-link underline">← Dashboard</Link>
          <Link href="/admin/schedule" className="text-link underline">Import a schedule</Link>
          <Link href="/admin/missing-results" className="text-link underline">Missing results</Link>
        </div>

        <h1 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
          Paste results
        </h1>
        <p className="mt-2 max-w-prose text-sm text-fg-muted">
          Paste a night&rsquo;s scores document and it settles the games already
          on the schedule: finals, postponements, cancellations and games that
          moved to another date. It never creates a fixture and never guesses a
          school, so read the preview before applying it.
        </p>

        <ResultsImport sports={sportOptions} />
      </main>
    </>
  );
}
