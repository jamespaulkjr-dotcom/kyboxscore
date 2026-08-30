# Worklog

Append-only. Newest last. One entry per work session or meaningful chunk.

`docs/STATUS.md` says what is true **now**. This file says **how we got here** —
the decisions, the dead ends, and what was in flight when a session ended. If a
session is lost, read STATUS.md first, then the last entry here.

Entry format:

```
## YYYY-MM-DD — short title
**Did:** what actually changed
**Why:** the reasoning, especially for anything non-obvious
**Learned:** surprises, dead ends, things that cost time
**Next:** what the next session should pick up
```

---

## 2026-08-29 — Bootstrap
**Did:** Next.js app, Postgres schema (`0001_init`), Docker + Caddy on a
DigitalOcean droplet, GitHub Actions → GHCR pipeline, brand assets and palette,
MaxPreps `.txt` parser written against a real Hudl/GameChanger export, RPI
engine with official and shadow formulas.
**Why:** Schedules and scores draw traffic, statistics are the moat. The
importer is the adoption path, so the parser came early.
**Learned:** The database password lands in `DATABASE_URL` unencoded, so `/`
and `+` break it — regenerate URL-safe. The image must build without a database
reachable, since `next build` imports every route module.
**Next:** Get the deploy pipeline actually deploying.

## 2026-08-30 — Deploy pipeline fixed
**Did:** Diagnosed a deploy job that had failed every run since setup. Cause:
the `DEPLOY_KEY` repo secret was never created — a save was interrupted. Added
it, confirmed green, then stripped the CI diagnostics and bumped all actions off
the deprecated Node 20 runtime. Hand-deployed once mid-debug to un-stale the
site. Rotated `AUTH_SECRET` (it had been pasted into a chat transcript). Wrote
STATUS.md and this file.
**Why:** Builds were green the whole time and only the SSH step failed, so every
push produced a good image that never shipped and the live site silently drifted
behind `main`.
**Learned:** An early theory blamed a stale `DEPLOY_HOST` IP and cost real time;
the workflow's own secret probe is what settled it. Actions job logs need repo
admin to download, but **annotations are readable unauthenticated** — that is
the way to diagnose CI from a box with no GitHub token. There is no `gh` CLI or
token on the droplet, so the only way to trigger a run from here is a push.
**Next:** Auth (coaches and admins only, no public signup), then the import UI.

## 2026-08-30 — Auth
**Did:** Migration `0003_auth_sessions` (password columns on `app_user`,
`user_session`, `login_attempt`), shared password module in
`packages/db/src/password.ts`, auth queries, `/login` with a Server Action,
`/coach` dashboard, a Sign in link in the header, and
`npm run db:create-user` for provisioning. Nine unit tests.
**Why:** `app_user`, `user_team_grant`, `import_batch` and `import_row` were
already in `0001_init` — the data model anticipated all of this. Only
credentials and sessions were missing, so auth was a much smaller job than it
looked. The importer needs to know who uploaded and which team they coach, so
auth had to land first.
**Learned:** Chose scrypt from `node:crypto` over bcrypt/argon2 — both are
native builds and a native build in a multi-stage Docker image is a recurring
source of broken deploys. Chose opaque server-side sessions over JWTs because a
coach who leaves a school must lose access immediately, which is worth a query
per guarded request. The header's Sign in link is deliberately stateless:
reading the session there would opt every public page into dynamic rendering
and cost the edge cache on the scoreboard. `promisify(scrypt)` drops the
options argument in its type signature, which is where N/r/p live — hand-wrap
it instead.
**Next:** The importer: upload → parse → preview → resolve unmatched names →
commit. Also needs an admin UI for `user_team_grant`, since nothing writes to
it yet. Still waiting on the confirmed KHSAA sport list before widening beyond
football and basketball.

## 2026-08-30 — Importer, first vertical slice
**Did:** `/coach/import` (team → game → upload), `/coach/import/[id]` (preview,
per-row resolution, commit). `packages/parsers/src/matching.ts` with 9 tests,
`packages/db/src/import.ts` for the pipeline queries, and a transactional
commit into `stat_line` / `stat_value`. Activated baseball and seeded a
provisional baseball season.
**Why:** The brief calls the importer the adoption path — "if coaches will not
use them nothing else matters" — so this came before widening sports or
dressing up the front page.
**Learned:** **The MaxPreps .txt has no player names.** First line is a vendor
game UUID, second is the header, and every row is keyed by jersey number only.
That makes matching jersey-against-roster rather than fuzzy name matching, and
it fails in exactly two interesting ways: a jersey nobody wears, and a jersey
two players share. Both go to a human; neither is ever guessed. The
`player_name_alias` and fuzzy-match machinery in the schema is for the CSV
season-totals path, which does carry names. Also: postgres.js bulk insert is
`sql(rows, ...columns)`, not an array of `sql` fragments — the fragment form
type-errors in a way that does not explain itself.
**Next:** Nothing writes `user_team_grant`, so the importer cannot actually be
exercised by a coach yet — an admin UI for that is the immediate blocker.
After that, refreshing `player_season_stat` on commit so imported numbers reach
team and leaderboard pages. Still waiting on the KHSAA sport list.

## 2026-08-30 — Docker build break, and why local build missed it
**Did:** Added `@kyboxscore/parsers` to `apps/web` dependencies and taught the
Dockerfile's deps stage to copy **every** workspace manifest, not just the two
that happened to be imported.
**Why:** The importer made `apps/web` import `@kyboxscore/parsers` for the
first time. The deps stage only copied `apps/web` and `packages/db`
manifests, so `npm ci` never created the `@kyboxscore/parsers` symlink and
`next build` failed on an unresolved import.
**Learned:** `npm run build` locally is **not** a check that the image builds.
The local `node_modules` already has every workspace symlinked, so it hides
exactly this class of failure. The CI `check` job passes too, because it also
runs against a full install. Only the Docker build catches it. When a new
cross-package import is added, verify with
`docker build -f docker/Dockerfile .` before pushing. Copying all four
manifests unconditionally means the next new import does not repeat this.
**Next:** unchanged — admin UI for `user_team_grant`.

## 2026-08-30 — Admin grant UI
**Did:** `/admin/users` (search accounts) and `/admin/users/[id]` (grant and
revoke team access, with who granted it and when). `packages/db/src/admin.ts`
for the queries, `requireAdmin` in the web auth lib, and an Administration link
on the coach dashboard for admins only.
**Why:** `user_team_grant` gates every statistic that enters the system, and
nothing wrote to it, so the importer could not be exercised by anyone.
**Learned:** A coach who guesses `/admin/users` gets a 404, not a 403 — there
is no reason to confirm the page exists. Grantable teams show a "no current
season" note rather than being filtered out, because a missing team looks like
a bug while an annotated one explains itself. Applied the Docker lesson from
earlier today: ran a real `docker build` before pushing rather than trusting
`npm run build`.
**Next:** Production has no schools, teams or rosters, and seed fixtures are
refused in production by design — so there is still nothing to grant or import
into. Staff data entry for schools/teams/seasons/rosters is the last blocker on
a real end-to-end import. After that, refresh `player_season_stat` on commit.

## 2026-08-30 — All KHSAA sports, and 291 schools
**Did:** Migration `0004_sport_categories` (a `sport_category` enum, nullable
scoring columns, `rpi_profile = 'none'`), all 20 KHSAA sports seeded with their
grouping, 291 member schools in `006_schools.sql`, and a `/sports` index linked
from the header.
**Why:** The site showed two sports and read as a stub. Sports are now modelled
honestly: only team sports have a scoring unit, periods and an RPI, so
`scoring_unit`/`period_noun`/`regulation_periods` became nullable rather than
being filled with a plausible lie for bass fishing. Two CHECK constraints keep
that consistent.
**Learned:** **`docker compose -f compose.dev.yml up` recreated the PRODUCTION
database container.** Compose takes its project name from the directory, and
both `/home/deploy/code/kyboxscore` and `/home/deploy/kyboxscore` are
"kyboxscore", so the `db` service collided. It detached the live `pgdata`
volume and published 5432 to 0.0.0.0 with the password "localdev". No data was
lost - the volume was detached, not deleted - and it was restored in about 90
seconds with `docker compose up -d db` from the production directory. Fixed
properly by pinning `name: kyboxscore-dev` and binding the dev port to
loopback. Also: a page with no route params is prerendered at build time, which
fails when the image builds without a database - `/sports` needed
`force-dynamic` like every other data-backed page.
**Open questions raised with the user:** football was absent from their sport
list (kept, since the brief makes it phase one), and "Competitive" is seeded as
"Competitive Cheer" pending confirmation. Field hockey and lacrosse period
structure is provisional. School `time_zone` defaults to Eastern, which is
wrong for western Kentucky.
**Next:** teams, seasons and rosters - a school is not a team, and 17 of 20
sports have no season dates.

## 2026-08-30 — Search index was never refreshed in production
**Did:** Moved `REFRESH MATERIALIZED VIEW search_document` out of the dev
fixture seed and into the end of `seed.mjs`, so every environment gets it.
**Why:** `search_document` is a materialized view over school, player and
coach. It does not update itself. The only refresh lived in
`005_dev_fixture_boxscores.sql`, which production **refuses** by design — so
production search had never seen a seeded row. Caught by searching the live
site for "Caverna" right after seeding 291 schools and getting "Nothing
matched".
**Learned:** Two read models in this schema do not maintain themselves and are
easy to forget, because the write side looks correct while the read side stays
empty: `search_document` (now handled) and `player_season_stat` /
`team_season_stat` (still not refreshed after an import commit). Verifying a
deploy by checking the page a user would actually look at catches this class of
bug; checking that the write succeeded does not.
**Next:** teams, seasons and rosters; then rollup refresh on import commit.
