/**
 * Matching a parsed row to a player on the roster.
 *
 * The MaxPreps .txt carries no names - only jersey numbers - so matching is
 * jersey against the roster for one team season. That is a much narrower
 * problem than name matching, and it fails in exactly two ways worth handling:
 * a jersey nobody on the roster wears, and a jersey two players share.
 *
 * Jerseys are compared as strings. "00" and "0" are different players, and
 * treating them as numbers silently merges two people.
 */

export type RosterCandidate = {
  playerId: number;
  name: string;
  jersey: string | null;
};

export type MatchMethod = "jersey" | "alias" | "unmatched";

export type RowMatch = {
  playerId: number | null;
  method: MatchMethod;
  confidence: number | null;
  /** Why a row is unmatched, shown to the coach in the preview. */
  reason?: "no_such_jersey" | "ambiguous_jersey" | "blank_jersey";
  /** Populated for an ambiguous jersey so the coach can pick between them. */
  candidates?: RosterCandidate[];
};

/** Trim and drop a leading '#'. Nothing else - '00' must survive intact. */
export function normalizeJersey(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/^#/, "");
}

/**
 * A remembered correction wins over the roster, because it is a human decision
 * about this exact team and this exact vendor spelling. Aliases are keyed by
 * the raw jersey string for .txt imports and by the raw name for CSV.
 */
export function matchRow(
  rawJersey: string | null,
  roster: RosterCandidate[],
  aliases: Map<string, number>
): RowMatch {
  const jersey = normalizeJersey(rawJersey);
  if (jersey === "") {
    return { playerId: null, method: "unmatched", confidence: null, reason: "blank_jersey" };
  }

  const aliased = aliases.get(jersey);
  if (aliased !== undefined) {
    return { playerId: aliased, method: "alias", confidence: 1 };
  }

  const hits = roster.filter((r) => normalizeJersey(r.jersey) === jersey);

  if (hits.length === 1) {
    return { playerId: hits[0].playerId, method: "jersey", confidence: 1 };
  }
  if (hits.length === 0) {
    return {
      playerId: null,
      method: "unmatched",
      confidence: null,
      reason: "no_such_jersey",
    };
  }
  // Two players wearing the same number is legal in the data model on purpose
  // (call-ups, imperfect sources). It is never guessable, so it goes to a human.
  return {
    playerId: null,
    method: "unmatched",
    confidence: null,
    reason: "ambiguous_jersey",
    candidates: hits,
  };
}

export type MatchSummary = {
  total: number;
  matched: number;
  unmatched: number;
  didNotPlay: number;
};

export function summarize(
  matches: RowMatch[],
  didNotPlay: boolean[]
): MatchSummary {
  return {
    total: matches.length,
    matched: matches.filter((m) => m.playerId !== null).length,
    unmatched: matches.filter((m) => m.playerId === null).length,
    didNotPlay: didNotPlay.filter(Boolean).length,
  };
}
