import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

/**
 * postgres.js returns numeric/bigint as strings to avoid precision loss.
 * Every query in this package casts to int/float8 at the SQL boundary rather
 * than parsing in JS, so the row types are honest.
 */
declare global {
  // eslint-disable-next-line no-var
  var __kyboxscoreSql: Sql | undefined;
}

function create(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    max: Number(process.env.PGPOOL_MAX ?? 10),
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {},
  });
}

function instance(): Sql {
  // Reused across dev HMR reloads so we do not leak pools.
  if (!globalThis.__kyboxscoreSql) globalThis.__kyboxscoreSql = create();
  return globalThis.__kyboxscoreSql;
}

/**
 * Lazy on purpose. `next build` imports every page module to collect route
 * data, so connecting at module scope would make a database a build-time
 * dependency. The pool is opened on first query instead.
 */
export const sql: Sql = new Proxy(function () {} as unknown as Sql, {
  apply(_target, _thisArg, args: unknown[]) {
    return (instance() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_target, prop: string | symbol) {
    const value = (instance() as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(instance()) : value;
  },
  has(_target, prop: string | symbol) {
    return prop in (instance() as unknown as object);
  },
}) as Sql;
