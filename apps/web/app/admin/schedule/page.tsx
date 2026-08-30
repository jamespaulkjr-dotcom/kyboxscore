import type { Metadata } from "next";
import Link from "next/link";
import { listSports, listSportsForSelect } from "@kyboxscore/db";
import { SiteHeader } from "../../components/site-header";
import { requireAdmin } from "../../../lib/auth";
import { ScheduleImport } from "./schedule-import";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Import a schedule",
  robots: { index: false, follow: false },
};

export default async function Page() {
  await requireAdmin("/admin/schedule");
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
          <Link href="/admin/teams" className="text-link underline">Teams and rosters</Link>
        </div>

        <h1 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
          Import a schedule
        </h1>
        <p className="mt-2 max-w-prose text-sm text-fg-muted">
          Paste a block of games and they become real fixtures. Schools are
          matched by name, and anything ambiguous is shown rather than guessed.
          Only paste data from a source you are entitled to use.
        </p>

        <ScheduleImport sports={sportOptions} />
      </main>
    </>
  );
}
