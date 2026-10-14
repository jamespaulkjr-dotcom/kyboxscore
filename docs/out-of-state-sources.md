# Out-of-state records: where they can come from

Checked 8 September 2026; Tennessee and Ohio re-checked 12 September 2026. **Re-check before relying on any of it**: a robots
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

**Ohio — OHSAA.** Permitted, and the data exists, but not until the fifth week
of the season. Re-checked 12 September 2026: `robots.txt` still blocks only
administrative directories, names no AI crawler, and sets no delay for `*`.

The records are in the **weekly Harbin computer ratings report**, which is a
PDF with explicit `Wins` and `Losses` columns, a `City`, a `High School Name`
and an `OHSAA School ID` that would make matching stable. It is published at

```
https://ohsaaweb.blob.core.windows.net/files/Sports/Football/<year>/<year>Week<N>Ratings.pdf
```

The PDF needs no library: its page streams are zlib-compressed text and the
table reads out with `zlib` and a regex, one word per cell.

**The name has changed twice, so probe before trusting it.** 2023 and earlier
used `<year>HarbinReportWeek<N>.pdf`; 2024 used `<YYYYMMDD>HarbinReport.pdf`;
2025 onwards uses `<year>Week<N>Ratings.pdf`. Established on 14 October 2026 by
sweeping every Tuesday of two seasons against the date pattern — 2024 returned
six reports, 2025 returned none — and then every week number of 2026 against
the new one, which returned Weeks 5 to 8 at about 473KB each. Keep a known-good
old URL as a control: `2024/20241001HarbinReport.pdf` still returns 200, which
is how a genuine 404 is told apart from a moved file.

**It is released weekly beginning in the fifth week of the season.** The
importer searches by week number from the highest down, so the newest report
wins, a missing week does not stop the search, and nothing depends on the
publication day being a Tuesday any more. `as_of` comes from the response's
`Last-Modified`, because the filename no longer carries a date.

**The cost of getting this wrong was two seasons of silence.** The importer was
written against the 2024 name and ran nightly for 32 consecutive nights in 2026
logging "no Harbin report published yet… nothing to do", which is exactly what
it is supposed to say for most of the year, so nothing ever surfaced it. Every
Ohio record in the table had come from Nathan by hand in early September. When
the URL was fixed, one run updated 19 Ohio opponents and moved 96 Kentucky
teams in True RPI, by as much as 13 places. A job whose healthy state is a
no-op needs a louder way to say "I have never once done anything".

Everything else Ohio that carries records is a third party rather than the
publishing association: OHSAA's own football hub links **MaxPreps** for polls
and schedules, which `CLAUDE.md` bans outright, and searches surface Joe
Eitel, Bruce Monnin and Fantastic50, none of which is a state association. So
Ohio is the Harbin report or it is manual entry.

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
