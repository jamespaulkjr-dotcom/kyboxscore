import { getFollowedTeams, getSportSeason } from "@kyboxscore/db";

export const dynamic = "force-dynamic";

/**
 * Next and last game for the teams somebody follows.
 *
 * Following lives in the browser, so the list arrives as slugs on the query
 * string. Capped because the parameter is user-supplied and a query string is
 * not an authorisation boundary.
 */
const MAX_TEAMS = 30;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sport = url.searchParams.get("sport") ?? "";
  const slugs = (url.searchParams.get("teams") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9-]{1,80}$/i.test(s))
    .slice(0, MAX_TEAMS);

  if (!/^[a-z0-9-]{1,40}$/i.test(sport) || slugs.length === 0) {
    return Response.json({ teams: [] });
  }

  const season = await getSportSeason(sport);
  if (!season) return Response.json({ teams: [] });

  const teams = await getFollowedTeams(season.id, slugs);
  return Response.json(
    { teams, urlYear: season.urlYear },
    // Short and shared: this is the same answer for everyone following the
    // same team, and it changes when a game is played, not by the second.
    { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } }
  );
}
