import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getUser,
  listGrantableTeams,
  listGrants,
  listSports,
} from "@kyboxscore/db";
import { SiteHeader } from "../../../components/site-header";
import { requireAdmin } from "../../../../lib/auth";
import { grant, revoke } from "../../actions";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export default async function Page(props: PageProps<"/admin/users/[id]">) {
  await requireAdmin("/admin/users");
  const { id } = await props.params;
  const { q } = await props.searchParams;
  const userId = Number(id);
  if (!Number.isInteger(userId)) notFound();

  const query = typeof q === "string" ? q : "";
  const user = await getUser(userId);
  if (!user) notFound();

  const [grants, grantable, sports] = await Promise.all([
    listGrants(userId),
    listGrantableTeams(userId, query),
    listSports(),
  ]);

  return (
    <>
      <SiteHeader sports={sports} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <Link href="/admin/users" className="text-sm text-link underline">
          ← All accounts
        </Link>

        <h1 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">{user.name}</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {user.email} · {user.role}
          {!user.isActive && <span className="text-loss"> · disabled</span>}
          {!user.hasPassword && " · no password set"}
          {user.lastLoginAt
            ? ` · last signed in ${user.lastLoginAt.slice(0, 10)}`
            : " · never signed in"}
        </p>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Teams this account may enter statistics for
        </h2>

        {grants.length === 0 ? (
          <p className="mt-2 rounded-lg border border-border bg-surface px-4 py-5 text-sm text-fg-muted">
            None yet. Until a team is granted, this account can sign in but
            cannot import anything.
          </p>
        ) : (
          <ul className="mt-2 overflow-hidden rounded-lg border border-border bg-surface">
            {grants.map((g) => (
              <li
                key={g.teamId}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0"
              >
                <span>
                  <span className="font-medium">{g.schoolName}</span>
                  <span className="ml-2 text-sm text-fg-muted">
                    {g.sportName} · {g.gender} · {g.level}
                  </span>
                  <span className="block text-xs text-fg-muted">
                    granted {g.grantedAt.slice(0, 10)}
                    {g.grantedByName ? ` by ${g.grantedByName}` : ""}
                  </span>
                </span>
                <form action={revoke}>
                  <input type="hidden" name="userId" value={userId} />
                  <input type="hidden" name="teamId" value={g.teamId} />
                  <button
                    type="submit"
                    className="min-h-9 rounded-md border border-border px-3 text-sm font-medium"
                  >
                    Revoke
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {grants.length > 0 && (
          <p className="mt-2 text-xs text-fg-muted">
            Revoking stops future entry. Statistics already committed stay in
            the record, with their provenance intact.
          </p>
        )}

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Grant another team
        </h2>

        <form method="get" className="mt-2 flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="School or sport"
            aria-label="Search teams"
            className="min-h-11 flex-1 rounded-md border border-border bg-surface px-3 text-fg placeholder:text-fg-muted"
          />
          <button type="submit" className="min-h-11 rounded-md border border-border px-4 font-medium">
            Search
          </button>
        </form>

        {grantable.length === 0 ? (
          <p className="mt-3 rounded-lg border border-border bg-surface px-4 py-5 text-sm text-fg-muted">
            {query
              ? "No teams match that search."
              : "There are no teams left to grant. If that is unexpected, no teams exist in the database yet."}
          </p>
        ) : (
          <ul className="mt-3 overflow-hidden rounded-lg border border-border bg-surface">
            {grantable.map((t) => (
              <li
                key={t.teamId}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0"
              >
                <span>
                  <span className="font-medium">{t.schoolName}</span>
                  <span className="ml-2 text-sm text-fg-muted">
                    {t.sportName} · {t.gender} · {t.level}
                  </span>
                  {!t.hasSeason && (
                    <span className="block text-xs text-fg-muted">
                      no current season, so it can be granted but not imported for yet
                    </span>
                  )}
                </span>
                <form action={grant}>
                  <input type="hidden" name="userId" value={userId} />
                  <input type="hidden" name="teamId" value={t.teamId} />
                  <button
                    type="submit"
                    className="min-h-9 rounded-md bg-brand-fill px-3 text-sm font-medium text-on-brand"
                  >
                    Grant
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
