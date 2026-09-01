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

/**
 * How many recent runs keep their per-game arithmetic.
 *
 * Enough that a coach querying this week's rating can still be shown the
 * numbers, without carrying every hour of the season forever.
 */
const KEEP_INPUTS_FOR_RUNS = 6;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const sportSlug = arg("sport");
  const through = arg("through");

  // No --sport means every sport with a season open, which is what an hourly
  // job wants: one entry point that stays correct as sports are added.
  const seasons = await sql<{ id: number; name: string; urlYear: number }[]>`
    SELECT ss.id::int, sp.name, ss.url_year::int AS "urlYear"
    FROM sport_season ss
    JOIN sport sp ON sp.id = ss.sport_id
    WHERE ss.is_current
      AND sp.rpi_profile <> 'none'
      ${sportSlug ? sql`AND sp.slug = ${sportSlug}` : sql``}
    ORDER BY sp.display_order`;

  if (seasons.length === 0) {
    console.error(
      sportSlug
        ? `no current season for "${sportSlug}"`
        : "no sport has a season open"
    );
    process.exit(1);
  }

  for (const season of seasons) {
    const summary = await runRpi(season.id, { throughDate: through });
    if (summary.officialRunId === null) {
      console.log(`${season.name} ${season.urlYear}: no completed games yet, skipped`);
      continue;
    }
    console.log(
      `${season.name} ${season.urlYear}: ${summary.teams} teams, ` +
        `${summary.published} published, ${summary.suppressed} suppressed, ` +
        `through ${summary.throughDate}`
    );
    console.log(
      `  official run ${summary.officialRunId}, shadow run ${summary.shadowRunId}`
    );
  }

  // Hourly runs accumulate. rpi_result is small and worth keeping for every
  // run - that is the audit trail - but rpi_input is thousands of rows per run
  // and is only needed while a run is current enough to be questioned. The
  // schema anticipates exactly this with rpi_run.inputs_retained.
  const pruned = await sql<{ id: number }[]>`
    WITH ranked AS (
      SELECT id, row_number() OVER (
               PARTITION BY sport_season_id, variant ORDER BY id DESC
             ) AS rn
      FROM rpi_run
      WHERE inputs_retained
    )
    SELECT id::int FROM ranked WHERE rn > ${KEEP_INPUTS_FOR_RUNS}`;

  if (pruned.length > 0) {
    const ids = pruned.map((r) => r.id);
    await sql`DELETE FROM rpi_input WHERE rpi_run_id = ANY(${ids}::bigint[])`;
    await sql`UPDATE rpi_run SET inputs_retained = false WHERE id = ANY(${ids}::bigint[])`;
    console.log(`  pruned per-game inputs from ${ids.length} older run(s)`);
  }

  await sql.end();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await sql.end().catch(() => {});
  process.exit(1);
});
