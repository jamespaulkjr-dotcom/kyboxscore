/**
 * KHSAA Rating Percentage Index.
 *
 *   RPI = (WP * 0.35) + (OWP * 0.35) + (OOWP * 0.30)
 *
 * Rules implemented, from the brief:
 *   - Margin of victory is never a factor. Only win / loss / tie.
 *   - Out of state opponents are assigned a flat .500 WP. So are in-state
 *     home school teams playing a member school.
 *   - Regular season games only.
 *   - A class factor rewards playing up, roughly 15% per classification,
 *     baseline 1.0.
 *   - Football assigns win values differently from the other sports.
 *   - No RPI is published for a team with a missing score.
 *
 * Shadow RPI is the same computation with `shadow: true`, which lets out of
 * state opponents carry their real winning percentage instead of the flat
 * .500. Nothing else changes, so the delta isolates exactly that assumption.
 *
 * ── UNCONFIRMED AGAINST KHSAA'S PUBLISHED METHOD ─────────────────────────
 * Three details are not pinned down in the brief and are isolated behind
 * config rather than guessed silently. They must be checked against KHSAA's
 * own documentation before any rating is published:
 *
 *   1. `excludeHeadToHead` - the classic NCAA RPI removes games against the
 *      team being rated when computing that team's OWP. Default false here.
 *   2. `classFactorStep` - 15% per classification is stated as "roughly".
 *      Applied as a multiplier on the team's own WP.
 *   3. `footballWinValues` - "a different WP value assignment" is not
 *      specified. The default below mirrors the standard 1/0.5/0 so football
 *      is not silently wrong; replace once the real table is known.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type Game = {
  gameId: number;
  opponentId: number;
  /** 'win' | 'loss' | 'tie'. Margin is deliberately absent. */
  outcome: "win" | "loss" | "tie";
  isHome: boolean;
  /** Out of state, or an in-state home school team. Flat .500 under official. */
  opponentAssumedFiveHundred: boolean;
  /** Classification ordinal (1A=1 ... 6A=6). Null when unclassified. */
  opponentClass: number | null;
  /** True when the game has no recorded score. Suppresses the team's RPI. */
  missingScore: boolean;
};

export type TeamInput = {
  teamId: number;
  teamClass: number | null;
  games: Game[];
  /** Real W-L for out of state teams, used only by Shadow RPI. */
  externalWinPct?: number;
};

export type RpiConfig = {
  weights: { wp: number; owp: number; oowp: number };
  classFactorStep: number;
  excludeHeadToHead: boolean;
  shadow: boolean;
  sportProfile: "standard" | "football";
};

export const DEFAULT_CONFIG: RpiConfig = {
  weights: { wp: 0.35, owp: 0.35, oowp: 0.3 },
  classFactorStep: 0.15,
  excludeHeadToHead: false,
  shadow: false,
  sportProfile: "standard",
};

export type RpiInput = {
  gameId: number;
  opponentId: number;
  opponentActualWp: number | null;
  opponentAppliedWp: number;
  appliedWpReason: "actual" | "flat_500_assumed" | "shadow_actual";
  resultValue: number;
  classDelta: number;
};

export type RpiResult = {
  teamId: number;
  wins: number;
  losses: number;
  ties: number;
  wp: number;
  owp: number;
  oowp: number;
  classFactor: number;
  rpi: number;
  published: boolean;
  suppressedReason?: "missing_scores" | "no_games";
  /** The arithmetic, kept so a disputing coach can be shown the numbers. */
  inputs: RpiInput[];
};

function resultValue(g: Game, profile: RpiConfig["sportProfile"]): number {
  // Football's assignment is a documented unknown; both profiles currently
  // use the standard values so football is not quietly given wrong numbers.
  void profile;
  return g.outcome === "win" ? 1 : g.outcome === "tie" ? 0.5 : 0;
}

/** Winning percentage from a team's own games. Ties count a half. */
export function winPct(games: Game[], profile: RpiConfig["sportProfile"]): number {
  if (games.length === 0) return 0;
  const total = games.reduce((sum, g) => sum + resultValue(g, profile), 0);
  return total / games.length;
}

function classFactor(team: TeamInput, cfg: RpiConfig): number {
  if (team.teamClass === null) return 1;
  const ups = team.games.filter(
    (g) => g.opponentClass !== null && g.opponentClass > team.teamClass!
  );
  if (ups.length === 0) return 1;
  // Average number of classifications played up, scaled by the step.
  const avgStep =
    ups.reduce((s, g) => s + (g.opponentClass! - team.teamClass!), 0) /
    team.games.length;
  return 1 + avgStep * cfg.classFactorStep;
}

/**
 * Compute official (or shadow) RPI for every team in one sport season.
 * `teams` must contain every in-state team; out of state opponents are
 * supplied through `externalWinPct` on their own TeamInput, or assumed .500.
 */
export function computeRpi(
  teams: TeamInput[],
  config: Partial<RpiConfig> = {}
): RpiResult[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const byId = new Map(teams.map((t) => [t.teamId, t]));

  // Pass 1: each team's own WP.
  const wpOf = new Map<number, number>();
  for (const t of teams) wpOf.set(t.teamId, winPct(t.games, cfg.sportProfile));

  /** The WP actually applied for an opponent, plus why. */
  const appliedWp = (
    g: Game
  ): { value: number; actual: number | null; reason: RpiInput["appliedWpReason"] } => {
    const opp = byId.get(g.opponentId);
    const actual = opp
      ? (opp.externalWinPct ?? wpOf.get(opp.teamId) ?? null)
      : null;
    if (g.opponentAssumedFiveHundred) {
      if (cfg.shadow && actual !== null) {
        return { value: actual, actual, reason: "shadow_actual" };
      }
      return { value: 0.5, actual, reason: "flat_500_assumed" };
    }
    return { value: actual ?? 0.5, actual, reason: "actual" };
  };

  /** Opponents' WP averaged - optionally excluding games against `selfId`. */
  const owpFor = (t: TeamInput, selfId?: number): number => {
    if (t.games.length === 0) return 0;
    const games =
      cfg.excludeHeadToHead && selfId !== undefined
        ? t.games.filter((g) => g.opponentId !== selfId)
        : t.games;
    if (games.length === 0) return 0;
    return games.reduce((s, g) => s + appliedWp(g).value, 0) / games.length;
  };

  return teams.map((t) => {
    const wins = t.games.filter((g) => g.outcome === "win").length;
    const losses = t.games.filter((g) => g.outcome === "loss").length;
    const ties = t.games.filter((g) => g.outcome === "tie").length;

    const inputs: RpiInput[] = t.games.map((g) => {
      const a = appliedWp(g);
      return {
        gameId: g.gameId,
        opponentId: g.opponentId,
        opponentActualWp: a.actual,
        opponentAppliedWp: a.value,
        appliedWpReason: a.reason,
        resultValue: resultValue(g, cfg.sportProfile),
        classDelta:
          g.opponentClass !== null && t.teamClass !== null
            ? g.opponentClass - t.teamClass
            : 0,
      };
    });

    const wp = wpOf.get(t.teamId)!;
    const owp = t.games.length
      ? t.games.reduce((s, g) => s + appliedWp(g).value, 0) / t.games.length
      : 0;
    const oowp = t.games.length
      ? t.games.reduce((s, g) => {
          const opp = byId.get(g.opponentId);
          return s + (opp ? owpFor(opp, t.teamId) : 0.5);
        }, 0) / t.games.length
      : 0;

    const cf = classFactor(t, cfg);
    const raw =
      wp * cfg.weights.wp + owp * cfg.weights.owp + oowp * cfg.weights.oowp;
    const rpi = raw * cf;

    const missing = t.games.some((g) => g.missingScore);
    return {
      teamId: t.teamId,
      wins,
      losses,
      ties,
      wp,
      owp,
      oowp,
      classFactor: cf,
      rpi,
      published: !missing && t.games.length > 0,
      suppressedReason: missing
        ? "missing_scores"
        : t.games.length === 0
          ? "no_games"
          : undefined,
      inputs,
    };
  });
}

/** Official and shadow side by side, with the delta the coaches ask about. */
export function computeBoth(
  teams: TeamInput[],
  config: Partial<RpiConfig> = {}
): { official: RpiResult[]; shadow: RpiResult[]; delta: Map<number, number> } {
  const official = computeRpi(teams, { ...config, shadow: false });
  const shadow = computeRpi(teams, { ...config, shadow: true });
  const byId = new Map(shadow.map((r) => [r.teamId, r]));
  const delta = new Map<number, number>();
  for (const o of official) {
    const s = byId.get(o.teamId);
    if (s) delta.set(o.teamId, s.rpi - o.rpi);
  }
  return { official, shadow, delta };
}
