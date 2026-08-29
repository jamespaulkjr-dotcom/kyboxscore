import { redirect } from "next/navigation";
import { getDefaultSportSlug } from "@kyboxscore/db";

export const dynamic = "force-dynamic";

/**
 * The scoreboard is the front door, so / goes straight there rather than
 * serving a second copy of the same content at a second URL.
 */
export default async function Home() {
  redirect(`/${await getDefaultSportSlug()}/scores`);
}
