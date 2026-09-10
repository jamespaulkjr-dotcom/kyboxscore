/**
 * Splitting a sport's teams into the alignment one level above the district.
 *
 * Football ranks inside a classification, basketball inside a region. Both sit
 * directly above the district and only one of them exists for any given sport,
 * so the RPI page and the standings page group by the same field and differ
 * only in the word they print. Pulled out of both so the pills, the URLs and
 * the headings cannot drift apart.
 */

/** The shape both queries return: whatever the sport's grouping alignment is. */
export type Grouped = {
  groupName: string | null;
  groupSlug: string | null;
  groupKind: "classification" | "region" | null;
  groupOrdinal: number | null;
};

export type AlignmentGroup<T> = {
  /** The alignment slug, "class-3a" or "region-5". */
  slug: string;
  /** What `?class=` carries: "3a" rather than "class-3a". */
  param: string;
  /** "3A", or "Region 5". */
  name: string;
  /** "Class 3A", but "Region 5": a region's name already carries its noun. */
  label: string;
  /** "class" or "region", for prose and pills that have to name the thing. */
  noun: string;
  ordinal: number;
  rows: T[];
};

/** "3a" from "class-3a", so a hand-typed URL is the obvious one. */
export function groupParam(slug: string): string {
  return slug.replace(/^class-/, "");
}

/**
 * Groups rows in the order they arrive, which both queries already sort by
 * ordinal, then by whatever secondary key that page needs.
 */
export function groupRows<T extends Grouped>(rows: T[]): AlignmentGroup<T>[] {
  const groups = new Map<string, AlignmentGroup<T>>();
  for (const row of rows) {
    if (!row.groupSlug || !row.groupName) continue;
    let group = groups.get(row.groupSlug);
    if (!group) {
      const region = row.groupKind === "region";
      group = {
        slug: row.groupSlug,
        param: groupParam(row.groupSlug),
        name: row.groupName,
        label: region ? row.groupName : `Class ${row.groupName}`,
        noun: region ? "region" : "class",
        ordinal: row.groupOrdinal ?? 999,
        rows: [],
      };
      groups.set(row.groupSlug, group);
    }
    group.rows.push(row);
  }
  return [...groups.values()].sort((a, b) => a.ordinal - b.ordinal);
}

/**
 * The group a `?class=` names, by the pretty form or the raw slug. Returns
 * undefined for anything else, which every caller turns into a 404: a class
 * nobody can be in is a wrong URL, not a page with an empty table.
 */
export function findGroup<T>(
  groups: AlignmentGroup<T>[],
  param: string
): AlignmentGroup<T> | undefined {
  const wanted = param.toLowerCase();
  return groups.find((g) => g.param === wanted || g.slug === wanted);
}

/** What to call the grouping when no group is in hand, as in an empty season. */
export function groupNoun<T>(groups: AlignmentGroup<T>[]): string {
  return groups[0]?.noun ?? "class";
}
