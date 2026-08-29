import postgres from "postgres";

/**
 * postgres.js returns numeric/bigint as strings to avoid precision loss.
 * Every query in this package casts to int/float8 at the SQL boundary rather
 * than parsing in JS, so row types are honest.
 */
declare global {
  // eslint-disable-next-line no-var
  var __kyboxscoreSql: ReturnType<typeof postgres> | undefined;
}

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    max: Number(process.env.PGPOOL_MAX ?? 10),
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {},
  });
}

// Reuse across dev HMR reloads so we do not leak pools.
export const sql = globalThis.__kyboxscoreSql ?? create();
if (process.env.NODE_ENV !== "production") globalThis.__kyboxscoreSql = sql;
