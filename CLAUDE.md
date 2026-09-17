# kyboxscore.com

Kentucky high school sports scoreboard and statistics platform. Read this before doing anything in this repo.

## What this is

For 29 years Kentucky high school sports ran on the Riherds.com Scoreboard, built and operated by one man under contract to the KHSAA. It stopped updating June 30, 2026. The KHSAA moved to ArbiterSports. The official replacement at khsaascoreboard.org is a WordPress skin over ArbiterLive.

Arbiter has schedules, scores, and rosters. Arbiter does not have player statistics entered by coaches, statewide leaderboards, RPI, box scores, or a historical record book. That missing layer is this product.

Schedules and scores draw the traffic. Statistics are the moat.

## Hard rules, no exceptions

**Never scrape KHSAA, ArbiterLive, or the Riherds archive.** Both sites explicitly prohibit automated data extraction and Riherds blocks robots. If a task seems to require scraping any of them, stop and say so instead of doing it.

**Never use a third party "MaxPreps API."** MaxPreps has no public developer API. Every service advertising one is a scraper with a billing layer.

Every record in this system must arrive through one of:

- coach or AD submission into our own forms
- a licensed API under signed agreement
- a public domain or permissively licensed source
- manual entry by our own staff

**Student athlete data.** Names, schools, jersey numbers, and game statistics only. No addresses, no birthdates, no contact information, no photos without an explicit consent workflow. Minors are involved. When in doubt, leave the field out of the schema.

## Competitive position

The real competitor for the statistics layer is MaxPreps, not Arbiter. MaxPreps already ingests Hudl and GameChanger data nationally. Our advantage is that it has no KHSAA classification, district, or region structure, no KHSAA RPI, and no Kentucky record book. Compete on Kentucky specificity, never on coverage.

## Architecture

```text
apps/web            Next.js App Router, React Server Components
packages/db         schema, migrations, seed
packages/parsers    MaxPreps txt, CSV, Excel importers
packages/rpi        RPI engine, official and shadow
```

Postgres. Tailwind. Docker. Deployed to a DigitalOcean droplet via GitHub Actions building to GHCR. Caddy terminates TLS. Cloudflare in front.

Parsers and the RPI engine stay as separate packages. Both need heavy unit testing against fixture files and neither should be tangled into web framework code.

## The importer is the adoption path

Coaches will not retype statistics they already entered elsewhere.

Hudl exports a MaxPreps formatted .txt for football, basketball, volleyball, and lacrosse. GameChanger exports a MaxPreps TXT from the game box score for baseball, softball, basketball, field hockey, hockey, lacrosse, soccer, and water polo, plus season totals as CSV for baseball, softball, and basketball.

It is the same format. One robust parser for the MaxPreps .txt covers both vendors across every sport in scope and requires zero coach retraining.

Do not chase Hudl or GameChanger APIs. Hudl's API business targets professional clubs. GameChanger has no public API. The Hudl to MaxPreps sync went dead January 1, 2025 over an agreement dispute and stayed broken. File import kept working. Build on the file.

Order: MaxPreps txt parser, then CSV with interactive column mapping, then Excel, then manual entry as the fallback. Skip PDF in phase one.

Import requirements:

- preview before commit, with unmatched player names flagged for resolution
- fuzzy name matching that learns from corrections
- idempotent, re-importing a game overwrites rather than duplicates
- every record carries its source file, vendor, and timestamp
- never fail silently, always report what was skipped and why

Fixture files live in packages/parsers/fixtures/. Real exports from Hudl and GameChanger are the ground truth. Do not invent the format.

## RPI

The official KHSAA formula:

```text
RPI = (WP * 0.35) + (OWP * 0.35) + (OOWP * 0.30)
```

Rules, checked against KHSAA's published method on 17 September 2026. Their
calculation steps page and the 21 page Ashland Blazer worked example at
https://ly.khsaa.org/uynq are the authority, not this summary:

- margin of victory is never a factor
- regular season games only, and forfeits count as a normal result
- head to head is excluded when computing an opponent's WP, and that exclusion
  carries through OOWP. It does **not** remove the team being rated from its
  own opponent's OWP: KHSAA's example prints Ashland Blazer inside Raceland's
  OWP at 0.89110
- non-KHSAA opponents take a fixed value, reviewed every two years: **.51060**
  in football, **.53** in every other sport. In state home school teams take
  the same .53. It is not .500, and has not been since 2023-24
- no RPI published for a team with missing scores
- recalculate hourly

Football, and only football, weights a **win** by the class of the opponent.
The weight is the opponent's published class weight divided by the team's own:

```text
1A 1.323   2A 1.521   3A 1.749   4A 2.011   5A 2.313   6A 2.660
```

- a loss is 0.0 whoever it was against, so playing up earns nothing without a win
- playing down is penalised: 4A over 3A is 1.749/2.011 = 0.86972
- since 2023 the first two contests against a smaller class are exempt and
  treated as same class, in date order. A play-down loss still spends one.
  There are no exemptions when computing OWP or OOWP
- an out of state or unaligned opponent counts as the team's own class, a
  weight of exactly 1.0
- divide the published table, do not raise 1.15 to a power. The weights are a
  15% step but KHSAA publishes them rounded and divides the rounded figures

**A football WP can and does exceed 1.000**, and so can OWP, OOWP and the
rating itself. KHSAA says so explicitly. Anything that clamps at 1.0 is wrong.

Also compute **Shadow RPI**: identical except out of state opponents carry their real winning percentage instead of the fixed non-member value. Display both side by side with the delta and a plain English explanation. Coaches near the state line have complained for years that the fixed assumption distorts their ranking. Nobody has ever shown them the number. Note the baseline it is measured against is .51060 in football, not .500, so the page copy needs to say that rather than "a flat .500".

Out of state records come from the publishing state associations or manual entry, stored in OutOfStateTeams with W, L, source, and date. Only teams Kentucky schools actually played matter, a few hundred across seven bordering states.

Every stored RPI value must be reproducible. Persist the inputs, not just the output, so a disputing coach can be shown the arithmetic.

## Navigation is the product

The incumbents bury everything in dropdowns and tabs. Rules:

- any page reachable in two taps from any other page
- persistent bottom navigation on mobile: Scores, Teams, Stats, Search
- human readable, guessable URLs: /football/2026/teams/john-hardin, never /kyfb26/96748
- sport, season, and date always visible and always changeable without losing your place
- the back button always does what the user expects
- every view has a URL, nothing trapped behind a click
- WCAG 2.2 AA, keyboard navigable, screen reader clean
- no undismissable modals, no interstitials, no newsletter popups

## Performance budget

- first contentful paint under 1.2s on simulated 3G
- largest contentful paint under 2.0s
- under 150KB gzipped JavaScript on the scores page
- score pages render from server or static output, readable with JavaScript disabled
- edge cached with short TTL and stale-while-revalidate

The design target is a parent on bad LTE in a gym lobby finding a score in under three seconds. Peak load is 10pm on a Friday in October with the entire state hitting one page.

## Schema notes

Model these properly. Get it right once and everything downstream is easy.

Schools, Teams (school + sport + season + level), Seasons, Sports, Classifications and Districts and Regions **with effective dates** because alignments change every two years, Games, GameParticipants, Players, PlayerSeasons for transfers and grade progression, StatLines, StatDefinitions so new sports do not require migrations, Coaches, Venues, OutOfStateTeams, DataSources for provenance on every record.

Every stat record carries its source and entry timestamp. When a coach disputes a number, you need to know where it came from.

Sport agnostic from day one. Phase one is football and basketball, boys and girls. Baseball and softball follow. There will eventually be twelve or more.

## Writing for readers

No em dashes in any sentence a reader sees. They read as machine-written, and
this site is asking coaches and parents to trust it with their kids' names and
numbers; prose that reads as generated undermines that before anybody reaches
the data. Write two sentences instead, or use a colon. The `—` glyph is still
correct in a table cell meaning "no value", because that is notation rather
than prose.

## Design direction

High information density, minimal chrome, generous tap targets, real typographic hierarchy. School colors as accents only, never as backgrounds. Dark mode from the start. No hero images, no carousels, no stock photos. The data is the design.

## Working style

Ask when a product decision is genuinely ambiguous. Do not ask permission to write code. Build the stat importer and coach entry flow first, because if coaches will not use them nothing else matters.

**Leave a waypoint.** Sessions get lost. Before finishing any meaningful chunk of work:

- update `docs/STATUS.md` if what-is-built or the infrastructure changed
- append an entry to `docs/worklog.md` saying what changed, why, what surprised you, and what comes next

Commit both with the work, not as an afterthought. A future session should be able to read those two files and resume without reconstructing anything from shell history or old transcripts.

## Related documents

- `docs/STATUS.md` — **current state: what is built, what is not, and the
  gotchas. Read this first, it is kept up to date.**
- `docs/kyboxscore-setup.md` — droplet provisioning, compose, CI/CD, backups
- `docs/ky-scoreboard-build-prompt.md` — the full product brief and phase one scope
- `docs/out-of-state-sources.md` — what each state association's terms allow,
  checked 8 September 2026, and why we type the records rather than fetch them
- `packages/db/schema.sql` — data model

Next.js version-specific rules, generated and re-added by `next dev`:

@AGENTS.md
