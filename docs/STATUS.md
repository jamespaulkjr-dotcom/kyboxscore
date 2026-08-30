# Project status

Living record of where kyboxscore actually is, so a new session (or a new
person) can pick up without reconstructing it from shell history.

`CLAUDE.md` is the brief: what we are building and the rules. **This file is
the state: what is true right now.** Update it whenever infrastructure changes
or a phase completes.

Last updated: 2026-08-30

## Infrastructure

| Thing | Value |
|---|---|
| Production host | DigitalOcean droplet `kyboxscore-prod`, `68.183.98.229` |
| Live site | https://kyboxscore.com (Cloudflare → Caddy → Next.js) |
| Repo | `github.com/jamespaulkjr-dotcom/kyboxscore` |
| Registry | `ghcr.io/jamespaulkjr-dotcom/kyboxscore:latest` |
| Prod compose + env | `/home/deploy/kyboxscore/` on the droplet |
| Source checkout | `/home/deploy/code/kyboxscore/` on the droplet |

**The source checkout is on the production box.** A Claude Code session opened
in `/home/deploy/code/kyboxscore` is not sandboxed from production: `docker
compose` commands, port binds, and anything touching
`/home/deploy/kyboxscore/` affect the live site immediately. Never run `docker
volume prune` or add `--volumes` to a prune here; the `pgdata` volume is the
live database.

## Deploying

**Pushing to `main` is a production deploy.** GitHub Actions runs
`check` → `build` → `deploy`: typecheck and tests against a throwaway
Postgres, build and push the image to GHCR, then SSH to the droplet, pull,
restart `web`, and run `migrate.mjs` and `seed.mjs`.

Required repo secrets (Settings → Secrets and variables → Actions):

- `DEPLOY_HOST` — the droplet IP
- `DEPLOY_KEY` — the **private** half of `/home/deploy/.ssh/gha_deploy`;
  the public half is already in the droplet's `authorized_keys`

Manual deploy, only if Actions is down:

```
cd /home/deploy/kyboxscore && docker compose pull web && docker compose up -d web
```

That skips migrations, which the pipeline runs and this command does not.

## What is actually built

- **Web** — Next.js App Router. Routes: `/[sport]/scores`,
  `/[sport]/scores/[date]`, `/[sport]/teams`, `/[sport]/stats`,
  `/[sport]/[year]/teams/[school]`, `/[sport]/[year]/games/[code]`, `/search`.
  Bottom nav, site header/footer, brand assets in `docs/assets/`.
- **Database** — `packages/db`, migrations `0001_init` and
  `0002_stat_consistency`, seeded reference data and dev fixtures.
- **Parsers** — `packages/parsers`, MaxPreps `.txt` only, written against a
  real export in `docs/reference/`. Also `matching.ts`: jersey → roster
  matching, because **the MaxPreps .txt carries no player names, only jersey
  numbers**. Names/aliases in the schema are for the CSV path.
- **RPI** — `packages/rpi`, official and shadow formulas, unit tested.
- **Importer** — `/coach/import`: choose team → choose game → upload the
  MaxPreps `.txt` → preview every row → resolve unmatched jerseys → commit.
  Nothing reaches `stat_line` until commit. Idempotent on file sha256 per
  team; re-committing overwrites rather than duplicating, because `stat_line`
  is unique on `(game_id, player_id)`. Corrections are remembered in
  `player_name_alias` so the next upload matches automatically. Baseball only.
- **Admin** — `/admin/users` and `/admin/users/[id]`: search accounts, grant
  and revoke team access, see who issued each grant and when. Restricted to
  `admin` and `staff`; a signed-in coach who guesses the URL gets a 404 rather
  than a 403, so the page's existence is not confirmed. Revoking stops future
  entry and leaves committed statistics in place.
- **Auth** — email + password for coaches and administrators. scrypt from
  `node:crypto` (no native build), opaque server-side sessions in
  `user_session` so revocation is immediate, rate limiting per email and per
  IP, and timing-equalized failures so accounts cannot be enumerated. Routes:
  `/login`, `/coach`. Migration `0003_auth_sessions`.

  **There is no signup.** Accounts are provisioned from the CLI:

  ```
  npm run db:create-user -- --email a@b.org --name "Jane Doe" --role admin
  ```

  Re-running for an existing email resets the password and revokes that
  user's live sessions, which is the locked-out path. Roles: `admin`,
  `staff`, `athletic_director`, `coach`.

## What is NOT built yet

- **Sports.** Six are defined in `seed/001_reference.sql` (football,
  basketball, baseball, softball, soccer, volleyball) but
  `UPDATE sport SET is_active = slug IN ('football','basketball')` means only
  two are live. The rest of the KHSAA sports are not in the schema at all.
- **Schools, teams and rosters.** Production has none. Seed fixtures are
  dev-only by design ("fixtures are refused in production"), so there is
  nothing to grant, schedule, or import into yet. **This is now the single
  blocker on exercising the importer end to end.** How this data arrives is a
  provenance decision, not just a UI one — see the hard rules in CLAUDE.md.
- **CSV and Excel parsers.** Only the MaxPreps `.txt` is handled. CSV with
  interactive column mapping is next; `import_column_mapping` is already in
  the schema for it. PDF stays deferred (confirmed 2026-08-30).
- **Column maps beyond baseball.** `mapping.ts` has `BASEBALL_COLUMN_MAP`
  only. The upload page refuses other sports rather than importing garbage.
- **Rollups.** `player_season_stat` / `team_season_stat` are not refreshed
  after a commit, so imported stats do not yet appear on team or leaderboard
  pages. `stat_line` / `stat_value` are correct; the read model is stale.
- **Coach data entry.** Nothing.

## Gotchas learned the hard way

- **The database password must be URL-safe.** It goes into `DATABASE_URL`
  unencoded, so `/` and `+` break it. Generate with a URL-safe alphabet.
- **`docker compose exec db psql` is blocked** by the Claude Code permission
  classifier, so schema questions cannot be answered by querying prod.
- A hand-deploy restarts the container but does **not** migrate. If the
  schema and the image disagree, that is why.
- **`npm run build` passing locally does not mean the image builds.** The local
  `node_modules` has every workspace symlinked, so a missing workspace manifest
  in the Dockerfile's deps stage only shows up in CI. After adding a new
  cross-package import, run `docker build -f docker/Dockerfile .` before
  pushing.
- Actions job logs need repo admin to download, but **annotations are readable
  unauthenticated** — useful for diagnosing CI without a token.
- There is no `gh` CLI and no GitHub token on the droplet. The only way to
  trigger a run from here is pushing a commit.
- `AUTH_SECRET` is the pepper for session token hashes. **Changing it logs
  everyone out**, because every stored `token_hash` becomes unmatchable. That
  is acceptable now and will not be once coaches depend on it.

## Open items

1. **Staff data entry for schools, teams, seasons and rosters** — the last
   thing between here and a real import.
2. **Refresh rollups after a commit** — imported stats do not reach team or
   leaderboard pages yet.
3. Activate the full set of KHSAA sports (needs the sanctioned list confirmed).
4. CSV parser with interactive column mapping, then Excel.
5. Column maps for basketball and football.
6. Front page is bare — reads as a stub rather than a product.
7. Password change UI (only the CLI can reset a password today).
8. Confirm the provisional baseball season dates in `seed/001_reference.sql`
   against the published KHSAA calendar.
