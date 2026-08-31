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
