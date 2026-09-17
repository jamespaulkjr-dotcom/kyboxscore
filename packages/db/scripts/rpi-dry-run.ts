/**
 * What the corrected formula would publish, without publishing it.
 *
 *   npm run rpi:dry-run -- --rows rows.json --live live.json --members m.json
 *
 * Reads a dump of the same rows `loadTeamInputs` selects, runs the engine, and
 * sets the result beside the run currently on the site. Writes nothing: the
 * point is to see the table before anyone else does, because correcting the
 * formula reorders a ranking coaches have been reading since August.
 *
 * Taking the rows as a dump rather than a live connection is deliberate. The
 * database on the droplet is not exposed outside its compose network, and a
 * script that cannot reach production is a script that cannot damage it.
 */
import {
  DEFAULT_CONFIG,
  FOOTBALL_NON_MEMBER_VALUE,
  computeRpi,
  type Game,
  type RpiConfig,
  type TeamInput,
} from "@kyboxscore/rpi";
import { readFileSync } from "node:fs";

type GameRow = {
  teamId: number;
  teamClass: number | null;
  gameId: number;
  localDate: string;
  opponentId: number;
  homeScore: number | null;
  awayScore: number | null;
  isHome: boolean;
  opponentAssumedFiveHundred: boolean;
  opponentClass: number | null;
  opponentExternalWp: number | null;
};

type LiveRow = {
  teamId: number;
  name: string;
  wins: number;
  losses: number;
  wp: number;
  owp: number;
  oowp: number;
  cf: number;
  rpi: number;
  stateRank: number | null;
  classRank: number | null;
  published: boolean;
  class: string | null;
  classOrdinal: number | null;
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const load = <T,>(p: string): T => JSON.parse(readFileSync(p, "utf8"));

const rows = load<GameRow[]>(arg("rows")!);
const live = load<LiveRow[]>(arg("live")!);
const members = new Set(load<{ teamId: number }[]>(arg("members")!).map((m) => m.teamId));

/** Mirrors loadTeamInputs, against the dump instead of the database. */
function buildTeams(): TeamInput[] {
  const byTeam = new Map<number, TeamInput>();
  const externalWp = new Map<number, number>();

  for (const r of rows) {
    if (!members.has(r.teamId)) {
      if (r.opponentExternalWp !== null) externalWp.set(r.opponentId, r.opponentExternalWp);
      continue;
    }
    if (!byTeam.has(r.teamId)) {
      byTeam.set(r.teamId, { teamId: r.teamId, teamClass: r.teamClass, games: [] });
    }
    if (r.opponentExternalWp !== null) externalWp.set(r.opponentId, r.opponentExternalWp);

    const missingScore = r.homeScore === null || r.awayScore === null;
    const outcome: Game["outcome"] = missingScore
      ? "tie"
      : r.homeScore! > r.awayScore!
        ? "win"
        : r.homeScore! < r.awayScore!
          ? "loss"
          : "tie";

    byTeam.get(r.teamId)!.games.push({
      gameId: r.gameId,
      opponentId: r.opponentId,
      outcome,
      isHome: r.isHome,
      localDate: r.localDate,
      opponentAssumedFiveHundred: r.opponentAssumedFiveHundred,
      opponentClass: r.opponentClass,
      missingScore,
    });
  }

  for (const [teamId, wp] of externalWp) {
    const existing = byTeam.get(teamId);
    if (existing) existing.externalWinPct = wp;
    else byTeam.set(teamId, { teamId, teamClass: null, games: [], externalWinPct: wp });
  }
  return [...byTeam.values()];
}

const config: RpiConfig = {
  ...DEFAULT_CONFIG,
  sportProfile: "football",
  nonMemberValue: FOOTBALL_NON_MEMBER_VALUE,
};

const results = computeRpi(buildTeams(), config);
const liveById = new Map(live.map((l) => [l.teamId, l]));

type Row = LiveRow & { nWp: number; nOwp: number; nOowp: number; nRpi: number; nRank: number };
const published = results
  .filter((r) => r.published && liveById.get(r.teamId)?.published)
  .map((r) => ({ ...liveById.get(r.teamId)!, nWp: r.wp, nOwp: r.owp, nOowp: r.oowp, nRpi: r.rpi, nRank: 0 }))
  .sort((a, b) => b.nRpi - a.nRpi || a.teamId - b.teamId);
published.forEach((r, i) => (r.nRank = i + 1));

const f = (n: number, w = 7) => n.toFixed(4).padStart(w);
const line = (s = "") => console.log(s);
const rule = (c = "-") => line(c.repeat(78));

line();
line(`FOOTBALL RPI DRY RUN - ${published.length} published teams, formula khsaa-2026.2`);
line(`non-member ${config.nonMemberValue}   head-to-head excluded   ${config.playDownExemptions} play-down exemptions`);
rule("=");

// ---- what changed at the top
line();
line("TOP 15 UNDER THE CORRECTED FORMULA");
rule();
line("  new  old  school                     rec     WP      RPI     was     move");
for (const r of published.slice(0, 15)) {
  const move = r.stateRank === null ? "" : r.stateRank - r.nRank;
  const sign = typeof move === "number" && move > 0 ? `+${move}` : `${move}`;
  line(
    `  ${String(r.nRank).padStart(3)}  ${String(r.stateRank ?? "-").padStart(3)}  ` +
      `${r.name.slice(0, 26).padEnd(26)} ${`${r.wins}-${r.losses}`.padEnd(6)} ` +
      `${f(r.nWp)} ${f(r.nRpi)} ${f(r.rpi)}  ${sign.padStart(5)}`
  );
}

// ---- the claim that started this
line();
line("WINNING PERCENTAGE ABOVE 1.000");
rule();
const over = published.filter((r) => r.nWp > 1).sort((a, b) => b.nWp - a.nWp);
line(`  ${over.length} of ${published.length} teams, which the old formula could not produce at all.`);
for (const r of over.slice(0, 8)) {
  line(`    ${r.name.slice(0, 26).padEnd(26)} ${`${r.wins}-${r.losses}`.padEnd(6)} WP ${f(r.nWp)}   (old ${f(r.wp)})`);
}

// ---- movement
line();
line("BIGGEST MOVERS");
rule();
const moved = published
  .filter((r) => r.stateRank !== null)
  .map((r) => ({ ...r, delta: r.stateRank! - r.nRank }))
  .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
line("  up:");
for (const r of moved.filter((m) => m.delta > 0).slice(0, 6)) {
  line(`    ${r.name.slice(0, 26).padEnd(26)} ${String(r.stateRank).padStart(3)} -> ${String(r.nRank).padStart(3)}  +${r.delta}  (${r.class})`);
}
line("  down:");
for (const r of moved.filter((m) => m.delta < 0).slice(0, 6)) {
  line(`    ${r.name.slice(0, 26).padEnd(26)} ${String(r.stateRank).padStart(3)} -> ${String(r.nRank).padStart(3)}  ${r.delta}  (${r.class})`);
}
const unchanged = moved.filter((m) => m.delta === 0).length;
const big = moved.filter((m) => Math.abs(m.delta) >= 20).length;
line();
line(`  ${unchanged} teams hold their rank, ${big} move 20 places or more.`);
line(`  mean absolute move ${(moved.reduce((s, m) => s + Math.abs(m.delta), 0) / moved.length).toFixed(1)} places.`);

// ---- does it still favour small schools
line();
line("BY CLASSIFICATION - is the small-school skew gone?");
rule();
line("  class  teams   best rank (old -> new)   mean rank (old -> new)   mean WP");
const byClass = new Map<string, Row[]>();
for (const r of published) {
  if (!r.class) continue;
  if (!byClass.has(r.class)) byClass.set(r.class, []);
  byClass.get(r.class)!.push(r);
}
for (const cls of [...byClass.keys()].sort()) {
  const g = byClass.get(cls)!;
  const oldBest = Math.min(...g.map((r) => r.stateRank ?? 999));
  const newBest = Math.min(...g.map((r) => r.nRank));
  const oldMean = g.reduce((s, r) => s + (r.stateRank ?? 0), 0) / g.length;
  const newMean = g.reduce((s, r) => s + r.nRank, 0) / g.length;
  const meanWp = g.reduce((s, r) => s + r.nWp, 0) / g.length;
  line(
    `  ${cls.padEnd(6)} ${String(g.length).padStart(3)}     ` +
      `${String(oldBest).padStart(4)} -> ${String(newBest).padStart(4)}            ` +
      `${oldMean.toFixed(0).padStart(4)} -> ${newMean.toFixed(0).padStart(4)}          ${f(meanWp, 6)}`
  );
}

// ---- play-downs, the rule that was missing entirely
line();
line("PLAY-DOWN PENALTY - 341 games previously carried none");
rule();
const downs = results.flatMap((r) =>
  r.inputs.filter((i) => i.classDelta < 0).map((i) => ({ ...i, teamId: r.teamId }))
);
const exempted = downs.filter((d) => d.playDownExempt).length;
const penalised = downs.filter((d) => !d.playDownExempt && d.resultValue > 0).length;
line(`  ${downs.length} play-down contests: ${exempted} exempted, ${penalised} wins now discounted.`);
const worst = downs
  .filter((d) => !d.playDownExempt && d.resultValue > 0)
  .sort((a, b) => a.gameValue - b.gameValue)[0];
if (worst) {
  const t = liveById.get(worst.teamId);
  line(`  steepest discount: ${t?.name ?? worst.teamId} won a game worth ${worst.gameValue.toFixed(5)} (${worst.classDelta} classes down).`);
}

line();
rule("=");
line("Nothing was written. Every number above is computed, not stored.");
line();
