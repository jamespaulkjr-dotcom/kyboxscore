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

## 2026-08-30 — Staff flow for teams and rosters
**Did:** `/admin/teams` (create a team, search existing) and
`/admin/teams/[id]` (add players, correct jersey and grade in place, remove).
Extended `packages/db/src/admin.ts`. Also ran the whole import chain end to end
against a throwaway database first — see below.
**Why:** 291 schools existed but a school is not a team, so nothing could hold
a roster and the importer had nothing to import into.
**Learned:** **Typecheck and `next build` do not execute SQL.** `listTeamsAdmin`
ordered by `sp.display_order` without grouping it — both passed, and it would
have been a 500 the first time anyone opened the page. Only running it against
a real database caught it. New queries get exercised against the dev database
before pushing, same as the Docker build rule.
Player slugs are globally unique and students really do share names, so a taken
slug gets a numeric suffix. Separately, entering a roster is repetitive enough
that a double-submit is easy: same name AND same jersey on one roster is now
refused, while the same name on a different number is allowed.
Removing a player who has statistics is refused outright rather than cascading
— the stat lines reference the player row and the record must not be orphaned.
**Earlier the same day:** verified the full import chain (parse → map → match →
commit) against the real Caverna export in a throwaway database. 11 rows, 11
matched, 206 stat values, and every line reconciled exactly against the PDF box
score of the same game (16 AB, 4 R, 2 H team totals). Re-commit refused,
stat_line count held. Nothing was written to production: the site is public and
that would publish real students' names before launch.
**Next:** schedule entry — `game` and `game_participant` — is the last blocker
on a real import.

## 2026-08-30 — Schedules, rollups, password change, integration test
**Did:** Four things, uninterrupted, on a standing go-ahead.
1. **Schedule entry** on the team page — opponent, date, home/away, status,
   scores. The schema's natural key (`team_pair_key`, `local_date`) already
   refused duplicate games, so that error is caught and reported in plain
   words rather than leaking a constraint name. A game with a box score cannot
   be deleted.
2. **Rollup refresh on import commit** — `refreshTeamSeasonRollups` rebuilds
   `player_season_stat`, `team_season_stat` and `team_season_record` inside
   the commit transaction. Recomputed wholesale rather than incremented, so a
   re-import converges instead of drifting. Honours each stat's
   `season_aggregation` (sum/avg/max/min) instead of assuming sum.
3. **`/account/password`** — changing a password revokes every session and
   reissues the current one, so the person making the change is not logged out
   mid-task while a leaked session dies immediately.
4. **`packages/db/test/import-pipeline.test.ts`** — the whole chain, asserted
   against the PDF box score. Skips without `DATABASE_URL`, runs in CI.
**Learned:** The prerender trap bit again on `/account/password` — any
data-backed page with no route params needs `force-dynamic` or the image build
fails at export. Caught locally this time because the rule was already written
down, which is the waypoint files doing their job.
**Still needs James:** school time zones (needs county data), the official name
behind "Competitive", Cloudflare (needs his account), and KHSAA season dates
for the other 17 sports.
**Next:** alignments — no team is in a district or region, so records and RPI
have nothing to classify against.

## 2026-08-30 — Alignments and schedule import
**Did:** District assignment on the team page, and `/admin/schedule` — paste a
block of games, preview what it resolved to, commit. `parseScheduleText` in
`packages/parsers` (10 tests) and `matchSchoolNames` / `commitSchedule` in
`packages/db`.
**Why:** James asked for football schedules on the site. Scraping KHSAA,
ArbiterLive or Riherds is a hard rule in CLAUDE.md — the constraint is those
sites' terms, not copyright in the facts — so the answer is the same one that
worked for the 291 schools: he supplies the data, we make ingesting it fast.
**Learned:** **`\s` does not survive into a Postgres regex** from a JS template
literal. `regexp_replace(name, '\s+...High\s+School$', ...)` silently matched
nothing, so the similarity search was comparing against the full name and
"Paduka Tilghman" scored 0.406 — under the floor. With `[[:space:]]` it scores
0.65 and matches. A silent no-op regex is the worst kind: everything "works".
Also: the integration test only passed on a clean database. It now clears its
own prior game and roster, and the deletion order is fiddly — `game` cascades
to `stat_line`, but `import_batch` references `game` while `stat_line`
references `import_batch`, so the cascade cannot start until both are cleared
by hand. Verified by running the suite twice: 60/60 both times.
**Design note:** ambiguous school names are never guessed. "Trinity" matches
two schools, so the row is skipped and both candidates are shown — the same
rule the box score importer uses for a jersey worn by two players.
**Next:** district data and season dates are both blocked on James. The RPI
engine is unit tested but has never run against the database.

## 2026-08-30 — RPI wired to real data
**Did:** `packages/db/src/rpi-run.ts` loads every final regular-season game into
the engine, runs official and shadow, and persists `rpi_run` / `rpi_result` /
`rpi_input`. `npm run rpi -- --sport football` is the command. `/[sport]/rpi`
publishes the table with the shadow rating and delta, plus a plain-English
explanation of what the numbers mean. Three assertions added to the DB test
suite; 61 tests, run twice to prove repeatability.
**Why:** The engine was unit tested against a hand-worked round robin and had
never touched the database. It is the moat — nobody else publishes a KHSAA RPI,
and nobody has ever shown a border-county coach what the .500 assumption costs
them.
**Learned:** Two real bugs, both invisible to typecheck.
1. The loader referenced `oos.win_pct`, a column that does not exist —
   `out_of_state_record` stores W/L/T, so the percentage is derived.
2. **The stored rating did not reproduce from its own stored components.**
   `class_factor` is `numeric(6,4)`, and a rating computed from the unrounded
   value misses by ~3e-5 — small, but it makes the published arithmetic look
   wrong to anyone who checks it, which is precisely the person this feature
   exists for. The published rating is now computed FROM the published
   components.
**Design note:** out-of-state teams are computed but never ranked. Their record
feeds everyone else's OWP, but they are opponents, not members. Also: a game
cannot be deleted once an RPI run references it, and `deleteGame` now says so
in words instead of throwing a foreign key error.
**Next:** nothing runs the recompute automatically — the brief asks for hourly.
Football's WP assignment is still the standard 1/0.5/0; the real table is a
documented unknown.

## 2026-08-30 — RPI could not actually run in production
**Did:** The runtime image copied only `packages/db`, so
`packages/db/scripts/rpi.ts` failed inside the container with a bare
`ERR_MODULE_NOT_FOUND` — it imports `@kyboxscore/rpi` through the db package.
Now copies every workspace package plus the `@kyboxscore` symlinks npm made.
**Why:** Caught by running the command against the deployed container rather
than assuming a green deploy meant a working feature. The pages served 200 the
whole time; only the recompute was broken, which is the half nobody looks at.
**Learned:** **The runtime image is not the build image.** A maintenance script
can typecheck, test, build and deploy green and still be unrunnable on the
server. Verify a new script by executing it inside the built image.

## 2026-08-30 — KHSAA football alignment import
**Did:** `/admin/alignments` — paste the published block, preview what resolved,
commit. Parser handles class headings, district lines, the real document's
"District -8" typo, cross-bracketing prose, and the withdrawal list. Verified
against the actual 2026 football alignment: 219 schools, **219 matched, 0
unmatched**, second run idempotent.
**Why:** James has the alignment for every football team and did not want to
enter 219 schools one at a time — and KHSAA realigns every two years, so this
gets re-run rather than done once.
**Learned:** Three things, none catchable without real data.
1. **Football has 8 districts per class, not 4.** The seed said four. Half the
   document would have had nowhere to land.
2. **Dev fixtures flatter the school matcher.** A fixture school literally
   named "St. Xavier" made that name resolve exactly on a dev database;
   production refuses fixtures and would have missed it. Re-verified against a
   `NODE_ENV=production` seed — where it resolves by similarity at 0.53
   against "Saint Xavier High School", correctly and visibly.
3. **Exact-match on the bare name is the single highest-value matching rule.**
   17 of 219 names failed because "Newport" is a substring of "Newport Central
   Catholic" — but "Newport" IS the school's name once "High School" is
   stripped. Adding that step took matching from 202/219 to 219/219.
**Design note:** assignment lands on `team_season`, not `team`. That is what
makes realignment non-destructive: next cycle's paste moves this season's
teams while last season keeps its own districts, so past records and RPI stay
correct.
**Next:** cross-bracketing is parsed and ignored; nothing models postseason
structure. Alignments for sports other than football are still empty.

## 2026-08-30 — Team schedule import (block format)
**Did:** `/admin/schedule/team` — paste a schedule copied off a schedule page,
where each game is a block rather than a row. Handles logo lines, "Opponent :"
prefixes, location lines, missing years, and several teams in one paste.
12 tests.
**Why:** The row-per-game importer assumed a format nobody actually has. James's
real paste is blocks, unlabelled, with no year.
**Learned:** Two things worth keeping.
1. **"L" means both Loss and League (district) in the same document.** Position
   disambiguates, never the letter: a result token always sits on the line
   immediately before a score line, and the game type is always the last line of
   the block. A block with no score has no result whatever letters it contains.
   Getting this backwards would silently invert a team's record and its RPI.
2. **`\b` after "@" never matches** — "@" is not a word character, so the
   anchor killed every away game while home games parsed fine. Half a schedule
   silently missing is worse than none of it.
**Also:** the year is absent from the source and is inferred from the weekdays -
across twelve games only 2026 fits, which is a check rather than a guess.
Ambiguity is reported and the user types the year in. Scrimmages are detected
and stored with `stage = 'scrimmage'` so RPI, which counts regular season only,
cannot be corrupted by one.
**Position on scraping:** James asked to drop the CLAUDE.md rule for schedules,
arguing the data is free. Facts are indeed uncopyrightable, but the constraint
is those sites' terms prohibiting automated extraction, so the answer did not
change. The pain he was describing was formatting, and that is what got fixed.

## 2026-08-30 — Records, and short school names
**Did:** Overall and district records now show as `2-0 (District 0-0)` on team
pages and the teams index. Schedule imports rebuild `team_season_record` for
every team they touch. Schools gained a `short_name` scoreboard label and every
public surface reads it.
**Why:** James asked for the record to show, with district split out because it
decides postseason placement — and asked for "High School" gone from display.
**Learned:** A schedule import writes results but was not rebuilding rollups, so
John Hardin was 2-0 in `game` and 0-0 in `team_season_record`. Anything that
writes a result has to refresh.
**Design note:** `short_name` for display, `name` for matching. Destroying the
legal name would have broken import matching, which relies on the long form,
and a record book should hold what a school is actually called. Parenthetical
disambiguators are kept in the short name or the two Trinitys collapse.
**Open question for James:** his schedule marks the Aug 29 game at Seneca as a
district game, but the KHSAA alignment he supplied puts John Hardin in 4A
District 2 and Seneca in 5A District 3, so it cannot be one. District status is
computed from the alignment, which is why the district record reads 0-0 rather
than 1-0. Either the source's marker means something other than district, or it
is stale. Raised rather than reconciled.

## 2026-08-30 — "David School" keeps its name
**Did:** The short-name rule now drops a trailing "School" only when more than
one word is left. One school in 291 is affected: "David School" stayed
"David School" instead of becoming "David".
**Why:** A bare "David" is not a school's name. The rule is a rule, not a
special case - "Louisville Collegiate School" and "Highlands Latin School" still
shorten correctly.
**Context:** David School fields no football team. It is one of 72 Kentucky
schools on file with no football alignment, which is expected: the alignment
covers 219 of the 291 schools. The rest appear once basketball and baseball
have teams.

## 2026-08-30 — Rankings: statewide by RPI, district by record
**Did:** `/[sport]/standings` — district standings ordered by district record,
grouped by class. Team pages now show "State #1 · 1st in 4A District 2", each
linking to the table it comes from. `getDistrictStandings` and
`getTeamRankings` in the db package.
**Why:** Two different questions. RPI answers "who is best in Kentucky";
district record answers "who gets seeded where", and only the second decides
the postseason.
**Learned:** The first ordering ranked an 0-1 team above four teams that had not
played, because "no games" was scored as worse than a loss. A team that has not
played is neutral (0.5), not last — 0-0 must outrank 0-1 and be outranked by
1-0. Caught only by looking at a real district table.
**Deliberately not done:** KHSAA's tie-breaking procedure — head to head, then
common opponents. Teams level on district record are ordered by overall record
then alphabetically, and the page says so. Inventing a tie-break would be worse
than showing a tie.

## 2026-08-31 — District asterisk, and correcting a mislabelled game
**Did:** District games are marked with `*` beside the opponent on a team's
schedule, with a one-line legend. Scrimmages are labelled inline. Admins can
change a game's type from the team page.
**Why:** James reported that the Aug 6 Central Hardin game was a scrimmage.
His source document labels it "District Game" — and Central Hardin is 6A
District 2 while John Hardin is 4A District 2, so it could never have been a
district game at all. That is the second independent sign the type markers in
these documents are unreliable, after the Seneca game.
**Design note:** the asterisk is derived from the alignment — two teams sharing
a district this season — never from what a schedule claimed. Nothing in the
file can be trusted to say so. Since a document also cannot be trusted to
identify a scrimmage, and a scrimmage counts for no record and no RPI, a human
needs to be able to correct it: hence the game-type control. Changing it warns
that existing ratings are stale rather than silently leaving them wrong.

## 2026-08-31 — Whole-season schedule spreadsheet import
**Did:** `/admin/schedule/sheet` — upload a CSV of one row per team per game and
load a whole season at once. Parser in `packages/parsers/src/schedule-sheet.ts`
with a dependency-free CSV reader; 12 tests.
**Why:** James produced a state-wide export: 2,595 rows covering every 2026
football game. Pasting 219 team schedules was the real cost of the previous
importer, and this removes it entirely.
**What the real file contains:** 2,473 rows where both schools are known, 72
where the opponent is out of state, 26 with no opponent, 12 multi-team
scrimmages ("Garrard County / Green County / Southwestern"), 12 where the
subject school is unknown. 55 rows name a scrimmage in the title, 18 are
canceled, 2 are forfeits, 476 carry scores.
**Learned:** Columns are matched by header name rather than position, because a
spreadsheet gains and loses columns between exports. Excel writes unformatted
dates as a serial day count from 1899-12-30, so both that and written dates are
accepted. A multi-team scrimmage row is skipped rather than split into invented
pairings - three fabricated games in the record would be worse than one missing
event. Where the result letter and the score disagree the row is refused, not
reconciled.
**Open:** "The Academy @ Shawnee" appears 12 times and is Shawnee High School
under its current name; there is no school-alias mechanism yet, so those games
are skipped. Out-of-state opponents are skipped because creating them needs a
state, which is a factual claim we do not have.

## 2026-08-31 — School aliases, out-of-state opponents, and an honest shadow RPI
**Did:** `school_alias` table checked before every other matching rule, seeded
with "The Academy @ Shawnee" → Shawnee. 51 out-of-state schools created from
the 2026 schedule export. Fixed Shadow RPI so it no longer invents records.
**Why:** The state-wide schedule named 284 schools; 52 did not match. One was
Kentucky under its current official name, 51 were genuine out-of-state
opponents. Skipping them would have left Kentucky teams' records short.
**Learned — the important one:** the first full run produced shadow deltas that
were **negative**, implying the flat .500 assumption *helps* teams that play out
of state. It does not. The engine was falling back to a winning percentage
computed from the only games we know about — the single game against the
Kentucky team, usually a loss — so Shadow RPI was comparing .500 against a
fabricated 0-1. An out-of-state team with no `out_of_state_record` is now left
out of the computation entirely, falls back to .500 under both formulas, and
the delta reads an honest zero. Raceland moved 4th to 7th once its opponent
stopped being treated as 0-1.
**On the placeholder state:** `'XX'`, not a guess. The column is never
displayed and is used only as "Kentucky or not". Inventing 51 state codes from
memory would put wrong facts in a record book to fill a field nobody reads.
**Dress rehearsal:** 2,557 rows became 1,316 unique games with 1,241 duplicate
copies recognised, in 28 seconds; RPI over 221 teams runs in under a second.

## 2026-08-31 — CI caught what local testing did not
**Did:** Fixed the RPI test, which asserted that four teams were computed when
the correct answer is now three.
**Why:** The assertion encoded the old, wrong behaviour — it counted an
out-of-state team that was being given an invented record. The fix that stopped
inventing records broke it, which is the test doing its job.
**Learned:** `npm test` silently skips the database tests when `DATABASE_URL` is
unset, so "94 passed, 4 skipped" locally became a red CI. Running them locally
needs the dev database up. Written into STATUS.md as a pre-push step for any
change under `packages/db`.
Also: the test passed once and failed on re-run, because the
`out_of_state_record` it creates survived into the next run and spoiled the
"before a record exists" phase. It now clears that too, and was verified three
times in a row.

## 2026-08-31 — Full season imported; canceled games were being filed as upcoming
**Did:** Imported the state-wide 2026 football schedule into production — 1,304
games created, 1,253 duplicate copies recognised, 57 out-of-state teams
created, in 18 seconds. RPI over 221 teams. Then fixed a bug the import
surfaced.
**The bug:** `commitSchedule` derived a game's status purely from whether it had
scores, ignoring the status the parser had already worked out. The sheet marks
18 games Canceled and 2 Forfeit; every one landed as "scheduled" — sitting on a
schedule forever as a game that will never be played. Status now passes
through, defaulting to the derived value only when the source does not say.
**Learned:** the parser knowing something is not the same as it reaching the
database. Two layers, and only one of them was asked about it in review. Caught
by checking the imported counts against the source counts rather than trusting
"1,304 created, 0 failed".

## 2026-08-31 — Preseason games were counting toward records and RPI
**Did:** Added a `preseason` game stage, classified every game before its
season's `starts_on`, kept a separate preseason record, and set football 2026 to
open on 19 August.
**Why:** James pointed out that KHSAA counts nothing played before the first
permissible date. 185 games sat before that date and 22 of them had results
counting toward records, district standings and RPI. Raceland was ranked 7th in
the state at 2-1; they are 1-1 with a preseason win.
**Design note:** driven by `sport_season.starts_on` rather than a literal date,
so it is correct for every sport and every future season — the seeded date is
the single thing to get right. An explicit scrimmage keeps that label rather
than being overwritten: a scrimmage is more specific than "before the season
opened", and a human may have set it deliberately.
**Postgres note:** a new enum value cannot be used in the transaction that adds
it, so `ALTER TYPE ... ADD VALUE` and the reclassifying UPDATE are two
migrations.
**Also corrected:** the football season start was seeded as 21 August, which was
invented in an early session. It is 19 August.

## 2026-09-01 — Scrimmage labelling, kick-off times, and "Scheduled"
**Did:** Every game before the season opener now reads as a **scrimmage** on a
schedule, whichever stage it holds. Replaced the word "Scheduled" with the
actual kick-off time, and gave canceled, forfeit, postponed and live games their
own labels. A scrimmage no longer prints W or L beside its score.
**Why:** James asked whether the scrimmages and preseason games line up. They do
exactly: all 27 scrimmages and all 158 preseason games fall before 19 August and
nothing after it is either. The two big dates — 73 games on 7 August and 89 on
the 14th — are jamborees, and the source only labelled about a sixth of them.
Under KHSAA nothing before the opener is a countable game, so calling them all
scrimmages is simply accurate.
**On "Scheduled":** it told a reader nothing the date beside it had not already
said. The kick-off time is the thing they actually want, and the spreadsheet had
it all along — we were discarding the column.
**Design note:** `game.local_time` is a plain `time`, not folded into a
timestamptz. Kentucky spans Eastern and Central and every school's `time_zone`
currently claims Eastern, which is wrong for Paducah, Owensboro, Bowling Green
and Hopkinsville. Converting through a zone known to be wrong would produce a
confidently incorrect instant; "7:00 PM local" is what the schedule says and
what a reader needs.
**Also:** a scrimmage with a score was rendering as "L 7-12". It is not a loss.
The letter now appears only for games that count.

## 2026-09-01 — An outage, and the ordering flaw that made it one
**What happened:** the kick-off time deploy failed at the SSH step and left
production serving errors on team pages: new code querying `game.local_time`
against a database that did not have it yet.
**Two causes.**
1. *Mine.* I added an explanatory comment to `0008_classify_preseason.sql`
   after it had already been applied. `migrate.mjs` checksums migrations and
   refused to run — correctly. Migrations are immutable once shipped, comments
   included.
2. *Structural.* The deploy ran `docker compose up -d web` **before** the
   migration, so the new image went live against the old schema and stayed
   there when the migration aborted. My mistake should have been a failed
   deploy, not an outage.
**Fixed:** migrations and seed now run with the new image in a throwaway
container **before** the running app is swapped. A failed migration now leaves
the previous version serving.
**Repair:** the checksum was re-pointed at the deployed file (the change was
comment-only, verified by diff), migrations and seed ran, and all 1,316
kick-off times were backfilled.

## 2026-09-01 — Two ordering bugs the real standings exposed
**Did:** The RPI table is listed by rank rather than raw RPI, and district
standings break a tie on wins before falling to alphabetical.
**Why:** With 221 teams and two weeks played, exact RPI ties are common. The
page sorted by rpi while ranks were assigned on a different key, so the top
twenty read "1, 3, 2, 4" with rank 20 apparently missing — Mayfield and Hazard
both sit on 0.9341. And in 1A District 7, Middlesboro at 1-0 outranked
Williamsburg at 2-0: both are 1.000, and without a second key the tie fell to
alphabetical order.
**Learned:** neither bug is visible on small data. Three teams and two games
never tie. They appeared the moment a real season went in, which is the argument
for importing the whole thing rather than a sample.

## 2026-09-01 — Out-of-state records: entry, not extraction
**Did:** `/admin/out-of-state` — every out-of-state opponent this season,
ordered by how many Kentucky teams they played, with a paste box for their real
records. Saving recomputes rollups and RPI immediately, because Shadow RPI reads
these and stale ratings would keep showing a zero delta against records we now
have.
**Why:** James asked whether the records could be pulled from the respective
state associations. Not by scraping: that is automated extraction from sites we
have no agreement with, the same reason KHSAA is off limits. The rule in
CLAUDE.md names three sites, but the principle behind it is the permitted
channel list, and another association's website is not on it. Pasted from a
source he is entitled to read, with the source recorded, it is staff entry —
which is permitted.
**Design note:** `source_name` and `as_of` are required, not decorative. A
rating that moves because of one of these numbers has to be traceable to where
the number came from; that is the difference between a published rating and an
assertion. The schema had the fields all along and nothing was filling them.
**Also practical:** it is 1 September and the season is live, so these records
change weekly. A one-off scrape would have been stale within days; an entry path
that recomputes on save can be repeated.

## 2026-09-01 — School time zones: the mechanical half
**Did:** `county` is now filled from the school's own name where it states one —
102 of 291. Added `/admin/time-zones`, which moves whole counties (or named
schools) between Eastern and Central, and shows which schools still have no
county to work from.
**Why:** every school was seeded Eastern, which is wrong for the western third
of Kentucky. Nothing reads the field yet — kick-off times are deliberately
stored as plain clock times so a wrong zone could not produce a wrong instant —
so this is preparation, and the moment to get it right.
**What is deliberately NOT done:** which counties are Central. That is a factual
claim about the world; the boundary through south-central Kentucky is not
something to reconstruct from memory when a mistake silently shifts every game
time by an hour. The mechanism is built and the list has to come from James.
**Learned, again:** `\s` in a Postgres regex matches nothing and reports no
error. Third time. The county extraction silently returned zero rows. Written
into STATUS.md in stronger terms.
**Also:** counties are the right unit — the boundary follows county lines, so
per-school edits would be 291 chances to be inconsistent. But schools named for
a town state no county, so Warren Central and Warren East do not move when
Warren does. The form takes school names too.

## 2026-09-01 — Hourly RPI recompute
**Did:** `docker/recompute-rpi.sh`, installed on the droplet and run hourly from
deploy's crontab. `rpi.ts` with no `--sport` now covers every sport with a
season open, so it stays correct as sports are added.
**Why:** the brief asks for hourly recalculation and nothing was running it —
ratings went stale after Friday night until someone ran a command by hand.
**Retention:** an hourly job writes a run every hour forever. `rpi_result` is
small and kept for every run, because it is the audit trail. `rpi_input` is
thousands of rows per run and is pruned to the most recent six runs per sport
and variant, flipping `rpi_run.inputs_retained` — which is exactly what that
column was put there for.
**Learned:** the cron script was tested immediately and failed, because the
deployed container still had the old `rpi.ts` that required `--sport`. Worth the
thirty seconds: otherwise it would have failed silently every hour and the
first sign would have been stale ratings. It also skips cleanly while a deploy
has the web container down, rather than logging an hourly error.

## 2026-09-01 — Rosters, and an xlsx reader
**Did:** `/admin/rosters` imports a workbook with one tab per school — 220
tabs, 10,743 players, every school matched, 34 seconds. Also
`packages/parsers/src/xlsx.ts`, a dependency-free reader, because three
spreadsheets had now arrived and every one was hand-converted to CSV first.
**Learned:** the workbook writes namespace-prefixed tags — `<x:sheet>`, not
`<sheet>`. Regexes anchored on the bare tag name matched nothing and the file
read as zero sheets with no error. Same failure shape as `\s` in a Postgres
regex: a pattern that silently matches nothing.
**Idempotency:** a player already on the roster under the same name and jersey
is refreshed rather than duplicated, matching the single-player guard. Verified
by importing one team twice: 0 added, 36 refreshed.
**Measurements:** height and weight are stored on `player_season`, not
`player` — a sophomore is not the same size as a senior, and a measurement
without its season is useless. James asked for them for scouting; that widens
CLAUDE.md's "names, schools, jersey numbers and game statistics", so it is a
deliberate decision recorded here rather than a drift. Nothing displays them
yet: storing and publishing are separate choices.
**Also:** 448 players have no jersey. They import fine but cannot receive
statistics, because a MaxPreps box score identifies players by number and never
by name.
**And:** the hourly RPI job no longer writes empty runs for sports whose season
is open but which have played no games — that was 48 rows a day of nothing.

## 2026-09-01 — 10,743 players imported, and invisible for two minutes
**Did:** Imported the rosters into production: 220 teams, 10,743 players, 28
seconds, every school matched. Then found none of them were searchable.
**Why:** `search_document` is a materialized view and does not update itself.
The seed refreshes it; an import run outside the seed does not. **Exactly the
same bug as the 291 seeded schools**, which is twice now.
**Fixed properly:** `refreshSearchIndex()` lives in the db package and the
roster import calls it when it adds anyone. Written into STATUS.md as a rule
rather than a note, since the gentler version did not stop it recurring.
**Caught by** searching the live site for a player name rather than trusting
"10,743 added, 0 failed" — the same habit that caught the canceled games.

## 2026-09-01 — Heights and weights on the roster
**Did:** Roster rows now show height and weight, formatted the way a roster
prints them (72 becomes 6'0", not 72). Public, per James: it is football and
schools publish this.
**Why the earlier caution:** these are minors and CLAUDE.md's rule is names,
schools, jersey numbers and game statistics. Storing them was already a
deliberate widening; publishing them is a second decision, and it is his to
make. Recorded here so nobody later reads it as drift.
**Open, needing the coaches:** 448 players have no jersey number. They are on
the roster and searchable but cannot receive statistics, because a MaxPreps
box score carries jerseys and never names. Not fixable from our side.

## 2026-09-01 — "High School" was still on the game page
**Did:** The game page, the coach dashboard and the coach-facing import screens
now show `short_name` like everywhere else.
**Why:** James followed Prestonsburg from the scoreboard to a game and found
"Prestonsburg High School" and "Lawrence County High School" repeated across
the page. `getGameSides` returned both `schoolName` (legal) and `shortName`,
and the scoreboard row used the short one while the game page used the long
one — so the bug was invisible from the page that had been checked.
**Deliberately unchanged:** admin listings still show the full legal name. Those
are the screens where somebody confirms an import matched the right school, and
"Newport" versus "Newport Central Catholic" is precisely the distinction being
checked. That reasoning is now a comment in `admin.ts` so it does not read as an
oversight.
**Learned:** a query returning both a display name and a legal name invites
exactly this. Anywhere a reader is just reading takes `short_name`; only
match-confirmation surfaces take `name`.

## 2026-09-01 — Sweeping for "High School" turned up two more
**Did:** Out-of-state schools now get a trimmed `short_name` like Kentucky ones,
and the teams index lists Kentucky schools only.
**Why:** checking James's reported path found the game page fixed but a sweep of
every public page found five out-of-state schools still reading "Northwest High
School", because they were created with `short_name = name` and never had the
trimming rule applied. And 51 out-of-state teams were listed in the Kentucky
teams index — the same category error as ranking them in the standings. Their
team pages still resolve from a game; they are simply not listed as Kentucky
teams.
**False alarm worth recording:** every page shows four occurrences of "High
School" and always will. It is the site title, "Kentucky High School Sports".
A grep for the phrase will never return zero.
**Learned:** the fix James reported was one instance of a class. Sweeping every
public page rather than the one he mentioned found the rest — and would have
found the game page too, had it been done when short names were introduced.

## 2026-09-01 — The front page
**Did:** `/` is now a real page rather than a redirect to the scoreboard. Most
recent slate first, then statewide RPI, then the way into standings, teams,
leaders, sports and search. Ends with a plain sentence of scale and the "not
affiliated with the KHSAA" line.
**Why the shape:** the brief's target is a parent on bad LTE in a gym lobby
finding a score in under three seconds, so scores lead. Everything after it
answers the other question — why this rather than any other scoreboard — with
the two things nobody else publishes: a KHSAA RPI and district standings
ordered by district record. No hero, no carousel, no stock photography; the
data is the design.
**Also fixed on the way:** the scoreboard printed "TBA" for every scheduled
game. `GameRow` read `starts_at`, an exact instant we almost never know and
which no imported game has, while the kick-off time lives in `local_time`. A
thousand games said TBA when the time was sitting in the database.

## 2026-09-01 — Sport is now the primary distinction in admin
**Did:** `/admin/teams` gained sport filter chips with counts, the sport reads
as a label rather than trailing prose, and the page states what it is showing.
The team page leads with the sport above the school name, and its roster and
schedule headings name it. The coach dashboard does the same.
**Why:** James pointed out that the admin pages read as "this school has
players" when they mean "this school's football team has players". With one
sport loaded, 225 rows each ending "Football · boys · varsity" is noise; with
basketball added it becomes a hazard, because nothing separates two otherwise
identical rows for the same school.
**Design note:** a school is not a team. Everything on a team page - roster,
schedule, district, record - belongs to exactly one sport, and the school name
alone never says which. Putting the sport above the name rather than after it
is the difference between a label and a footnote.

## 2026-09-01 — Kentucky by default in admin, and grades in the language people use
**Did:** `/admin/teams` lists Kentucky teams by default with a link to include
the out-of-state opponents; the chip counts follow the same rule. Grades display
as Fr/So/Jr/Sr everywhere, and the admin fields accept either form.
**Why:** the admin count said 276 while the public teams page said 225, and the
difference was 51 out-of-state opponents nobody administers. Two numbers for the
same word is how a person stops trusting either. Kentucky is now the default in
both places, and the toggle says exactly what it adds.
**On grades:** nobody in a gym says "grade 12". Storing the number is right —
it sorts and it does arithmetic — but it should never have been what a reader
sees. Middle-school grades keep the ordinal, because there is no shorthand for
eighth grade. The input round-trips: type "Sr" or "12", store 12, show "Sr".

## 2026-09-01 — Shouted names, and following a team
**Did:** Names arriving in ALL CAPS are calmed at import and in the existing
data. Added following: a star on a team page, and a "Your teams" block on the
front page with next and last game.
**On the names:** 87 players had an all-caps part, but only 18 were the actual
problem. The rest were initials — AJ, TJ, D.K — and "Aj" is worse than "AJ".
The rule only touches a part that is entirely uppercase and long enough not to
be initials, and never touches a name that already carries lower case, because
MeJean, DeShields and DuLany-Waugh were typed deliberately. MCLEROY becomes
McLeroy, not Mcleroy. "JR" is left alone: it is a suffix, and it is also a boy
called J.R., and leaving it is the only answer that cannot be wrong about
somebody's name.
**Applied to production:** 18 rows updated in `player`, and `search_document`
refreshed afterwards because player names live in it. Slugs were left alone —
they were already lowercased at import, so `/players/makhai-baylor` did not
move. The 69 rows left untouched are all initials: AJ, TJ, D.K, JB, ZT.
**On following:** kept in localStorage rather than behind an account. The brief
is careful about minors, and a database associating an email address with the
teams whose rosters a person watches is a different kind of record from a
scoreboard. Nothing leaves the device. It degrades to nothing without
JavaScript rather than breaking the page.
**Next step if wanted:** browser notifications need a service worker, a push
subscription per device, VAPID keys and a job that sends on a schedule — and
push subscriptions are per-device, so they work without accounts too.

## 2026-09-01 — Saying what the site is
**Did:** Gave the front page a visible statement instead of a
screen-reader-only `<h1>`, added an "Every sport" section that lists every
sport including the ones with nothing in them yet, wrote `/about`, and put
About / Sports / Report a correction in the site footer.
**Why:** James asked why football is basically the home screen. It is not
hardcoded — the page picks whichever sport has a recent slate, and football is
the only sport with data. But nothing on the page said that, so a volleyball
parent had no way to tell this was not a football site, and a first-time
visitor had no way to learn it is free.
**What I did not do:** a marketing hero above the scores. The brief's target is
a parent on bad LTE finding a score in under three seconds, and most traffic is
returning visitors who want the scoreboard, not the pitch. The claims that
needed room went on `/about`; the front page got two lines of text and no
images.
**Found while testing:** `active` was `summaries.find(s => s.slate)`, which
returns the first sport in display order that has ever played a game. Football
keeps its slate forever once the season starts, so in December the front page
would have shown a September football slate instead of last night's
basketball. Now it takes the sport whose most recent slate is actually the most
recent.

## 2026-09-01 — Live scoring, and who is allowed to do it
**Did:** Coaches can now keep a score live or just post a final, and hand the
job to whoever is actually in the press box. Public pages show a red LIVE pill
and poll for score changes.

**The design question James asked was who enters it.** The honest answer is
that the person keeping a high school football score is usually not the coach —
it is a team mom, a student manager, or somebody's uncle, and none of them are
going to create an account twenty minutes before kick-off. So there are two
doors: an account holder with a team grant scores any of their team's games,
and a coach can mint a **per-game link** and text it to whoever is in the box.

The link is a bearer token and is treated like one: one game, expires the same
night, revocable from the coach's screen, cannot mint further links, and can
only move a score — no rosters, no other games. It is exchanged for an httpOnly
cookie on first use so the token does not sit in the address bar, because a
scoring console gets held up and photographed. Nothing about a minor is exposed
by it; the worst case is a wrong score, which is visible, attributed and
undoable.

**Live is a human claim, not a clock reading.** A game is LIVE only once
somebody starts keeping it. Kentucky football gets weather delays, and a
blinking LIVE dot on a 0-0 game that has not kicked off is worse than showing
nothing. The clock's only job is deciding whether the page bothers polling.

**And LIVE expires.** `score_updated_at` older than five hours stops the
indicator, on the server render as well as in the poll. The keeper going home
at the end of the third quarter must not leave the scoreboard blinking at 3am;
the row falls back to the score plus "Awaiting final", which is exactly what is
true.

**On stats, deliberately not built:** per-player rushing yards entered live. No
volunteer is doing that for football while also watching the game. Stats stay
on the file import after the game, which is the flow coaches already have.

**Two things testing caught.** A page render cannot set a cookie — Next is
right about that and the first version of the link exchange was wrong; it is a
route handler now. And `(status = 'in_progress' AND score_updated_at > ...)` is
NULL, not false, when the column is NULL, so a field typed `boolean` was
arriving as null; it is wrapped in coalesce now.

**Found, not caused:** the scores page ships 172 KB of gzipped JavaScript
*before* any of this work, against a 150 KB budget in CLAUDE.md. Live scoring
added about 2 KB. The overage is the React 19 / Next 16 client runtime, so it
needs its own look rather than being blamed on the next feature that touches
the page.

## 2026-09-01 — The JavaScript budget, and a header that knows you

**The budget was not actually over.** I reported the scores page at 172 KB
against a 150 KB budget. That was wrong, and the error was mine: I summed every
`<script>` on the page, including Next's polyfill bundle. That bundle carries
`nomodule`, which is the whole reason it exists — a browser that supports ES
modules never fetches it. The real number a reader pays is **136 KB, under
budget**, and it holds on production for the front page, the scoreboard and a
team page.

About 126 KB of that is React 19 plus the Next 16 app-router runtime. Our own
code on the scoreboard is roughly 10 KB, and the live-scoring poller added 1.7
KB of it. There is no meaningful win available in our code, so I did not
manufacture one.

Documents are already cheap over the wire: the scoreboard is 40 KB raw and 6.4
KB gzipped; the team page 96 KB raw and 10.9 KB gzipped. Roughly half of each
is the inlined RSC payload, which is near-duplicate text and compresses to
nearly nothing. Production is compressing (verified: 41.6 KB → 7.6 KB) and
serving chunks `immutable`.

`scripts/page-weight.mjs` exists so this is measured the same way every time,
and so the polyfill is never counted again.

**The header now knows you are signed in.** James reported losing his admin
rights when he left the coach page. He had not: the header was stateless on
purpose, because reading the session there would opt every public page into
dynamic rendering and cost the scoreboard its edge cache. But it said "Sign in"
to somebody who was signed in, which is a lie the site was telling on every
page.

Fixed with a `kbs_who` cookie that carries a role and nothing else — no token,
no name, no id. It is readable by JavaScript by design, so it had to be
worthless if read: forging it changes one word in the header and then the
server refuses you at the door. The cached HTML stays anonymous and correct for
every viewer; the swap happens after hydration.

The cookie-string parsing is unit tested, including the bug it would otherwise
have: `startsWith("kbs_who=")` also matches `not_kbs_who=`.

**Note for James:** existing sessions predate the cookie, so sign out and back
in once to see it.

## 2026-09-01 — Reset a game
**Did:** An admin-only "Reset this game" at the bottom of the scoring console.
It deletes the scoring plays and quarter scores, clears both scores, puts the
game back to scheduled, revokes any keeper links, and rebuilds both teams'
records.
**Why:** James tested live scoring on a real fixture — Breckinridge County vs
Bullitt Central — which is the only way to find out whether it works, and then
had to ask for the database to be cleaned up by hand. That is a fine thing to
do once and a bad thing to do every time.
**What it refuses:** a game with an imported box score, because the scoreboard
and the box score would then disagree and the importer is the right place to
undo an import. A past RPI run is deliberately *not* a blocker: `rpi_input`
stores the numbers each run was computed from, so an old rating stays
reproducible even after the game underneath it changes. That is what those rows
are for.
**Records:** rebuilt after the reset, outside the transaction. A rollup failure
must not roll back a reset that already succeeded, and re-running rollups is
always safe. Verified a team going 1-1 → 2-1 on a final and back to 1-1 on
reset.
**Confirmation is typing the short code**, not a checkbox. Everything else on
that page is built to be tapped fast in the dark; this one thing should cost a
moment's thought.
**Also:** the live scoring path now has real database tests — scoring, undo as
a void that keeps the row, reset, the box-score guard, and that play points
come from the server's table rather than from the caller.

## 2026-09-01 — Typing the score, and saying who scored
**Did:** The score can be typed in directly at any point, and every scoring
play can carry who scored, how, who threw it, and the clock. The public game
page now has a Scoring summary with the running score.

**The bug this exposed.** Scores were recomputed from the plays, so anybody who
typed "14-7" because they picked the game up at half time had it wiped the
moment they tapped the next touchdown. That is not an edge case — it is the
normal way somebody starts keeping a game. `game_participant.score_adjustment`
now holds whatever was typed and the published score is `sum(plays) +
adjustment`, so a later tap adds to the typed baseline and an undo returns to
it rather than to zero.

**Detail is never a condition of scoring.** The tap has to land while the crowd
is still reacting. So the buttons stay one tap, and the play then opens to ask
who scored and how — at the next timeout, after the game, or never. The
disclosure is a native `<details>` and the form inside is a real form, so all
of it works if the client bundle never arrives.

**Prose is composed, not typed.** `play_key` and `method` are stored separately
from `description`, and the sentence is rebuilt on every edit. Matching on the
prose to decide which follow-up questions to ask would have broken the first
time somebody reworded "Touchdown". A pass reads "Trae Martin to Makhai Baylor,
touchdown catch"; the passer is `assist_player_id`, which the schema already
had waiting.

**Guarded:** a player has to be on the roster of the team credited with the
score, so a stray id cannot hang somebody else's name on it. The clock is
accepted only as real minutes:seconds.

## 2026-09-01 — Taking the em dashes out
**Did:** Removed em dashes from every sentence a reader sees. James asked for
it on the about page; I swept the rest of the public copy and the coach and
keeper screens too, because leaving the identical tell on the front page would
have defeated the point of fixing it on one page.
**Why he asked:** they read as machine-written, and this site is asking
Kentucky coaches and parents to trust it with their kids' names and numbers.
Prose that reads as generated undermines that before anybody gets to the data.
**Rewritten, not swapped.** An em dash usually joins two clauses, so most
became a full stop and a new sentence, a couple became a colon, and one pair
became parentheses. Nothing was replaced with a hyphen or a comma splice.
**Kept:** the `—` glyph in table cells, which is standard notation for "no
value" in a stats table and is not a sentence, and the ones in code comments.
**Admin too, on a second pass.** I had said "four occurrences" on the admin
screens; that count came from a broken shell loop and the real number was
about thirty. Corrected and swept: prose became sentences, and the inline
annotations ("season not open", "no match", "counts for nothing") became
parentheses. Every admin page now renders with zero em dashes in a sentence.
**Worth remembering:** this is a house style rule now, not a one-off. New
reader-facing copy should not use em dashes.
