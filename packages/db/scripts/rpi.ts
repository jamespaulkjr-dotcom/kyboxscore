/**
 * Recomputes RPI for a sport and stores both variants.
 *
 *   npm run rpi -- --sport football
 *   npm run rpi -- --sport football --through 2026-10-15
 *
 * The brief calls for hourly recalculation; this is the command a scheduler
 * would run. Each invocation writes a new rpi_run rather than updating one, so
 * a past ranking stays reproducible after the constants change.
 */
import { runRpi, sql } from "../src/index.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const sportSlug = arg("sport");
  const through = arg("through");

  if (!sportSlug) {
    console.error("usage: rpi.ts --sport <slug> [--through YYYY-MM-DD]");
    process.exit(2);
  }

  const seasons = await sql<{ id: number; name: string; urlYear: number }[]>`
    SELECT ss.id::int, sp.name, ss.url_year::int AS "urlYear"
    FROM sport_season ss
    JOIN sport sp ON sp.id = ss.sport_id
    WHERE sp.slug = ${sportSlug} AND ss.is_current`;

  if (seasons.length === 0) {
    console.error(`no current season for "${sportSlug}"`);
    process.exit(1);
  }

  for (const season of seasons) {
    const summary = await runRpi(season.id, { throughDate: through });
    console.log(
      `${season.name} ${season.urlYear}: ${summary.teams} teams, ` +
        `${summary.published} published, ${summary.suppressed} suppressed, ` +
        `through ${summary.throughDate}`
    );
    console.log(
      `  official run ${summary.officialRunId}, shadow run ${summary.shadowRunId}`
    );
  }

  await sql.end();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await sql.end().catch(() => {});
  process.exit(1);
});
