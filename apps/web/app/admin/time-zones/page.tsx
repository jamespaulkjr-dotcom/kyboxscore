import type { Metadata } from "next";
import Link from "next/link";
import { listSchoolTimeZones, listSports } from "@kyboxscore/db";
import { SiteHeader } from "../../components/site-header";
import { requireAdmin } from "../../../lib/auth";
import { TimeZoneForm } from "./tz-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "School time zones",
  robots: { index: false, follow: false },
};

export default async function Page() {
  await requireAdmin("/admin/time-zones");
  const [schools, navSports] = await Promise.all([
    listSchoolTimeZones(),
    listSports(),
  ]);

  const central = schools.filter((s) => s.timeZone === "America/Chicago");
  const eastern = schools.filter((s) => s.timeZone !== "America/Chicago");
  const noCounty = schools.filter((s) => !s.county);

  return (
    <>
      <SiteHeader sports={navSports} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Link href="/coach" className="text-sm text-link underline">← Dashboard</Link>

        <h1 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
          School time zones
        </h1>
        <p className="mt-2 max-w-prose text-sm text-fg-muted">
          Kentucky spans Eastern and Central. Every school was seeded as Eastern,
          which is wrong for the western third of the state — Paducah, Owensboro,
          Bowling Green, Hopkinsville and their neighbours are Central.
        </p>
        <p className="mt-2 max-w-prose text-sm text-fg-muted">
          Nothing reads this yet: kick-off times are stored as plain local clock
          times precisely so a wrong zone could not produce a wrong instant.
          Getting it right now is what makes it safe to use later.
        </p>

        <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
          {[
            ["Eastern", eastern.length],
            ["Central", central.length],
            ["No county known", noCounty.length],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-border bg-surface py-3">
              <dt className="text-xs uppercase tracking-wide text-fg-muted">{label}</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <TimeZoneForm />

        {central.length > 0 && (
          <>
            <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-fg-muted">
              Currently Central ({central.length})
            </h2>
            <p className="mt-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              {central.map((s) => s.schoolName).join(", ")}
            </p>
          </>
        )}

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Schools whose name states no county ({noCounty.length})
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          These are named for a town or a person, so the county cannot be read
          off the name. List them individually above if they belong in Central.
        </p>
        <p className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg-muted">
          {noCounty.map((s) => s.schoolName).join(", ")}
        </p>
      </main>
    </>
  );
}
