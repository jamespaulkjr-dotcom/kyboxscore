-- Classify existing games by date against their own season's start.
--
-- NOTE: this runs before the seed, so it classifies against whatever the
-- season dates were at the time. `seed/009_classify_stages.sql` re-asserts the
-- classification afterwards, in both directions, and is the one that actually
-- keeps this correct. Left here so a database migrated but never seeded is not
-- left with preseason games counting.
--
-- Driven by sport_season.starts_on rather than a literal date, so it stays
-- correct for every sport and every future season. A game already marked as a
-- scrimmage keeps that: someone decided it deliberately, and a scrimmage is
-- more specific than "before the season started".

UPDATE game g
SET stage = 'preseason', updated_at = now()
FROM sport_season ss
WHERE ss.id = g.sport_season_id
  AND g.local_date < ss.starts_on
  AND g.stage = 'regular_season';
