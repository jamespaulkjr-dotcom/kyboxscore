import type { MetadataRoute } from "next";
import { listSitemapEntries, listSports } from "@kyboxscore/db";

export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kyboxscore.com";

/**
 * Every page worth finding.
 *
 * Games and team pages are the point: somebody searching for a school and a
 * Friday should land on the score, not on a section index. Played games are
 * given a recent `lastModified` so a crawler comes back for them; a fixture
 * three weeks out is not urgent.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [sports, entries] = await Promise.all([listSports(), listSitemapEntries()]);
  const now = new Date();

  const fixed: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: "hourly", priority: 1 },
    { url: `${siteUrl}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/sports`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${siteUrl}/search`, changeFrequency: "monthly", priority: 0.3 },
  ];

  for (const s of sports) {
    for (const [path, freq, priority] of [
      ["scores", "hourly", 0.9],
      ["standings", "daily", 0.8],
      ["rpi", "daily", 0.8],
      ["teams", "weekly", 0.6],
      ["stats", "daily", 0.6],
    ] as const) {
      fixed.push({
        url: `${siteUrl}/${s.slug}/${path}`,
        changeFrequency: freq,
        priority,
      });
    }
  }

  // A bad timestamp must not take the whole sitemap down with it: one
  // unparseable date is not a reason for a crawler to get a 500.
  const when = (value: string | null) => {
    if (!value) return now;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? now : d;
  };

  const pages: MetadataRoute.Sitemap = entries.map((e) => ({
    url: `${siteUrl}${e.path}`,
    lastModified: when(e.updatedAt),
    changeFrequency: e.kind === "game" && e.isFinal ? "monthly" : "daily",
    priority: e.kind === "team" ? 0.7 : e.isFinal ? 0.6 : 0.4,
  }));

  return [...fixed, ...pages];
}
