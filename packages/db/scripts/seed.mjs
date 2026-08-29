#!/usr/bin/env node
/**
 * Seed runner.
 *
 * Reference data (sports, seasons, KHSAA alignment structure, stat
 * definitions) is structural and always applied - it makes no claim about any
 * particular school.
 *
 * Development fixtures are synthetic and are refused in production. They are
 * all attributed to the `dev-fixture` data source so they can be identified
 * and removed with a single delete.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const SEED_DIR = path.join(import.meta.dirname, "..", "seed");
const isProd = process.env.NODE_ENV === "production";
const withFixtures = process.argv.includes("--fixtures") || !isProd;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, onnotice: () => {} });

  const files = (await readdir(SEED_DIR)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const isFixture = file.includes("fixture");
    if (isFixture && !withFixtures) {
      console.log(`  skipping ${file} (production)`);
      continue;
    }
    if (isFixture && isProd) {
      console.error(
        `Refusing to load ${file}: fixtures are synthetic and must never ` +
          `reach production. Remove --fixtures or unset NODE_ENV=production.`
      );
      process.exit(1);
    }
    process.stdout.write(`  seeding ${file} ... `);
    const body = await readFile(path.join(SEED_DIR, file), "utf8");
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
      });
      console.log("ok");
    } catch (err) {
      console.log("FAILED");
      console.error(`\n${file}: ${err.message}`);
      process.exit(1);
    }
  }

  const [{ count: sports }] = await sql`SELECT count(*)::int FROM sport`;
  const [{ count: defs }] = await sql`SELECT count(*)::int FROM stat_definition`;
  const [{ count: aligns }] = await sql`SELECT count(*)::int FROM alignment`;
  const [{ count: schools }] = await sql`SELECT count(*)::int FROM school`;
  const [{ count: games }] = await sql`SELECT count(*)::int FROM game`;
  console.log(
    `\n  ${sports} sports · ${defs} stat definitions · ${aligns} alignments · ` +
      `${schools} schools · ${games} games`
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
