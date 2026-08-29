import { redirect } from "next/navigation";
import { listSports } from "@kyboxscore/db";

export const dynamic = "force-dynamic";

/**
 * The scoreboard is the product's front door, so / goes straight there rather
 * than serving a second copy of the same content at a second URL.
 */
export default async function Home() {
  const sports = await listSports();
  redirect(`/${sports[0]?.slug ?? "basketball"}/scores`);
}
