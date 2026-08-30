import type { Metadata } from "next";
import Link from "next/link";
import { listGamesForTeamSeason, listImportableTeams, listSports } from "@kyboxscore/db";
import { SiteHeader } from "../../components/site-header";
import { requireUser } from "../../../lib/auth";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = {
  title: "Import a box score",
  robots: { index: false, follow: false },
};

export default async function Page(props: PageProps<"/coach/import">) {
  const user = await requireUser("/coach/import");
  const { team } = await props.searchParams;

  const [teams, sports] = await Promise.all([
    listImportableTeams(user.id),
    listSports(),
  ]);

  const selectedId = Number(typeof team === "string" ? team : "");
  const selected = teams.find((t) => t.teamSeasonId === selectedId) ?? null;
  const games = selected ? await listGamesForTeamSeason(selected.teamSeasonId) : [];

  return (
    <>
      <SiteHeader sports={sports} />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
        <Link href="/coach" className="text-sm text-link underline">
          ← Back to your teams
        </Link>
        <h1 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
          Import a box score
        </h1>

        {teams.length === 0 ? (
          <p className="mt-4 rounded-lg border border-border bg-surface px-4 py-6 text-sm text-fg-muted">
            No teams are assigned to this account yet, so there is nothing to
            import for. Email{" "}
            <a className="text-link underline" href="mailto:help@kyboxscore.com">
              help@kyboxscore.com
            </a>
            .
          </p>
        ) : (
          <>
            {/* Plain GET form: choosing a team is a navigation, and it works
                with JavaScript disabled like every other read view. */}
            <form method="get" className="mt-5 flex flex-wrap items-end gap-2">
              <div className="flex-1">
                <label htmlFor="team" className="block text-sm font-medium">
                  Team
                </label>
                <select
                  id="team"
                  name="team"
                  defaultValue={selected ? String(selected.teamSeasonId) : ""}
                  className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-fg"
                >
                  <option value="">Choose a team…</option>
                  {teams.map((t) => (
                    <option key={t.teamSeasonId} value={t.teamSeasonId}>
                      {t.schoolName} · {t.sportName} {t.gender} {t.level} ·{" "}
                      {t.seasonLabel}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="min-h-11 rounded-md border border-border px-4 font-medium"
              >
                Continue
              </button>
            </form>

            {selected && (
              <>
                <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-fg-muted">
                  {selected.schoolName} · {selected.sportName}
                </h2>
                {selected.sportSlug !== "baseball" ? (
                  <p className="mt-3 rounded-lg border border-border bg-surface px-4 py-4 text-sm text-fg-muted">
                    The MaxPreps <code>.txt</code> importer currently maps
                    baseball columns only. {selected.sportName} column mapping is
                    next.
                  </p>
                ) : (
                  <UploadForm teamSeasonId={selected.teamSeasonId} games={games} />
                )}
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
