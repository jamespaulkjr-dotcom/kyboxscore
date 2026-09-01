"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getFollowing, type Followed } from "../../lib/favorites";

type TeamStatus = {
  schoolSlug: string;
  schoolName: string;
  wins: number;
  losses: number;
  nextDate: string | null;
  nextTime: string | null;
  nextOpponent: string | null;
  nextIsHome: boolean | null;
  nextShortCode: string | null;
  lastDate: string | null;
  lastOpponent: string | null;
  lastResult: string | null;
  lastScore: string | null;
};

const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/**
 * The teams this browser follows.
 *
 * Renders nothing at all when nobody follows anything, so the front page is
 * not cluttered with an empty promise for a first-time visitor.
 */
export function Following({ sport }: { sport: string }) {
  const [followed, setFollowed] = useState<Followed[] | null>(null);
  const [teams, setTeams] = useState<TeamStatus[]>([]);
  const [urlYear, setUrlYear] = useState<number | null>(null);

  useEffect(() => {
    const load = () => setFollowed(getFollowing().filter((f) => f.sport === sport));
    load();
    window.addEventListener("kyboxscore:following", load);
    return () => window.removeEventListener("kyboxscore:following", load);
  }, [sport]);

  useEffect(() => {
    if (!followed || followed.length === 0) {
      setTeams([]);
      return;
    }
    const slugs = followed.map((f) => f.slug).join(",");
    let cancelled = false;
    fetch(`/api/following?sport=${encodeURIComponent(sport)}&teams=${encodeURIComponent(slugs)}`)
      .then((r) => (r.ok ? r.json() : { teams: [] }))
      .then((data) => {
        if (cancelled) return;
        setTeams(data.teams ?? []);
        setUrlYear(data.urlYear ?? null);
      })
      .catch(() => {
        /* following is a convenience; a failed fetch must not break the page */
      });
    return () => {
      cancelled = true;
    };
  }, [followed, sport]);

  if (!followed || followed.length === 0 || teams.length === 0) return null;

  return (
    <section className="mb-8" aria-labelledby="following">
      <h2 id="following" className="text-lg font-bold tracking-tight">
        Your teams
      </h2>
      <ul className="mt-3 overflow-hidden rounded-lg border border-accent/40 bg-surface">
        {teams.map((t) => (
          <li key={t.schoolSlug} className="border-b border-border px-4 py-3 last:border-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <Link
                href={urlYear ? `/${sport}/${urlYear}/teams/${t.schoolSlug}` : "#"}
                className="font-medium hover:underline"
              >
                {t.schoolName}
              </Link>
              <span className="tabular text-sm text-fg-muted">
                {t.wins}-{t.losses}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-fg-muted">
              {t.nextDate ? (
                <>
                  Next: {dayLabel(t.nextDate)}
                  {t.nextTime ? ` ${t.nextTime}` : ""}{" "}
                  {t.nextIsHome ? "vs" : "at"} {t.nextOpponent}
                </>
              ) : (
                "No game scheduled"
              )}
              {t.lastResult && (
                <>
                  <span className="mx-1.5">·</span>
                  Last: {t.lastResult} {t.lastScore} {t.lastOpponent
                    ? `vs ${t.lastOpponent}`
                    : ""}
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
