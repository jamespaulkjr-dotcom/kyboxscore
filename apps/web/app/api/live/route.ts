import { getSportSeason, listLiveGames } from "@kyboxscore/db";

export const dynamic = "force-dynamic";

/**
 * Whatever is being played right now, as a few hundred bytes.
 *
 * The scoreboard polls this instead of re-rendering itself, so a Friday night
 * with the whole state watching costs one small cached response every fifteen
 * seconds rather than a full server render per viewer.
 */
export async function GET(request: Request) {
  const sport = new URL(request.url).searchParams.get("sport") ?? "";
  if (!/^[a-z0-9-]{1,40}$/i.test(sport)) {
    return Response.json({ games: [] });
  }

  const season = await getSportSeason(sport);
  if (!season) return Response.json({ games: [] });

  const games = await listLiveGames(season.id);
  return Response.json(
    { games },
    {
      headers: {
        // Short enough that a touchdown shows up quickly, long enough that ten
        // thousand phones do not each become a database query.
        "cache-control": "public, max-age=15, stale-while-revalidate=30",
      },
    }
  );
}
