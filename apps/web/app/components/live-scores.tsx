"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type LiveGame = {
  shortCode: string;
  status: string;
  periodsPlayed: number | null;
  home: number | null;
  away: number | null;
};

const LiveContext = createContext<Map<string, LiveGame>>(new Map());

/** Score updates for whatever is being played right now. */
export function useLiveGame(shortCode: string): LiveGame | undefined {
  return useContext(LiveContext).get(shortCode);
}

const POLL_MS = 30_000;

/**
 * Polls a tiny JSON endpoint and hands live scores down to the rows.
 *
 * Deliberately not `router.refresh()`. Peak load for this site is 10pm on a
 * Friday in October with the whole state on one page; re-rendering the entire
 * server component tree for every viewer every thirty seconds is precisely the
 * traffic pattern to avoid. This fetches a few hundred bytes instead and
 * changes only the numbers.
 *
 * It also stops when the tab is hidden. A phone in a pocket in a gym lobby
 * should not be polling.
 */
export function LiveScores({
  sportSlug,
  enabled,
  children,
}: {
  sportSlug: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const [live, setLive] = useState<Map<string, LiveGame>>(new Map());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(
          `/api/live?sport=${encodeURIComponent(sportSlug)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const body: { games?: LiveGame[] } = await res.json();
        if (cancelled || !Array.isArray(body.games)) return;
        setLive(new Map(body.games.map((g) => [g.shortCode, g])));
      } catch {
        // A dropped poll is not worth telling anybody about. The next one is
        // thirty seconds away and the page is still showing real scores.
      }
    };

    void tick();
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [sportSlug, enabled]);

  return <LiveContext.Provider value={live}>{children}</LiveContext.Provider>;
}
