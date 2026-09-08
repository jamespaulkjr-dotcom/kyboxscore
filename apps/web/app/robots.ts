import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kyboxscore.com";

/**
 * What a crawler may read.
 *
 * Everything a reader can see without signing in is open, because the whole
 * point is that a parent searching for "Corbin football score" finds it. The
 * closed paths are closed for one of two reasons: they need a login and would
 * only ever return a redirect, or they are a tool rather than a page.
 *
 * `/score/` is disallowed rather than merely useless to index: those URLs are
 * handed to a scorekeeper for one night, and a crawler has no business
 * following one.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/coach/",
          "/score/",
          "/account/",
          "/login",
          "/api/",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
