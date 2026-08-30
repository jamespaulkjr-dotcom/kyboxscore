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
- **Sports** — all 20 KHSAA sports and sport activities, grouped as KHSAA
  groups them (`sport.category`: team / individual / activity). Only team
  sports carry a scoring unit, periods and an RPI; the rest are NULL rather
  than filled with a plausible lie. `/sports` lists everything; the header
  links to it. Only football, basketball and baseball have a season open.
- **Schools** — 291 KHSAA member schools, slug and name only, attributed to
  the `staff-entry` data source.
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
- **Schedule import** — `/admin/schedule`: paste a block of games (comma, tab
  or pipe separated; ISO or US dates; optional scores) and it becomes real
  fixtures. Schools are matched by name — exact, then substring, then trigram
  similarity against both the full and the suffix-stripped name. An ambiguous
  name like "Trinity" is **never guessed**: the row is skipped and both
  candidates are shown. Teams are created on demand for schools that lack one.
  Re-pasting is safe; the schema's natural key recognises an existing game.
- **Alignments** — a team's district is set on its team page, from the
  districts that exist for its sport and gender. Drives district records and
  the RPI class factor. Left unassigned rather than guessed.
- **Schedules** — games are created on the team page: opponent, date,
  home/away, status, scores. Duplicate games are refused by the schema's
  natural key (same two teams, same date). A game with a box score cannot be
  deleted.
- **Change password** — `/account/password`. Changing a password ends every
  other session and reissues the current one.
- **Staff data entry** — `/admin/teams` creates teams (school + sport +
  gender + level, attached to the current season automatically) and
  `/admin/teams/[id]` manages the roster: add players, correct jersey and
  grade in place, remove. Name and jersey only — the schema has nowhere to put
  anything else about a minor. A player with statistics cannot be removed, only
  corrected. Duplicate name + jersey on one roster is refused as a
  double-submit; the same name on a different number is allowed.
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
- **Season dates for 17 of 20 sports.** Only football, basketball and baseball
  have a `sport_season`, so only those can hold teams. Needs the KHSAA
  calendar.
- **Which school is in which district.** The structure exists and the
  assignment UI exists, but no team is placed yet — that is a factual claim
  that has to come from a permitted source. Until then `district_wins` and
  `district_losses` stay 0 and RPI has no class factor.
- **School detail.** Only slug and name are populated. Mascot, city, county,
  colors, venue and KHSAA id are all NULL.
- **CSV and Excel parsers.** Only the MaxPreps `.txt` is handled. CSV with
  interactive column mapping is next; `import_column_mapping` is already in
  the schema for it. PDF stays deferred (confirmed 2026-08-30).
- **Column maps beyond baseball.** `mapping.ts` has `BASEBALL_COLUMN_MAP`
  only. The upload page refuses other sports rather than importing garbage.
- **Coach data entry.** Nothing.

## Gotchas learned the hard way

- **The database password must be URL-safe.** It goes into `DATABASE_URL`
  unencoded, so `/` and `+` break it. Generate with a URL-safe alphabet.
- **`docker compose exec db psql` is blocked** by the Claude Code permission
  classifier, so schema questions cannot be answered by querying prod.
- A hand-deploy restarts the container but does **not** migrate. If the
  schema and the image disagree, that is why.
- **`docker compose -f compose.dev.yml` used to recreate the PRODUCTION db.**
  Compose derives its project name from the directory, and both
  `/home/deploy/code/kyboxscore` and `/home/deploy/kyboxscore` resolve to
  `kyboxscore`. It detached the live data volume and published 5432 with a dev
  password. Fixed by pinning `name: kyboxscore-dev` in `compose.dev.yml` and
  binding its port to loopback. **Check the project name before running any
  compose command on this box.**
- **An end-to-end test now guards the import chain**
  (`packages/db/test/import-pipeline.test.ts`). It skips without
  `DATABASE_URL` and runs in CI, asserting every batting line against the PDF
  box score of the same game. 49 tests total.
- **`\s` does not survive into a Postgres regex** the way you expect from a
  JS template literal — a `regexp_replace` using it silently matched nothing
  and the similarity search quietly under-performed. Use POSIX classes
  (`[[:space:]]`) in SQL.
- **A DB test that only passes on a pristine database is a weak test.** The
  import test clears its own roster and prior game first, and deletion order
  matters: `game` cascades to `stat_line`, but `import_batch` references
  `game` and `stat_line` references `import_batch`.
- **Typecheck and build do not execute SQL.** A `GROUP BY` bug in
  `listTeamsAdmin` passed both and would have been a 500 on the page. Run new
  queries against the dev database before pushing.
- **A page with no route params gets prerendered at build time**, and the image
  builds without a database. Any data-backed page needs
  `export const dynamic = "force-dynamic"` or the Docker build fails at export.
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

1. Season dates per sport, so the other 17 sports can open.
2. District assignments, once the alignment data is to hand.
3. Wire the RPI engine to real data — it is unit tested but never run against
   the database.
4. CSV parser with interactive column mapping, then Excel.
5. Column maps for basketball and football.
6. Front page is bare — reads as a stub rather than a product.
7. Password change UI (only the CLI can reset a password today).
8. Confirm the provisional baseball season dates in `seed/001_reference.sql`
   against the published KHSAA calendar.
