import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSportSeason, listOutOfStateTeams, listSports } from "@kyboxscore/db";
import { SiteHeader } from "../../components/site-header";
import { requireAdmin } from "../../../lib/auth";
import { OutOfStateForm } from "./oos-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Out-of-state records",
  robots: { index: false, follow: false },
};

export default async function Page() {
  await requireAdmin("/admin/out-of-state");
  const [season, navSports] = await Promise.all([
    getSportSeason("football"),
    listSports(),
  ]);
  if (!season) notFound();

  const teams = await listOutOfStateTeams(season.id);
  const known = teams.filter((t) => t.wins !== null);
  const today = new Date().toISOString().slice(0, 10);
  const example = teams
    .slice(0, 3)
    .map((t) => `${t.schoolName}, 3, 1`)
    .join("\n");

  return (
    <>
      <SiteHeader sports={navSports} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/coach" className="text-link underline">← Dashboard</Link>
          <Link href="/football/rpi" className="text-link underline">RPI</Link>
        </div>

        <h1 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
          Out-of-state records
        </h1>
        <p className="mt-2 max-w-prose text-sm text-fg-muted">
          The official KHSAA formula treats every out-of-state opponent as a
          .500 team, however good or bad they really are.{" "}
          <strong>Shadow RPI is the same arithmetic with their real record
          instead</strong> — and until a record is entered here, the two are
          identical and every delta reads zero.
        </p>
        <p className="mt-2 max-w-prose text-sm text-fg-muted">
          These are entered by hand from a source you are entitled to read, and
          the source is recorded with them. They are not fetched from other
          state associations&rsquo; sites.
        </p>

        <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
          {[
            ["Opponents", teams.length],
            ["With a record", known.length],
            ["Still unknown", teams.length - known.length],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-border bg-surface py-3">
              <dt className="text-xs uppercase tracking-wide text-fg-muted">{label}</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <OutOfStateForm sportSeasonId={season.id} today={today} example={example} />

        <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Every out-of-state opponent this season
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          Ordered by how many Kentucky teams they played — the ones at the top
          move the most ratings.
        </p>
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[34rem] border-collapse bg-surface text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="px-3 py-2 font-semibold">School</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">KY games</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">Record</th>
                <th scope="col" className="px-3 py-2 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.teamId} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    {t.schoolName}
                    <span className="block text-xs text-fg-muted">
                      played {t.kentuckyOpponents}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{t.gamesVsKentucky}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {t.wins === null ? (
                      <span className="text-fg-muted">— assumed .500</span>
                    ) : (
                      <span className="font-semibold">
                        {t.wins}-{t.losses}{t.ties ? `-${t.ties}` : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-fg-muted">
                    {t.sourceName ? `${t.sourceName} · ${t.asOf}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
