import type { Metadata } from "next";
import Link from "next/link";
import { listSports, listSportsForSelect } from "@kyboxscore/db";
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

        <AlignmentImport sports={sportOptions} />
      </main>
    </>
  );
}
