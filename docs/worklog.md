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
