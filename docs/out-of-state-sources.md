# Out-of-state records: where they can come from

Checked 8 September 2026. **Re-check before relying on any of it**: a robots
file or a terms page can change without telling anybody, and the answer below
is only as good as the day it was read.

## Why this document exists

`CLAUDE.md` says out-of-state records come from "the publishing state
associations or manual entry". The named scraping ban covers three sites —
KHSAA, ArbiterLive, the Riherds archive — and does not extend to other states'
associations. That distinction got blurred in conversation more than once, so
it is written down here.

Source being permitted is not the same as method being permitted. Each
association decides for itself whether an automated client may read its site,
and they do not agree with each other.

## What Kentucky football actually needs

52 opponents, 61 games, seven states.

| State | Schools | Games vs Kentucky |
|---|---:|---:|
| Tennessee | 22 | 27 |
| Ohio | 12 | 13 |
| Indiana | 7 | 8 |
| Virginia | 4 | 6 |
| West Virginia | 4 | 4 |
| Missouri | 2 | 2 |
| Illinois | 1 | 1 |

## What each association says

**Tennessee — TSSAA.** Green, and the data is there. `tssaasports.com` is
TSSAA's own results site and publishes each school's schedule with scores and a
running record. Its `robots.txt` is two lines:

```
User-agent: *
Crawl-delay: 10
```

No `Disallow` at all, and a stated politeness rate. 22 schools at one request
per 10 seconds is under four minutes.

**Indiana — IHSAA.** No. Their `robots.txt` names us:

```
User-agent: ClaudeBot
Disallow: /
Content-Signal: search=yes,ai-train=no,use=reference
```

They disallow ClaudeBot along with GPTBot, CCBot, Amazonbot and others. Manual
reading by a person is a different thing entirely; an automated fetch is not.

**Virginia — VHSL.** No. Everything is closed except two named crawlers:

```
User-agent: *
Disallow: /
User-agent: RavenCrawler
Allow: /
User-agent: Googlebot
Allow: /
```

**Ohio — OHSAA.** Permitted but probably pointless. `robots.txt` blocks only
administrative directories, and no terms-of-use page was found. But OHSAA's own
football pages send readers to MaxPreps for polls, and no clean listing of
regular-season win-loss records was found on their site. Their weekly computer
ratings exist; whether they carry usable records was not established.

**West Virginia — WVSSAC.** Unknown. No `robots.txt` (404), no terms page
found. Silence is not permission; it is silence.

**Missouri — MSHSAA.** Unknown. The site did not respond to a plain request
from our droplet at all, which may itself be a filter on non-browser clients.
Two schools, so not worth pushing.

**Illinois — IHSA.** Green on permission: `Allow: /` for everyone, sitemap
published. One school.

## The recommendation

**Do not build a scraper.** Type them in.

Only Tennessee is both clearly permitted and known to hold the data, and that
is 22 schools. Entering all 52 by hand is one evening on
`/admin/out-of-state`, which takes a paste in whatever shape the numbers
arrive. A scraper for one state would be a permanent maintenance job and a
standing compliance question, to save re-typing 22 numbers once a week.

Revisit if this becomes three hundred schools across a dozen sports. Tennessee
is the one to revisit first, and the crawl delay they ask for is 10 seconds.
