"use client";

/**
 * Teams somebody follows, kept in their own browser.
 *
 * No account, on purpose. A parent wanting their kid's schedule should not
 * have to make one, and a site holding a list of minors' teams against an
 * email address is a responsibility worth avoiding until there is a reason.
 * Everything here stays on the device.
 */

const KEY = "kyboxscore.following.v1";

export type Followed = { slug: string; name: string; sport: string };

function read(): Followed[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f): f is Followed =>
        !!f && typeof f === "object" &&
        typeof (f as Followed).slug === "string" &&
        typeof (f as Followed).name === "string"
    );
  } catch {
    // Private windows, cleared storage, a browser that blocks it. Following is
    // a convenience; it must never break the page it lives on.
    return [];
  }
}

function write(list: Followed[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
    // So other tabs and other components on this page keep up.
    window.dispatchEvent(new CustomEvent("kyboxscore:following"));
  } catch {
    /* ignore */
  }
}

export function getFollowing(): Followed[] {
  return read();
}

export function isFollowing(slug: string, sport: string): boolean {
  return read().some((f) => f.slug === slug && f.sport === sport);
}

export function toggleFollowing(team: Followed): boolean {
  const list = read();
  const i = list.findIndex((f) => f.slug === team.slug && f.sport === team.sport);
  if (i === -1) {
    write([...list, team]);
    return true;
  }
  write(list.filter((_, n) => n !== i));
  return false;
}
