-- Re-assert preseason classification from the season dates.
--
-- This lives in the seed rather than a migration on purpose. Migrations run
-- BEFORE the seed, so a one-shot migration classifies against whatever
-- starts_on happened to be at the time - and the very deploy that corrects a
-- season's dates would classify against the old ones. Football 2026 hit
-- exactly that: the date moved from 21 August to the 19th, and a real game on
-- the 20th would have been filed as preseason forever.
--
-- Running here, after 001_reference has set the dates, and being idempotent in
-- both directions, means correcting a season date is all anyone ever has to
-- do. The classification follows on the next deploy.
--
-- Scrimmages are never touched. A scrimmage is more specific than "before the
-- season opened" and is usually a human decision.

-- Before the season opens: counts for nothing.
UPDATE game g
SET stage = 'preseason', updated_at = now()
FROM sport_season ss
WHERE ss.id = g.sport_season_id
  AND g.local_date < ss.starts_on
  AND g.stage = 'regular_season';

-- On or after it: counts. This is the half a one-way migration cannot do, and
-- it is what makes a corrected season date repair itself.
UPDATE game g
SET stage = 'regular_season', updated_at = now()
FROM sport_season ss
WHERE ss.id = g.sport_season_id
  AND g.local_date >= ss.starts_on
  AND g.stage = 'preseason';
