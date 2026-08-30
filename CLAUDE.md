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

Rules:

- margin of victory is never a factor
- all out of state teams get a flat .500 WP, as do in state home school teams playing a member school
- regular season games only
- a class factor rewards playing up, roughly 15% between classes, baseline 1.0
- football uses a different WP value assignment than other sports
- no RPI published for a team with missing scores
- recalculate hourly

Also compute **Shadow RPI**: identical except out of state opponents carry their real winning percentage. Display both side by side with the delta and a plain English explanation. Coaches near the state line have complained for years that the .500 assumption distorts their ranking. Nobody has ever shown them the number.

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

## Design direction

High information density, minimal chrome, generous tap targets, real typographic hierarchy. School colors as accents only, never as backgrounds. Dark mode from the start. No hero images, no carousels, no stock photos. The data is the design.

## Working style

Ask when a product decision is genuinely ambiguous. Do not ask permission to write code. Build the stat importer and coach entry flow first, because if coaches will not use them nothing else matters.

## Related documents

- `docs/STATUS.md` — **current state: what is built, what is not, and the
  gotchas. Read this first, it is kept up to date.**
- `docs/kyboxscore-setup.md` — droplet provisioning, compose, CI/CD, backups
- `docs/ky-scoreboard-build-prompt.md` — the full product brief and phase one scope
- `packages/db/schema.sql` — data model

Next.js version-specific rules, generated and re-added by `next dev`:

@AGENTS.md
