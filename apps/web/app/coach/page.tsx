import type { Metadata } from "next";
import Link from "next/link";
import { listGrantedTeams, listSports } from "@kyboxscore/db";
import { SiteHeader } from "../components/site-header";
import { isAdmin, requireUser } from "../../lib/auth";
import { logout } from "../login/actions";

export const metadata: Metadata = {
  title: "Coach dashboard",
  robots: { index: false, follow: false },
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrator",
  staff: "Staff",
  athletic_director: "Athletic director",
  coach: "Coach",
};

export default async function Page() {
  const user = await requireUser("/coach");
  const [teams, sports] = await Promise.all([
    listGrantedTeams(user.id),
    listSports(),
  ]);

  return (
    <>
      <SiteHeader sports={sports} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              {user.name}
            </h1>
            <p className="mt-1 text-sm text-fg-muted">
              {ROLE_LABEL[user.role] ?? user.role} · {user.email}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/account/password" className="text-sm text-link underline">
              Change password
            </Link>
            <form action={logout}>
            <button
              type="submit"
              className="min-h-11 rounded-md border border-border px-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
            >
              Sign out
              </button>
            </form>
          </div>
        </div>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Your teams
        </h2>

        {teams.length === 0 ? (
          <p className="mt-3 rounded-lg border border-border bg-surface px-4 py-6 text-sm text-fg-muted">
            No teams are assigned to this account yet. Email{" "}
            <a className="text-link underline" href="mailto:help@kyboxscore.com">
              help@kyboxscore.com
            </a>{" "}
            with your school and sport and we will set it up.
          </p>
        ) : (
          <ul className="mt-3 overflow-hidden rounded-lg border border-border bg-surface">
            {teams.map((t) => (
              <li
                key={t.teamId}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0"
              >
                <span className="font-medium">{t.schoolName}</span>
                <span className="text-sm text-fg-muted">
                  {t.sportName} · {t.gender} · {t.level}
                </span>
              </li>
            ))}
          </ul>
        )}

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Statistics
        </h2>
        <Link
          href="/coach/import"
          className="mt-2 flex min-h-11 items-center justify-center rounded-md bg-brand-fill px-4 font-medium text-on-brand"
        >
          Import a box score
        </Link>
        <p className="mt-2 text-sm text-fg-muted">
          Upload the MaxPreps <code>.txt</code> your scorekeeping app exports.
          You will see everything it read before anything is saved.
        </p>

        {isAdmin(user) && (
          <>
            <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-fg-muted">
              Administration
            </h2>
            <Link href="/admin/users" className="mt-2 block text-link underline">
              Accounts and team access
            </Link>
            <Link href="/admin/teams" className="mt-1 block text-link underline">
              Teams and rosters
            </Link>
            <Link href="/admin/schedule" className="mt-1 block text-link underline">
              Import a schedule (row per game)
            </Link>
            <Link href="/admin/schedule/team" className="mt-1 block text-link underline">
              Import a team schedule (pasted from a schedule page)
            </Link>
            <Link href="/admin/alignments" className="mt-1 block text-link underline">
              Import an alignment
            </Link>
          </>
        )}
      </main>
    </>
  );
}
