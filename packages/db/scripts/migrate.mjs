#!/usr/bin/env node
/**
 * Migration runner. Plain JavaScript on purpose: this runs inside the
 * production container via `docker compose exec -T web node ...`, and should
 * not depend on a TypeScript loader being present.
 *
 * Each migration runs in its own transaction and is recorded in
 * schema_migrations. Files are applied in filename order and never re-applied.
 */
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import postgres from "postgres";

const MIGRATIONS_DIR = path.join(import.meta.dirname, "..", "migrations");

const reset = process.argv.includes("--reset");

function connectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  return url;
}

async function main() {
  const sql = postgres(connectionString(), { max: 1, onnotice: () => {} });

  if (reset) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "Refusing to --reset with NODE_ENV=production. This drops every table."
      );
      process.exit(1);
    }
    console.log("! dropping and recreating schema public");
    await sql.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  }

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     text        PRIMARY KEY,
      checksum    text        NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    );
  `);

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = new Map(
    (await sql`SELECT version, checksum FROM schema_migrations`).map((r) => [
      r.version,
      r.checksum,
    ])
  );

  let ran = 0;
  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const body = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    const checksum = createHash("sha256").update(body).digest("hex");

    if (applied.has(version)) {
      if (applied.get(version) !== checksum) {
        console.error(
          `\n${file} has changed since it was applied.\n` +
            `Migrations are immutable once shipped - add a new one instead.`
        );
        process.exit(1);
      }
      continue;
    }

    process.stdout.write(`  applying ${file} ... `);
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`INSERT INTO schema_migrations (version, checksum)
                 VALUES (${version}, ${checksum})`;
      });
      console.log("ok");
      ran++;
    } catch (err) {
      console.log("FAILED");
      console.error(`\n${file}: ${err.message}`);
      process.exit(1);
    }
  }

  console.log(
    ran === 0
      ? `up to date (${files.length} migration${files.length === 1 ? "" : "s"})`
      : `applied ${ran} migration${ran === 1 ? "" : "s"}`
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
