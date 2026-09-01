# Project status

Living record of where kyboxscore actually is, so a new session (or a new
person) can pick up without reconstructing it from shell history.

`CLAUDE.md` is the brief: what we are building and the rules. **This file is
the state: what is true right now.** Update it whenever infrastructure changes
or a phase completes.

Last updated: 2026-09-01

## Resume here

Read this section first, then `## Gotchas learned the hard way`. Between them
they are the whole handover; nothing needed to continue lives only in a chat
transcript.

**Where the work stands.** Football is the live sport: 291 schools, the KHSAA
alignment, the full season schedule, 10,743 players with height and weight,
records split district/season/preseason, RPI and Shadow RPI recomputed hourly,
a front page, an admin area, and following a team. That is phase one working
end to end for one sport.

**What was in flight at the last compaction** (commit `736500a`, both parts
finished, both on main):

1. ALL-CAPS roster names — `normalizePersonName` in
   `packages/parsers/src/person-name.ts`, wired into `roster-sheet.ts` so new
   imports arrive clean, and applied to the 22 existing rows that were
   genuinely shouting (18 rows; the other 69 candidates were initials like AJ
   and D.K, which must not become "Aj"). `search_document` was refreshed after,
   because player names live in it.
2. Following a team — `apps/web/lib/favorites.ts` (localStorage),
   `follow-button.tsx` on the team page, `following.tsx` on the front page,
   `/api/following` for the live next/last game.

**The obvious next things**, in the order they are probably worth doing:

- Basketball. The schema is sport-agnostic and the RPI engine already runs per
  sport; what is missing is schedules and rosters, which means asking James for
  the files. Everything else should follow the football path.
- The stat importer end to end with a real Hudl `.txt` from a coach. The parser
  exists and is tested against fixtures; it has never been run on a file that
  arrived from an actual coach's export.
- Browser notifications for followed teams. Deliberately not started: it needs
  a service worker, a push subscription per device, VAPID keys and a sending
  job. Worth doing after following proves people want it. Push subscriptions
  are per-device, so this can still be built without accounts.

**How to talk to James about data.** He supplies files (Excel, mostly) by
uploading to `/home/deploy/kyboxscore/data-inbox/` over WinSCP. He has a friend
named Nathan backing the project who compiles roster data. Ask for a file
rather than reaching for a website: the hard rules in `CLAUDE.md` about
scraping KHSAA, ArbiterLive and Riherds are not negotiable, and that extends to
state associations for out-of-state records.

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
- **School aliases** — `school_alias` maps an alternate name to a school, and
  is checked **before every other matching rule** because a person decided it.
  Seeded with "The Academy @ Shawnee" → Shawnee: the 2026 schedule export uses
  the current official name while the alignment uses the short one, and the two
  strings share almost nothing.
- **Out-of-state opponents** — 51 schools created from the 2026 schedule so
  Kentucky records are not short. Their `state` is `'XX'`, deliberately not a
  guess: the column is never displayed and is used only as "Kentucky or not",
  which is all RPI needs. `is_khsaa_member` is false, so they are never ranked.
- **Schools** — 291 KHSAA member schools, attributed to `staff-entry`. Each
  carries the full legal name **and** a `short_name` scoreboard label
  ("John Hardin", not "John Hardin High School"). **Display reads
  `short_name`; import matching reads `name`** — a parent searches for the
  short form, an import file contains the long one. Parenthetical
  disambiguators survive into the short name, or "Trinity (Louisville)" and
  "Trinity (Whitesville)" would collapse into one.
- **Parsers** — `packages/parsers`, MaxPreps `.txt` only, written against a
  real export in `docs/reference/`. Also `matching.ts`: jersey → roster
  matching, because **the MaxPreps .txt carries no player names, only jersey
  numbers**. Names/aliases in the schema are for the CSV path.
- **RPI** — `packages/rpi` holds the pure engine; `packages/db/src/rpi-run.ts`
  is the seam to real data. `npm run rpi -- --sport football` loads every
  final regular-season game, computes official and shadow, and writes
  `rpi_run` / `rpi_result` / `rpi_input`. Each invocation writes a **new** run
  rather than updating one, so a past ranking stays reproducible after the
  constants change. `/[sport]/rpi` shows the table with the shadow rating and
  the delta beside it, linked from the stats page.

  Run it on the droplet with
  `docker compose exec -T web node --experimental-strip-types packages/db/scripts/rpi.ts --sport football`.
  The through-date clamps to today, so only games already played count.

  A third: **an out-of-state opponent with no `out_of_state_record` is left out
  of the computation entirely.** We only know its games against Kentucky, so
  computing a winning percentage from those invents a record — usually 0-1 —
  and Shadow RPI would then compare the official .500 assumption against a
  number we made up. Left out, it falls back to .500 under both formulas and
  the delta is honestly zero until a real record is entered.

  Two more rules encoded here: **out-of-state teams are computed but never ranked**
  (their record feeds everyone's OWP; ranking them in Kentucky standings would
  be a category error), and **the stored rating is derived from the stored
  components**, not from the engine's unrounded output — `class_factor` is
  `numeric(6,4)`, so a rating stored raw would miss reproduction by ~3e-5 and
  look like broken arithmetic on the page.
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
- **Alignment import** — `/admin/alignments`: paste the published KHSAA block
  (class headings, `District 1- School, School, ...` lines, cross-bracketing
  prose and withdrawal lists all mixed together) and it assigns a whole sport
  in one go. Verified against the real 2026 football document: **219 schools,
  219 matched, 0 unmatched**, and re-running changes nothing. KHSAA realigns
  every two years, so this is built to be re-run each cycle.
- **Alignments** — a team's district is set on its team page, from the
  districts that exist for its sport and gender. Drives district records and
  the RPI class factor. Left unassigned rather than guessed.
- **Rankings** — two of them, answering different questions.
  `/[sport]/rpi` is the statewide order by RPI. `/[sport]/standings` is
  district placement **by district record**, which is what decides the
  postseason — RPI and overall record are shown there but do not move a team
  up the table. Team pages carry both: "State #1 · 1st in 4A District 2".
  A team with no games ranks as neutral, not last, so 0-0 outranks 0-1.
  KHSAA's formal tie-breaks (head to head, common opponents) are **not**
  implemented; a real tie is displayed as a tie.
- **Preseason** — KHSAA counts nothing played before the season's first
  permissible date. Games before `sport_season.starts_on` are stage
  `preseason`: real, visible on a schedule, and counting toward **no** record,
  district standing or RPI. A separate preseason record is kept and shown,
  labelled as not counting. The rule is driven by `starts_on`, not a literal
  date, so it holds for every sport and every future season — **correct the
  season dates and the classification follows**. Football 2026 opens
  2026-08-19.
- **Signed-in header** — the header cannot read the session (that would make
  every public page dynamic and cost the scoreboard's edge cache), so it reads
  a **role-only** `kbs_who` hint cookie in the browser and swaps "Sign in" for
  "Admin" / "Your teams". The hint holds no token, no name and no id: it is
  JavaScript-readable by design, so it must be worthless if read, and every
  page behind it still checks the real session server-side.
- **Live scoring** — a coach or AD with a team grant can keep a score play by
  play (TD/PAT/2PT/FG/Safety, per quarter, with undo) or just post a final.
  They can also mint a **per-game keeper link** for whoever is in the press box:
  one game, expires that night, revocable, cannot delegate further, can only
  move a score. Exchanged for an httpOnly cookie so the token leaves the URL.
  Public pages show a red LIVE pill and poll `/api/live` every 30s.
  **LIVE is a human claim, never inferred from the clock**, and it expires
  after five hours of no change so nothing blinks overnight.
  The score can also just be **typed in** at any point — "Type the score
  instead" sits with the score, not at the end. What is typed is kept as
  `game_participant.score_adjustment`, and the published score is
  `sum(plays) + adjustment`, so somebody who picks a game up at half time and
  types 14-7 does not lose it the moment they tap the next touchdown.
  Each play can then be given **detail**: who scored, how (rush, pass, kickoff
  return…), who threw it, and the clock. Detail is always a second step and
  never a condition of scoring — the tap has to land while the crowd is still
  reacting. The description a reader sees is composed on the server from those
  parts and regenerated on every edit, which is why `play_key` and `method` are
  stored separately from the prose.
  The public game page shows a **Scoring** summary above the box scores, with
  the running score after each play.
  An **admin** sees a "Reset this game" control at the bottom of the console:
  it clears every play, quarter score and score, puts the game back to
  scheduled, revokes any keeper links and rebuilds both teams' records. It
  refuses a game that already has an imported box score, and asks you to type
  the game's short code, because it is the only control there that destroys
  something.
- **Front page** — a plain statement of what the site is, followed teams, the
  most recent slate, top 5 RPI, an "Every sport" section that lists sports with
  nothing in them rather than hiding them, and links onward. The sport it leads
  with is whichever has the **most recent** slate, not football specifically:
  football is simply the only sport with data so far.
- **`/about`** — why the site exists, that it is free, coverage by sport,
  where the numbers come from, how the RPI works, what is stored about players,
  and how to report a correction. Linked from the front page and the footer.
- **Following** — a reader can follow a team from its page. Stored in the
  **browser**, not an account: a parent wanting their kid's schedule should not
  have to make one, and holding a list of minors' teams against an email
  address is a responsibility worth avoiding until there is a reason to take it
  on. The front page shows followed teams with next and last game, and renders
  nothing at all when the list is empty.
- **Rosters** — 10,743 players across 220 football teams, with jersey, grade,
  positions, height and weight. Height and weight are **public**: it is
  football, and schools publish them. They live on `player_season` because a
  sophomore is not the same size as a senior. 448 players have no jersey and so
  cannot receive statistics — a box score identifies players by number, never
  by name — pending confirmation from coaches.
- **Records** — overall and district, shown as `2-0 (District 0-0)` on team
  pages and in the teams index. **District games are determined by the
  alignment, not by whatever a schedule document claims** — two teams are in
  the same district or they are not, and the imported KHSAA alignment is the
  authority. Records are derived: any schedule or box score commit rebuilds
  them for the teams it touched.
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
- **Alignments for sports other than football.** Football's 2026 alignment can
  be imported; basketball and the rest still have empty region/district
  membership.
- **Playoff cross-bracketing.** The published alignment carries postseason
  cross-bracket rules ("District 3 and 5 bracket as Region 2"). These are
  parsed as prose and ignored — nothing models postseason structure yet.
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
- **`\s` does not survive into a Postgres regex.** THIS HAS NOW COST TIME
  THREE TIMES. Use a literal space or `[[:space:]]`, never `\s`, and never
  `\b` (Postgres spells word boundary `\y`). A pattern using them matches
  nothing and reports no error.
- **(original note) `\s` does not survive into a Postgres regex** the way you expect from a
  JS template literal — a `regexp_replace` using it silently matched nothing
  and the similarity search quietly under-performed. Use POSIX classes
  (`[[:space:]]`) in SQL.
- **A DB test that only passes on a pristine database is a weak test.** The
  import test clears its own roster and prior game first, and deletion order
  matters: `game` cascades to `stat_line`, but `import_batch` references
  `game` and `stat_line` references `import_batch`.
- **Football has 8 districts per class, not 4.** The first seed said four and
  was wrong; half a real alignment had nowhere to land. Corrected against the
  published 2026 document.
- **Dev fixtures make school matching look better than it is.** A fixture
  school named "St. Xavier" made an ambiguous name resolve exactly on a dev
  database while production, which refuses fixtures, would have missed it.
  Verify matching against a `NODE_ENV=production` seed.
- **Rollups do not maintain themselves and are easy to forget.** A schedule
  import carries results, so it must rebuild `team_season_record` — otherwise a
  team is 2-0 in the games table and 0-0 everywhere a human looks. Anything
  that writes a result must call `refreshTeamSeasonRollups`.
- **`search_document` is a materialized view and never updates itself.** It has
  now caught us twice — seeded schools, then 10,743 imported players, both
  present in the database and findable by nobody. Anything that creates a
  school, player or coach must call `refreshSearchIndex()`. The seed does it
  unconditionally; imports must do it explicitly.
- **Migrations are immutable once applied.** `migrate.mjs` checksums each file
  and refuses to run if one changed — even a comment. Editing an applied
  migration broke a deploy on 2026-09-01. Add a new migration instead; the
  explanation belongs in the new file or in this document.
- **The deploy migrates before swapping the app.** It used to restart `web`
  first, so new code briefly served against the old schema, and a failed
  migration left it that way. A failed migration now leaves the previous
  version running.
- **A game cannot be deleted once an RPI run references it.** `rpi_input`
  pins its games so a past rating stays reproducible; `deleteGame` reports
  that rather than surfacing a foreign key error.
- **Typecheck and build do not execute SQL.** A `GROUP BY` bug in
  `listTeamsAdmin` passed both and would have been a 500 on the page. Run new
  queries against the dev database before pushing.
- **A page with no route params gets prerendered at build time**, and the image
  builds without a database. Any data-backed page needs
  `export const dynamic = "force-dynamic"` or the Docker build fails at export.
- **The runtime image is not the build image.** It carries only what is
  explicitly copied, so a maintenance script can build fine and then fail with
  a bare `ERR_MODULE_NOT_FOUND` on the server. All four workspace packages and
  the `@kyboxscore` symlinks are copied now. Test a new script by running it
  inside the built image, not just locally.
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

### `search_document` cannot be refreshed CONCURRENTLY

It has no unique index, so `REFRESH MATERIALIZED VIEW CONCURRENTLY
search_document` errors out. Plain `REFRESH MATERIALIZED VIEW` works and takes
a moment, during which search returns nothing. That is fine at current size and
current traffic; if it stops being fine, add a unique index on
`(entity_type, entity_id)` in a migration rather than reaching for CONCURRENTLY
and being surprised again.

Also: it does not update itself. Anything that changes a school, team or player
**name** has to refresh it. This has been forgotten three times now.

### A page render cannot set a cookie

`cookies().set()` throws outside a Server Action or Route Handler. Anything
that trades a token for a cookie has to be a `route.ts`, not a `page.tsx`.

### `x AND y` is NULL, not false, when y is NULL

`(status = 'in_progress' AND score_updated_at > now() - interval '5 hours')`
returns NULL for every row where the column is NULL, so a TypeScript field
typed `boolean` quietly arrives as `null`. Wrap boolean projections in
`coalesce(..., false)`.

### Measure page weight with the script, not by hand

`node scripts/page-weight.mjs <url>` — it separates the scripts a modern
browser actually fetches from Next's polyfill bundle, which carries `nomodule`
and is therefore **never fetched** by any browser that supports ES modules.

This exists because measuring by hand got it wrong: summing every `<script>`
counted the 38.7 KB polyfill and reported the scores page as 172 KB, over the
150 KB budget. It is really **136 KB, under budget** — and about 126 KB of that
is React 19 plus the Next 16 app-router runtime. Our own code on the scoreboard
is roughly 10 KB, so there is nothing meaningful to trim there; a future
session should not go hunting.

Documents are small over the wire: the scoreboard is 40 KB raw and 6.4 KB
gzipped, and the team page 96 KB raw and 10.9 KB gzipped. Roughly half of each
document is the inlined RSC payload, which is near-duplicate text and
compresses away almost entirely. Not worth chasing.

## Open items

1. Season dates per sport, so the other 17 sports can open.
2. Re-run the alignment import each realignment cycle; the structure carries
   `effective_from`/`effective_to` and assignment lands on `team_season`, so
   past seasons keep their own districts.
3. Schedule the hourly RPI recompute the brief calls for — `npm run rpi` is
   the command; nothing runs it automatically yet.
4. Football's WP assignment is still the standard 1/0.5/0. The brief says
   football differs; the real table is a documented unknown in
   `packages/rpi/src/index.ts`.
4. CSV parser with interactive column mapping, then Excel.
5. Column maps for basketball and football.
6. Front page is bare — reads as a stub rather than a product.
7. Password change UI (only the CLI can reset a password today).
8. Confirm the provisional baseball season dates in `seed/001_reference.sql`
   against the published KHSAA calendar.

## Scheduled jobs

`docker/recompute-rpi.sh` is installed on the droplet at
`/home/deploy/kyboxscore/recompute-rpi.sh` and runs hourly from deploy's
crontab:

```
7 * * * * /home/deploy/kyboxscore/recompute-rpi.sh
```

It recomputes RPI for **every** sport with a season open — no `--sport`, so it
stays correct as sports are added — and prunes per-game `rpi_input` rows from
all but the most recent six runs per sport and variant. `rpi_result` is kept
for every run; that is the audit trail. Logs to
`/home/deploy/kyboxscore/logs/rpi.log`, trimmed to 2000 lines.

It skips silently when the web container is down, which happens briefly during
a deploy. The next hour picks it up.

Reinstall after a droplet rebuild:

```
cp docker/recompute-rpi.sh /home/deploy/kyboxscore/
crontab -l | grep -q recompute-rpi || \
  (crontab -l 2>/dev/null; echo '7 * * * * /home/deploy/kyboxscore/recompute-rpi.sh') | crontab -
```

## Running the tests

`npm test` **skips the database tests unless `DATABASE_URL` is set**, and CI
sets it. A change to database behaviour can therefore pass locally and fail in
CI. Before pushing anything that touches `packages/db`, run them for real:

```
docker compose -f compose.dev.yml up -d
DATABASE_URL=postgresql://kyboxscore:localdev@127.0.0.1:5432/kyboxscore \
  npm run db:migrate && npm run db:seed && npm test
docker compose -f compose.dev.yml down -v
```

Run it twice. These tests write to the database, and one that only passes on a
pristine copy is a weak test.
