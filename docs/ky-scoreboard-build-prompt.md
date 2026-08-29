# Build Prompt: Kentucky High School Sports Scoreboard

Paste this into a coding agent (Claude Code recommended) as the opening brief.

## Role

You are the lead engineer and product designer for a statewide high school sports scoreboard and statistics platform for Kentucky. Build it to be the fastest, clearest, most navigable sports data site in the country. The bar is not "better than the incumbent." The bar is that a parent standing in a gym lobby on a bad LTE connection finds the score she wants in under three seconds.

## Background you need

For 29 years, Kentucky high school sports ran on the Riherds.com Scoreboard, built and operated by one man under contract to the KHSAA. It stopped updating June 30, 2026. The KHSAA moved its data systems to ArbiterSports. The official replacement is a WordPress skin over ArbiterLive at khsaa.arbiterwebsites.com.

What Arbiter has: schedules, scores, rosters, including sub-varsity. What Arbiter does not have: player statistics entered by coaches, statewide leaderboards, RPI, game-level box scores, historical record books.

That missing stat layer is the product. Schedules and scores are table stakes that draw traffic. Stats are the moat.

## Hard constraints

- MaxPreps has no public developer API. Third party services advertising one are scrapers with a billing layer. Do not use them. MaxPreps, now owned by PlayOn, is the real competitor for the statistics layer, since it already ingests Hudl and GameChanger data nationally. Our advantage is that it has no KHSAA classification, district or region structure, no KHSAA RPI, and no Kentucky record book. Compete on Kentucky specificity, not on coverage.
- Do not scrape KHSAA, ArbiterLive, or the Riherds archive. Both sites prohibit automated data extraction and Riherds blocks robots. Every byte of data in this system must arrive through one of: coach or AD submission into our own forms, a licensed API under signed agreement, a public domain or permissively licensed source, or manual entry by our own staff.
- Design the data layer so that a future Arbiter Partner API integration can be dropped in without a rewrite. Assume we will eventually have a contract. Build an adapter interface now with one implementation being manual entry.
- Student athlete data. Names, schools, jersey numbers, and game statistics only. No addresses, no birthdates, no contact info, no photos without an explicit consent workflow. Minors are involved. Treat this seriously and document the data policy in the repo.
- Mobile first, and I mean it. Design every screen at 375px wide before you look at desktop. Most traffic is a phone in a stadium.

## Product scope, phase one

Ship these and nothing else:

**Score board.** Statewide scores for one sport on one date. Default view is today. Grouped by classification or region, toggleable. Final, in progress, and scheduled states are visually distinct at a glance without reading text.

**Team page.** Full season schedule and results, current record, roster, season statistics, and a link to each game. This is the most visited page type on a site like this. Make it the best page on the internet.

**Game page.** Box score, scoring summary, individual stat lines. Permalink that is short and shareable.

**Player page.** Season and career statistics, game log, team history.

**Leaderboards.** Statewide and by classification, per sport, per stat category. This is what nobody else has. Make it prominent.

**Coach entry.** A dead simple authenticated form for entering a box score. It must be completable on a phone in under two minutes on a bus ride home. If it takes longer than that, coaches will not use it, and if coaches do not use it there is no product. Prototype this flow before you build anything else.

**Search.** One search box, everywhere, that resolves teams, schools, players, and coaches. Instant results as you type.

Not in phase one: user accounts for fans, comments, forums, live play by play, video, ads, mobile apps, recruiting features.

## Sports, phase one

Football and basketball, boys and girls. Add baseball and softball in phase two. The schema must be sport agnostic from day one because there will eventually be twelve or more.

## RPI engine

RPI is a first class feature, not a report. Build it as a service with its own tables and a full audit trail.

The official KHSAA formula:

```text
RPI = (WP * 0.35) + (OWP * 0.35) + (OOWP * 0.30)
```

Rules to implement:

- Margin of victory is never a factor.
- All out of state teams are assigned a flat .500 WP. So are in state home school teams playing a member school.
- Regular season games only.
- A class factor rewards playing up in classification. Roughly 15% between classes with a baseline of 1.0.
- Football uses a different WP value assignment than the other sports.
- Do not publish an RPI for any team with missing scores.
- Recalculate hourly.

Now the differentiator. Compute a second, unofficial rating in parallel called Shadow RPI, identical except that out of state opponents carry their real winning percentage instead of the flat .500. Display both, side by side, with the delta and a plain English explanation of why they differ. Coaches near the state line have complained for years that the .500 assumption distorts their ranking. Nobody has ever shown them the number.

To source out of state records, only teams that Kentucky schools actually played matter. That is a few hundred teams across seven bordering states, not tens of thousands. Pull win loss records from the publishing state associations or enter them manually. Record W and L only, plus the source and date, in a separate OutOfStateTeams table. Never scrape a commercial site for this.

Every RPI value stored must be reproducible. Persist the inputs, not just the output, so any coach who disputes a ranking can be shown the arithmetic.

## Stat import

Coaches will not retype stats they have already entered somewhere else. The import path is the adoption path.

Do not attempt to integrate with Hudl or GameChanger APIs. Hudl's API business is aimed at professional clubs and GameChanger has no public API. Both, however, already export a file, and it is the same file.

- Hudl exports a MaxPreps formatted .txt for football, basketball, volleyball and lacrosse.
- GameChanger exports a MaxPreps TXT from the game box score for baseball, softball, basketball, field hockey, hockey, lacrosse, soccer and water polo.
- GameChanger also exports season totals as CSV for baseball, softball and basketball.

Therefore: build one robust parser for the MaxPreps .txt format. That single parser covers both vendors across every sport in scope and requires zero retraining, because coaches already know how to produce that file. Ship it first.

Then add, in order:

- Generic CSV upload with an interactive column mapping step. Remember each coach's mapping so the second upload is one click.
- Excel upload, same mapping flow.
- Manual entry as the fallback, never the primary path.

Skip PDF parsing in phase one. Any coach with a PDF box score also has the file that produced it.

Import requirements:

- Preview before commit. Show the parsed roster and stat lines mapped to our player records, flag every unmatched name, and let the coach resolve conflicts before anything is written.
- Fuzzy match player names against the roster and learn from corrections.
- Idempotent. Re-importing the same game overwrites rather than duplicates.
- Every imported record carries its source file, vendor, and timestamp.
- Never let an import silently fail. Report what was skipped and why.

## Navigation requirements

This is the whole point of the project. The incumbent buries everything in dropdowns and tabs. Rules:

- Any page reachable in two taps from any other page.
- Persistent bottom navigation on mobile: Scores, Teams, Stats, Search.
- Every URL is human readable and guessable. /football/2026/teams/john-hardin not /kyfb26/96748.
- Sport, season, and date are always visible in a persistent header and always changeable without losing your place. Switching from football to basketball on a team page keeps you on that school.
- Back button always does what the user expects. No tab state that breaks it.
- Deep links work. Every view has a URL. Nothing is trapped behind a click.
- Keyboard navigable, screen reader clean, WCAG 2.2 AA. This is a public service site.
- No modal that cannot be dismissed. No interstitial. No newsletter popup.

## Performance budget

- First contentful paint under 1.2s on simulated 3G.
- Largest contentful paint under 2.0s.
- Total JavaScript under 150KB gzipped for the scores page.
- Score pages render from server or static output. Do not require JavaScript to read a score.
- Works acceptably with JavaScript disabled for all read-only views.
- Every score page cached at the edge with short TTL and stale-while- revalidate.

## Suggested stack

Propose alternatives if you have a strong reason, but default to:

- Next.js App Router with React Server Components
- PostgreSQL with a well normalized schema
- Drizzle or Prisma
- Tailwind
- Deployed on Vercel or Fly, Postgres on Neon or Supabase
- Auth scoped to coaches and administrators only in phase one

## Schema requirements

Model these entities properly. Get this right and everything else is easy.

Schools, Teams (school plus sport plus season plus level), Seasons, Sports, Classifications and Districts and Regions with effective dates because alignments change every two years, Games, GameParticipants, Players, PlayerSeasons for transfers and grade progression, StatLines keyed to game and player and sport, StatDefinitions so new sports do not require migrations, Coaches, Venues, DataSources for provenance on every record.

Every stat record carries its source and entry timestamp. When a coach disputes a number, you need to know where it came from.

## Design direction

Study what makes ESPN's scoreboard scannable and then make it quieter. High information density, minimal chrome, generous tap targets, real typographic hierarchy. School colors used as accents only, never as backgrounds. Dark mode from the start.

Do not make it look like a 2015 sports blog. No hero images. No carousels. No stock photos of generic athletes. The data is the design.

## Deliverables for this session

- Data model as SQL DDL with commentary on the tricky parts.
- Full URL and route map.
- The MaxPreps .txt stat file parser, with tests, plus the import preview and name matching flow. This is deliverable one in practice.
- The coach box score entry flow as a working prototype.
- RPI engine with both official and shadow calculations, unit tested against a hand worked example.
- Scores page and team page, working, with seed data.
- A README covering the data sourcing policy and the legal constraints above.

## How to work

Ask me questions when a product decision is genuinely ambiguous. Do not ask permission to write code. Build the stat importer and the coach entry flow first and show them to me before going further, because if coaches will not use them nothing else matters.
