"use server";

import { revalidatePath } from "next/cache";
import { setTimeZoneForCounties, setTimeZoneForSchools } from "@kyboxscore/db";
import { parseCsv } from "@kyboxscore/parsers";
import { requireAdmin } from "../../../lib/auth";

export type TzState = { error?: string; moved?: number; zone?: string };

/**
 * Accepts county names, or school names for the towns that state no county.
 * One per line, or comma separated — a person pasting a list should not have
 * to think about the format.
 */
export async function setZoneAction(
  _prev: TzState,
  formData: FormData
): Promise<TzState> {
  await requireAdmin("/admin/time-zones");
  const text = String(formData.get("text") ?? "");
  const zone = String(formData.get("zone") ?? "");

  if (zone !== "America/Chicago" && zone !== "America/New_York") {
    return { error: "Choose a time zone." };
  }
  const names = parseCsv(text)
    .flat()
    .map((n) => n.trim().replace(/\s+County$/i, ""))
    .filter(Boolean);
  if (names.length === 0) return { error: "Paste at least one county or school." };

  const byCounty = await setTimeZoneForCounties(names, zone);
  // Anything that was not a county is tried as a school slug, so a town like
  // Paducah Tilghman can be listed alongside the counties.
  const slugs = names.map((n) =>
    n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  );
  const bySchool = await setTimeZoneForSchools(slugs, zone);

  revalidatePath("/admin/time-zones");
  return { moved: byCounty + bySchool, zone };
}
