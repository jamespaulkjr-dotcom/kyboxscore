import { NextResponse } from "next/server";
import { findScorekeeper, hashToken } from "@kyboxscore/db";
import { KEEPER_COOKIE } from "../../../../lib/scoring-auth";

export const dynamic = "force-dynamic";

/**
 * Trades the link for a cookie, once, then sends the keeper to a clean URL.
 *
 * A route handler rather than a page because a page render is not allowed to
 * set a cookie - Next is right about that, and the first version of this was
 * wrong.
 *
 * The token never stays in the address bar: a scoring console gets held up,
 * photographed and screen-shared, and a URL is the easiest thing in the world
 * to leak by accident. The cookie is httpOnly and dies with the link.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/score/link/[token]">
) {
  const { token } = await ctx.params;
  const keeper = await findScorekeeper(hashToken(token));

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  if (!keeper) {
    return NextResponse.redirect(new URL("/score/expired", base), 303);
  }

  const res = NextResponse.redirect(new URL(`/score/${keeper.shortCode}`, base), 303);
  res.cookies.set(KEEPER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(keeper.expiresAt),
  });
  return res;
}
