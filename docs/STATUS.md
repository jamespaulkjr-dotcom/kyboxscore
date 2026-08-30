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
  real export in `docs/reference/`.
- **RPI** — `packages/rpi`, official and shadow formulas, unit tested.

## What is NOT built yet

- **Sports.** Six are defined in `seed/001_reference.sql` (football,
  basketball, baseball, softball, soccer, volleyball) but
  `UPDATE sport SET is_active = slug IN ('football','basketball')` means only
  two are live. The rest of the KHSAA sports are not in the schema at all.
- **Auth.** No login, no accounts, no coach roles, no sessions. `AUTH_SECRET`
  exists in `.env` but nothing consumes it.
- **Import UI.** The MaxPreps parser exists as a library with no route, no
  upload form, no preview-before-commit, no name resolution. CSV and Excel
  parsers are not written. PDF is explicitly out of scope for phase one.
- **Coach data entry.** Nothing.

## Gotchas learned the hard way

- **The database password must be URL-safe.** It goes into `DATABASE_URL`
  unencoded, so `/` and `+` break it. Generate with a URL-safe alphabet.
- **`docker compose exec db psql` is blocked** by the Claude Code permission
  classifier, so schema questions cannot be answered by querying prod.
- A hand-deploy restarts the container but does **not** migrate. If the
  schema and the image disagree, that is why.
- Actions job logs need repo admin to download, but **annotations are readable
  unauthenticated** — useful for diagnosing CI without a token.
- There is no `gh` CLI and no GitHub token on the droplet. The only way to
  trigger a run from here is pushing a commit.

## Open items

1. Activate the full set of KHSAA sports (needs the sanctioned list confirmed).
2. Auth and coach accounts.
3. Import UI: upload → preview → resolve names → commit.
4. CSV parser with interactive column mapping, then Excel.
5. Rotate `AUTH_SECRET` (it was exposed in a chat transcript 2026-08-30).
6. Front page is bare — reads as a stub rather than a product.
