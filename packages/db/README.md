# @kyboxscore/db

Schema, migrations and query layer.

## Raw SQL migrations, not a generated schema

The build prompt suggests Drizzle or Prisma. This package deviates, deliberately.

The schema leans on Postgres features that no ORM schema definition round-trips
faithfully: partial unique indexes, a deferred constraint trigger enforcing
"exactly two participants per game", generated columns, a trigger-maintained
denormalized natural key, and a data-driven stat model where adding a sport is
`INSERT`s rather than a migration. Expressing those through an ORM means either
losing them or maintaining a parallel 35-table definition by hand, which drifts.

So: **`migrations/*.sql` is the single source of truth for the schema.** Reads go
through `postgres.js` with hand-written SQL in `src/queries/`, typed at the
boundary. If the query layer outgrows that, adding Drizzle on top is still open —
it would just describe a schema it does not own.

## Commands

```bash
npm run db:migrate        # apply pending migrations
npm run db:seed           # reference data + development fixtures
npm run db:reset          # drop, migrate, seed (refuses when NODE_ENV=production)
```
