/**
 * Imports Ohio opponents' records from OHSAA's weekly Harbin computer ratings.
 *
 *   npm run harbin -- --dry-run
 *   npm run harbin -- --url <pdf>       # a specific report, for testing
 *
 * OHSAA is the only permitted Ohio source that carries win-loss records: their
 * own football hub links MaxPreps, which CLAUDE.md bans, and the alternatives
 * are private sites rather than the publishing association. See
 * docs/out-of-state-sources.md.
 *
 * The report is released every Tuesday from the fifth week of the season, so
 * for most of the year there is nothing to fetch and this exits saying so.
 * Designed to run daily and be a no-op until the numbers move.
 */
import { spawnSync } from "node:child_process";
import { setOutOfStateRecords, sql } from "../src/index.ts";

const args = process.argv.slice(2);
const arg = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? undefined : args[i + 1];
};
const dryRun = args.includes("--dry-run");

const BASE = "https://ohsaaweb.blob.core.windows.net/files/Sports/Football";
/** Plausibility rails: this writes to production unattended. */
const MIN_ROWS = 400;
const MAX_GAMES = 20;

type Row = { name: string; city: string; ohsaaId: string; wins: number; losses: number };

/**
 * `pdftotext -layout` rather than reading the PDF by hand. The first attempt
 * pulled the text out with zlib and a regex and silently dropped a third of
 * the rows: the report is drawn rotated, one word per show-operator, with
 * column gaps expressed as kerning. Rank numbers skipped, which is the only
 * reason it was caught. Do not go back to that.
 */
function pdfToText(pdf: Buffer): string {
  const out = spawnSync("pdftotext", ["-layout", "-", "-"], {
    input: pdf,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (out.error || out.status !== 0) {
    throw new Error(
      `pdftotext failed (${out.status}): ${out.stderr?.toString().slice(0, 200)}. ` +
        `The image needs poppler-utils.`
    );
  }
  return out.stdout.toString().replace(/\u2010/g, "-");
}

/**
 * One team per line, and the columns drift, so anchor on both ends: rank and
 * the four rating figures on the left, then school id, wins, losses, division
 * and region on the right. Region reaches 28, because Ohio numbers regions
 * across the whole state rather than within a division: assuming one digit
 * was what dropped 472 of 666 rows on the second attempt.
 */
const ROW =
  /^\s*(\d{1,3})\s+(\d+\.?\d*)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(.+?)\s\s+(.+?)\s+(\d{1,5})\s+(\d{1,2})\s+(\d{1,2})\s*(I{1,3}|IV|VI{0,2}|V)\s+(\d{1,2})\s*$/;
/** Anything shaped like a data row, so a row we fail to read is loud. */
const DATA_SHAPED = /^\s*\d{1,3}\s+\d+\.?\d*\s+[\d.]+\s+[\d.]+\s+\d+\s/;

function parseHarbin(pdf: Buffer): { rows: Row[]; unread: string[]; regions: number } {
  const lines = pdfToText(pdf).split("\n");
  const rows: Row[] = [];
  const unread: string[] = [];
  const regions = new Set<number>();
  for (const line of lines) {
    const m = ROW.exec(line);
    if (m) {
      rows.push({
        name: m[7].trim(),
        city: m[6].trim(),
        ohsaaId: m[8],
        wins: Number(m[9]),
        losses: Number(m[10]),
      });
      regions.add(Number(m[12]));
    } else if (DATA_SHAPED.test(line)) {
      unread.push(line.trim());
    }
  }
  return { rows, unread, regions: regions.size };
}

const norm = (s: string) =>
  s.toLowerCase()
    .replace(/\(.*?\)/g, " ")
    // Punctuation first: `\b&\b` never matches, because & is not a word
    // character, and "Aiken High School & Junior" kept the ampersand and
    // matched nothing.
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(jr|sr|high|school|junior|and)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Tuesdays of the current season, newest first, that could hold a report. */
function candidateDates(): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let back = 0; back < 14; back++) {
    const d = new Date(today);
    d.setDate(d.getDate() - back);
    if (d.getDay() !== 2) continue;                      // Tuesdays only
    out.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
  }
  return out;
}

async function findReport(): Promise<{ url: string; date: string } | null> {
  const year = new Date().getFullYear();
  for (const ymd of candidateDates()) {
    const url = `${BASE}/${year}/${ymd}HarbinReport.pdf`;
    const res = await fetch(url, { method: "HEAD" });
    if (res.ok) {
      return { url, date: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6)}` };
    }
  }
  return null;
}

async function main() {
  const override = arg("url");
  const found = override
    ? { url: override, date: new Date().toISOString().slice(0, 10) }
    : await findReport();
  if (!found) {
    console.log(
      "no Harbin report published yet for this season " +
        "(released Tuesdays from week five); nothing to do"
    );
    return;
  }

  const [season] = await sql<{ id: number; asOf: string | null }[]>`
    SELECT ss.id::int,
           (SELECT max(r.as_of)::text FROM out_of_state_record r
             JOIN team t ON t.id = r.team_id
             JOIN school sc ON sc.id = t.school_id AND sc.state = 'OH'
            WHERE r.sport_season_id = ss.id) AS "asOf"
    FROM sport_season ss JOIN sport sp ON sp.id = ss.sport_id
    WHERE sp.slug = 'football' AND ss.is_current`;
  if (!season) { console.log("no football season open"); return; }
  if (!override && season.asOf && season.asOf >= found.date) {
    console.log(`already imported ${found.date}; nothing to do`);
    return;
  }

  const res = await fetch(found.url);
  if (!res.ok) { console.log(`report fetch failed: ${res.status}`); process.exitCode = 1; return; }
  const { rows, unread, regions } = parseHarbin(Buffer.from(await res.arrayBuffer()));
  console.log(`${found.url}: ${rows.length} rows, ${regions} regions, ${unread.length} unread`);

  // A report we cannot read whole must not become records we cannot defend.
  // The useful rail is completeness, not a row count: a row that looks like
  // data and did not parse means the format moved.
  if (unread.length) {
    console.log(`ABORT: ${unread.length} data rows did not parse, e.g.\n  ${unread[0]}`);
    process.exitCode = 1; return;
  }
  if (rows.length < MIN_ROWS) {
    console.log(`ABORT: only ${rows.length} rows, expected at least ${MIN_ROWS}`);
    process.exitCode = 1; return;
  }
  if (regions < 20 || regions > 40) {
    console.log(`ABORT: ${regions} regions, expected Ohio's 28`);
    process.exitCode = 1; return;
  }
  const absurd = rows.filter((r) => r.wins + r.losses > MAX_GAMES);
  if (absurd.length) {
    console.log(`ABORT: ${absurd.length} rows with impossible records, e.g. ${JSON.stringify(absurd[0])}`);
    process.exitCode = 1; return;
  }

  const opponents = await sql<
    { teamId: number; name: string; shortName: string | null; slug: string }[]
  >`
    SELECT t.id::int AS "teamId", sc.name, sc.short_name AS "shortName", sc.slug::text
    FROM school sc
    JOIN team t ON t.school_id = sc.id
    JOIN sport sp ON sp.id = t.sport_id AND sp.slug = 'football'
    WHERE sc.state = 'OH'
      AND EXISTS (SELECT 1 FROM game_participant gp WHERE gp.team_id = t.id)`;

  const aliases = await sql<{ slug: string; alias: string }[]>`
    SELECT sc.slug::text, a.alias FROM school_alias a
    JOIN school sc ON sc.id = a.school_id WHERE sc.state = 'OH'`;
  const aliasOf = new Map<string, string[]>();
  for (const a of aliases) {
    if (!aliasOf.has(a.slug)) aliasOf.set(a.slug, []);
    aliasOf.get(a.slug)!.push(a.alias);
  }

  const entries: { teamId: number; wins: number; losses: number; ties: number }[] = [];
  const matched: string[] = [];
  const unresolved: string[] = [];
  for (const o of opponents) {
    const wanted = [o.name, o.shortName ?? "", ...(aliasOf.get(o.slug) ?? [])]
      .filter(Boolean)
      .map(norm);
    // The school name is the tail of "City School Name" in the report.
    // Exact first. "Anderson" also suffix-matches "David Anderson", and two
    // candidates would otherwise make a school we can name perfectly well
    // look ambiguous.
    const exact = rows.filter((r) => wanted.some((w) => w && norm(r.name) === w));
    const hits = exact.length === 1
      ? exact
      : rows.filter((r) => {
          const n = norm(r.name);
          return wanted.some((w) => w && (n === w || n.endsWith(` ${w}`)));
        });
    if (hits.length === 1) {
      entries.push({ teamId: o.teamId, wins: hits[0].wins, losses: hits[0].losses, ties: 0 });
      matched.push(`  ${o.name.padEnd(44)} ${hits[0].wins}-${hits[0].losses}  (${hits[0].city}/${hits[0].name}, id ${hits[0].ohsaaId})`);
    } else {
      // Never guessed. An alias in school_alias is how a human resolves it.
      unresolved.push(`  ${o.name.padEnd(44)} ${hits.length} candidates${hits.length ? ": " + hits.slice(0, 4).map((h) => h.name).join(" | ") : ""}`);
    }
  }

  console.log(`\nmatched ${entries.length} of ${opponents.length} Ohio opponents:`);
  matched.forEach((m) => console.log(m));
  if (unresolved.length) {
    console.log(`\nunresolved, add a school_alias for each:`);
    unresolved.forEach((u) => console.log(u));
  }

  if (dryRun) { console.log("\n--dry-run: nothing written"); return; }
  const written = await setOutOfStateRecords(
    season.id, entries, "OHSAA weekly Harbin computer ratings report",
    found.url, found.date
  );
  console.log(`\nwritten: ${written} (as of ${found.date})`);
}

await main();
await sql.end();
