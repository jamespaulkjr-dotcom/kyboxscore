/**
 * KHSAA Rating Percentage Index.
 *
 *   RPI = (WP * 0.35) + (OWP * 0.35) + (OOWP * 0.30)
 *
 * Rules implemented, from KHSAA's published method:
 *   - Margin of victory is never a factor. Only win / loss / tie.
 *   - Regular season games only; forfeits count as a normal result.
 *   - Non-KHSAA opponents carry a fixed value: .51060 in football, .53 in
 *     every other sport. In-state home school teams take the same value.
 *   - Head to head games are excluded when computing an opponent's winning
 *     percentage, and that exclusion extends through OOWP.
 *   - Football, and only football, weights a WIN by the class of the
 *     opponent. See `gameValue` below.
 *   - No RPI is published for a team with a missing score.
 *
 * Shadow RPI is the same computation with `shadow: true`, which lets out of
 * state opponents carry their real winning percentage instead of the fixed
 * non-member value. Nothing else changes, so the delta isolates exactly that
 * assumption.
 *
 * ── THE CLASS WEIGHT ─────────────────────────────────────────────────────
 * KHSAA publishes a weight per classification:
 *
 *     1A 1.323   2A 1.521   3A 1.749   4A 2.011   5A 2.313   6A 2.660
 *
 * A win is scored as the opponent's weight divided by the team's own. Their
 * own worked example: Ashland Blazer (4A) over Harlan County (5A) is
 * 2.313/2.011 = 1.15017, and over Russell (3A) is 1.749/2.011 = 0.86972.
 *
 * Those weights are a geometric series in 1.15 - but they are PUBLISHED
 * ROUNDED, and KHSAA divides the rounded figures. So the table is the rule
 * and `1.15 ** delta` is not: Raceland (1A) over Lawrence County (3A) is
 * 1.749/1.323 = 1.32200 in their example, where 1.15 ** 2 would give 1.3225.
 * The gap is ~2e-4 per game, which is small but reproduces as a visible
 * mismatch against their published ratings. Divide the table.
 *
 * This is why a football WP can exceed 1.000, and KHSAA says so explicitly:
 * "It is possible to get OWP, OOWP, and even RPI that is greater than 1.000
 * due to class weights." Nothing here clamps to one.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ── STILL UNCONFIRMED ────────────────────────────────────────────────────
 * Two details are not settled by KHSAA's documents and are isolated behind
 * config rather than guessed silently:
 *
 *   1. A tie is 0.5, unweighted. Their rule reads "if the game is a win for
 *      the team", so the weight demonstrably applies to wins; it says nothing
 *      about ties. Kentucky football has used overtime for years, so this may
 *      never fire. `weightedTies` exists to flip it if they confirm otherwise.
 *   2. `playDownExemptions` are consumed by the first two CONTESTS against a
 *      smaller class, in date order, whatever the result. The rule says
 *      "contests", not "wins", so a play-down loss burns one.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type Game = {
  gameId: number;
  opponentId: number;
  /** 'win' | 'loss' | 'tie'. Margin is deliberately absent. */
  outcome: "win" | "loss" | "tie";
  isHome: boolean;
  /**
   * Local date, ISO. Play-down exemptions go to the first two such contests
   * of the season, so the order games are played in is part of the formula.
   */
  localDate: string;
  /** Out of state, or an in-state home school team. Fixed value, see config. */
  opponentAssumedFiveHundred: boolean;
  /**
   * Classification ordinal (1A=1 ... 6A=6). Null when unclassified, which
   * KHSAA treats as the team's own class - so the weight is exactly 1.
   */
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
  /**
   * KHSAA's published weight per classification, indexed by ordinal (1A=1).
   * Index 0 is unused so the ordinal indexes directly.
   */
  classWeights: readonly number[];
  /** Contests against a smaller class exempted from the weight, per season. */
  playDownExemptions: number;
  /** The fixed value a non-KHSAA opponent contributes. Reviewed every 2 years. */
  nonMemberValue: number;
  /** Unconfirmed; see the header. Ties are unweighted until KHSAA says so. */
  weightedTies: boolean;
  excludeHeadToHead: boolean;
  shadow: boolean;
  sportProfile: "standard" | "football";
};

/**
 * Standard profile. `runRpi` overrides `nonMemberValue` and `sportProfile`
 * per sport - football is the one that differs, in both.
 */
/**
 * KHSAA's published class weights, 1A through 6A. A 15% step between classes,
 * rounded as published - see the header on why the rounding is load bearing.
 * There is no weight for 6-player (baseline 1.0) or 8-player (1.15) football;
 * Kentucky fields no such teams, and an unweighted 1.0 is already the
 * fallback for a team with no classification.
 */
export const KHSAA_CLASS_WEIGHTS = [
  NaN, 1.323, 1.521, 1.749, 2.011, 2.313, 2.66,
] as const;

export const DEFAULT_CONFIG: RpiConfig = {
  weights: { wp: 0.35, owp: 0.35, oowp: 0.3 },
  classWeights: KHSAA_CLASS_WEIGHTS,
  playDownExemptions: 2,
  // .53 for every sport but football, set on a two-year basis from 2023-24.
  nonMemberValue: 0.53,
  weightedTies: false,
  excludeHeadToHead: true,
  shadow: false,
  sportProfile: "standard",
};

/** Football's own non-member value, from pre-COVID results. Reviewed yearly. */
export const FOOTBALL_NON_MEMBER_VALUE = 0.5106;

export type RpiInput = {
  gameId: number;
  opponentId: number;
  opponentActualWp: number | null;
  opponentAppliedWp: number;
  appliedWpReason: "actual" | "flat_non_member" | "shadow_actual";
  /** The unweighted 1 / 0.5 / 0. */
  resultValue: number;
  /** What actually entered WP: the class-weighted value in football. */
  gameValue: number;
  classDelta: number;
  /** True when a play-down exemption neutralised the weight for this game. */
  playDownExempt: boolean;
};

export type RpiResult = {
  teamId: number;
  wins: number;
  losses: number;
  ties: number;
  wp: number;
  owp: number;
  oowp: number;
  rpi: number;
  published: boolean;
  suppressedReason?: "missing_scores" | "no_games";
  /** The arithmetic, kept so a disputing coach can be shown the numbers. */
  inputs: RpiInput[];
};

/** The unweighted result value. Margin never enters. */
function resultValue(g: Game): number {
  return g.outcome === "win" ? 1 : g.outcome === "tie" ? 0.5 : 0;
}

/**
 * What one game contributes to a winning percentage.
 *
 * Outside football this is just the result. In football a WIN is scaled by
 * the class difference; a loss is zero whoever it was against, so playing up
 * earns nothing unless you win.
 */
function gameValue(
  g: Game,
  teamClass: number | null,
  cfg: RpiConfig,
  exempt: boolean
): number {
  const base = resultValue(g);
  if (cfg.sportProfile !== "football" || base === 0) return base;
  if (g.outcome === "tie" && !cfg.weightedTies) return base;
  // An unclassified or out of state opponent is assumed to be the team's own
  // class, which is a weight of exactly 1 - not a missing weight.
  if (teamClass === null || g.opponentClass === null) return base;
  if (exempt) return base;
  const mine = cfg.classWeights[teamClass];
  const theirs = cfg.classWeights[g.opponentClass];
  // A class ordinal outside the published table is a data problem, not a
  // rating of zero. Fall back to treating the game as same-class.
  if (!Number.isFinite(mine) || !Number.isFinite(theirs)) return base;
  return base * (theirs / mine);
}

/**
 * Which games a play-down exemption covers.
 *
 * The first two contests of the season against a smaller class, in the order
 * they were played. A loss burns one: the rule counts contests, not wins.
 * Returns game ids rather than mutating, so the same schedule can be scored
 * with and without exemptions - which OWP and OOWP require, since KHSAA
 * grants none there.
 */
function exemptGameIds(
  team: TeamInput,
  cfg: RpiConfig,
  budget: number
): Set<number> {
  const exempt = new Set<number>();
  if (cfg.sportProfile !== "football" || budget <= 0 || team.teamClass === null) {
    return exempt;
  }
  const chronological = [...team.games].sort(
    (a, b) => a.localDate.localeCompare(b.localDate) || a.gameId - b.gameId
  );
  for (const g of chronological) {
    if (exempt.size >= budget) break;
    if (g.opponentClass !== null && g.opponentClass < team.teamClass) {
      exempt.add(g.gameId);
    }
  }
  return exempt;
}

/**
 * Winning percentage over a set of games.
 *
 * `teamClass` is whose class the weights are relative to - always the team
 * whose percentage this is, never the team whose RPI is being computed.
 */
export function winPct(
  games: Game[],
  teamClass: number | null,
  cfg: RpiConfig,
  exempt: Set<number> = new Set()
): number | null {
  if (games.length === 0) return null;
  const total = games.reduce(
    (sum, g) => sum + gameValue(g, teamClass, cfg, exempt.has(g.gameId)),
    0
  );
  return total / games.length;
}

/**
 * Compute official (or shadow) RPI for every team in one sport season.
 * `teams` must contain every in-state team; out of state opponents are
 * supplied through `externalWinPct` on their own TeamInput, or take the
 * fixed non-member value.
 */
export function computeRpi(
  teams: TeamInput[],
  config: Partial<RpiConfig> = {}
): RpiResult[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const byId = new Map(teams.map((t) => [t.teamId, t]));

  // Exemptions are a property of a team's own season, so they are resolved
  // once. OWP and OOWP deliberately do not use them.
  const exemptOf = new Map<number, Set<number>>();
  for (const t of teams) {
    exemptOf.set(t.teamId, exemptGameIds(t, cfg, cfg.playDownExemptions));
  }

  // Pass 1: each team's own WP, with its exemptions applied.
  const wpOf = new Map<number, number>();
  for (const t of teams) {
    wpOf.set(
      t.teamId,
      winPct(t.games, t.teamClass, cfg, exemptOf.get(t.teamId)) ?? 0
    );
  }

  /**
   * An opponent's WP as it enters somebody else's OWP: head to head removed,
   * and no play-down exemptions - KHSAA grants those only in a team's own WP.
   *
   * Null when nothing is left to average, which the callers turn into the
   * non-member value rather than a zero. An opponent we hold one game for is
   * an opponent we know nothing about once that game is removed; scoring that
   * as winless would punish a team for who it played.
   */
  const opponentWp = (opp: TeamInput, selfId: number): number | null => {
    const games = cfg.excludeHeadToHead
      ? opp.games.filter((g) => g.opponentId !== selfId)
      : opp.games;
    return winPct(games, opp.teamClass, cfg);
  };

  /** The WP actually applied for an opponent, plus why. */
  const appliedWp = (
    g: Game,
    selfId: number
  ): { value: number; actual: number | null; reason: RpiInput["appliedWpReason"] } => {
    const opp = byId.get(g.opponentId);
    // No `?? wpOf` fallback: falling back to the opponent's full winning
    // percentage would put the head to head game straight back in, which is
    // the one thing the exclusion exists to prevent.
    const actual = opp
      ? (opp.externalWinPct ?? opponentWp(opp, selfId))
      : null;
    if (g.opponentAssumedFiveHundred) {
      if (cfg.shadow && actual !== null) {
        return { value: actual, actual, reason: "shadow_actual" };
      }
      return { value: cfg.nonMemberValue, actual, reason: "flat_non_member" };
    }
    return { value: actual ?? cfg.nonMemberValue, actual, reason: "actual" };
  };

  /**
   * A team's OWP: the average winning percentage of everybody it played, each
   * computed with their game against this team removed.
   *
   * The OOWP term reuses this untouched, which is the part that is easy to get
   * wrong. The exclusion belongs to the pair being averaged, NOT to the team
   * whose rating is being computed - so when Raceland's OWP is used inside
   * Ashland's OOWP, Ashland is still one of the opponents Raceland is averaged
   * over. KHSAA's example prints exactly that: "Raceland OWP Calculation -
   * Ashland Blazer 0.89110", which is Ashland's WP over its other nine games.
   *
   * Removing the rated team here instead is the intuitive reading and it is
   * wrong; it moved every OOWP in the example by about .02.
   */
  const owpOf = (t: TeamInput): number => {
    if (t.games.length === 0) return cfg.nonMemberValue;
    return (
      t.games.reduce((s, g) => s + appliedWp(g, t.teamId).value, 0) /
      t.games.length
    );
  };

  return teams.map((t) => {
    const wins = t.games.filter((g) => g.outcome === "win").length;
    const losses = t.games.filter((g) => g.outcome === "loss").length;
    const ties = t.games.filter((g) => g.outcome === "tie").length;
    const exempt = exemptOf.get(t.teamId)!;

    const inputs: RpiInput[] = t.games.map((g) => {
      const a = appliedWp(g, t.teamId);
      const isExempt = exempt.has(g.gameId);
      return {
        gameId: g.gameId,
        opponentId: g.opponentId,
        opponentActualWp: a.actual,
        opponentAppliedWp: a.value,
        appliedWpReason: a.reason,
        resultValue: resultValue(g),
        gameValue: gameValue(g, t.teamClass, cfg, isExempt),
        classDelta:
          g.opponentClass !== null && t.teamClass !== null
            ? g.opponentClass - t.teamClass
            : 0,
        playDownExempt: isExempt,
      };
    });

    const wp = wpOf.get(t.teamId)!;
    const owp = t.games.length ? owpOf(t) : 0;
    const oowp = t.games.length
      ? t.games.reduce((s, g) => {
          // An opponent pinned to the non-member value has no schedule we can
          // see. We hold some of their overall records, for the shadow
          // rating, and holding one must not change this term: an opponent's
          // opponents are still unknown either way.
          //
          // This was the bug. Typing a record put the opponent into the team
          // set, `owpFor` then removed the head-to-head, found that the only
          // game we hold for them was the one just removed, and returned 0
          // instead of the value an untyped opponent got. Entering a record
          // therefore moved the OFFICIAL rating of 27 Kentucky teams, which
          // is precisely what the page promises it cannot do.
          if (g.opponentAssumedFiveHundred) return s + cfg.nonMemberValue;
          const opp = byId.get(g.opponentId);
          return s + (opp ? owpOf(opp) : cfg.nonMemberValue);
        }, 0) / t.games.length
      : 0;

    const rpi =
      wp * cfg.weights.wp + owp * cfg.weights.owp + oowp * cfg.weights.oowp;

    const missing = t.games.some((g) => g.missingScore);
    return {
      teamId: t.teamId,
      wins,
      losses,
      ties,
      wp,
      owp,
      oowp,
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
