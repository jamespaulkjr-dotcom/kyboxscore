import type { Metadata } from "next";
import Link from "next/link";
import { countTeams, listSports, listUsers } from "@kyboxscore/db";
import { SiteHeader } from "../../components/site-header";
import { requireAdmin } from "../../../lib/auth";

export const metadata: Metadata = {
  title: "Accounts",
  robots: { index: false, follow: false },
};

export default async function Page(props: PageProps<"/admin/users">) {
  await requireAdmin("/admin/users");
  const { q } = await props.searchParams;
  const query = typeof q === "string" ? q : "";

  const [users, sports, teamCount] = await Promise.all([
    listUsers(query),
    listSports(),
    countTeams(),
  ]);

  return (
    <>
      <SiteHeader sports={sports} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/coach" className="text-link underline">← Back to your teams</Link>
          <Link href="/admin/teams" className="text-link underline">Teams and rosters</Link>
        </div>
        <h1 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">Accounts</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Who may enter statistics, and for which teams.
        </p>

        {teamCount === 0 && (
          <p className="mt-4 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg-muted">
            There are no teams in the database yet, so there is nothing to
            grant. Schools, teams and rosters have to exist first.
          </p>
        )}

        <form method="get" className="mt-5 flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Name or email"
            aria-label="Search accounts"
            className="min-h-11 flex-1 rounded-md border border-border bg-surface px-3 text-fg placeholder:text-fg-muted"
          />
          <button type="submit" className="min-h-11 rounded-md border border-border px-4 font-medium">
            Search
          </button>
        </form>

        <ul className="mt-5 overflow-hidden rounded-lg border border-border bg-surface">
          {users.length === 0 && (
            <li className="px-4 py-6 text-sm text-fg-muted">No accounts match.</li>
          )}
          {users.map((u) => (
            <li key={u.id} className="border-b border-border last:border-0">
              <Link
                href={`/admin/users/${u.id}`}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-raised"
              >
                <span className="font-medium">
                  {u.name}
                  {!u.isActive && (
                    <span className="ml-2 text-xs font-normal text-loss">disabled</span>
                  )}
                  {!u.hasPassword && (
                    <span className="ml-2 text-xs font-normal text-fg-muted">
                      no password set
                    </span>
                  )}
                </span>
                <span className="text-sm text-fg-muted">
                  {u.email} · {u.role} ·{" "}
                  {u.grantCount} team{u.grantCount === 1 ? "" : "s"}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-sm text-fg-muted">
          Accounts are created from the command line. There is no public sign
          up. Run <code>npm run db:create-user</code> on the server.
        </p>
      </main>
    </>
  );
}
