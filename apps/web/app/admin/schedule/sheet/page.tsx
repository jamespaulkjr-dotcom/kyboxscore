import type { Metadata } from "next";
import Link from "next/link";
import { listSports, listSportsForSelect } from "@kyboxscore/db";
import { SiteHeader } from "../../../components/site-header";
import { requireAdmin } from "../../../../lib/auth";
import { SheetImport } from "./sheet-import";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Import a schedule spreadsheet",
  robots: { index: false, follow: false },
};

export default async function Page() {
  await requireAdmin("/admin/schedule/sheet");
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
          <Link href="/admin/schedule/team" className="text-link underline">Paste one team</Link>
          <Link href="/admin/teams" className="text-link underline">Teams</Link>
        </div>

        <h1 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
          Import a schedule spreadsheet
        </h1>
        <p className="mt-2 max-w-prose text-sm text-fg-muted">
          A whole season in one file: one row per team per game. This is the
          fastest path, because a state-wide export loads every school at once instead
          of pasting them one at a time.
        </p>

        <SheetImport sports={sportOptions} />
      </main>
    </>
  );
}
