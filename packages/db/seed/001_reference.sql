-- Reference data: structural facts that are not claims about any school.
-- Idempotent - safe to run on every deploy.

-- ---------------------------------------------------------------- sources
INSERT INTO data_source (slug, name, kind, vendor) VALUES
  ('coach-upload',  'Coach or AD file upload',   'coach_submission', NULL),
  ('coach-entry',   'Coach manual box score',    'coach_submission', NULL),
  ('staff-entry',   'kyboxscore staff entry',    'staff_entry',      NULL),
  ('public-record', 'Public record / state association', 'public_record', NULL),
  ('arbiter-api',   'Arbiter Partner API (not yet contracted)', 'licensed_api', 'arbiter')
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, kind = EXCLUDED.kind;

-- Arbiter is the adapter seam, not a live source. Keep it inactive until a
-- signed agreement exists.
UPDATE data_source SET is_active = false WHERE slug = 'arbiter-api';

-- ---------------------------------------------------------------- sports
-- The full KHSAA offering, grouped as KHSAA groups it. Only team sports carry
-- a scoring unit, periods and an RPI; the others are NULL rather than filled
-- with a plausible lie.
--
-- PROVISIONAL, needs confirming before any real data lands:
--   * field hockey and lacrosse period structure (marked below)
--   * "Competitive Cheer" is our reading of a source that said only
--     "Competitive" - confirm the official name before it becomes a URL
INSERT INTO sport (slug, name, category, scoring_unit, period_noun,
                   regulation_periods, rpi_profile, display_order) VALUES
  -- team: head-to-head, one score per side
  ('football',        'Football',        'team', 'points', 'quarter', 4, 'football', 10),
  ('basketball',      'Basketball',      'team', 'points', 'quarter', 4, 'standard', 20),
  ('baseball',        'Baseball',        'team', 'runs',   'inning',  7, 'standard', 30),
  ('softball',        'Softball',        'team', 'runs',   'inning',  7, 'standard', 40),
  ('soccer',          'Soccer',          'team', 'goals',  'half',    2, 'standard', 50),
  ('volleyball',      'Volleyball',      'team', 'sets',   'set',     3, 'standard', 60),
  ('field-hockey',    'Field Hockey',    'team', 'goals',  'half',    2, 'standard', 70),
  ('lacrosse',        'Lacrosse',        'team', 'goals',  'quarter', 4, 'standard', 80),

  -- individual: meets and matches, placings and times
  -- NOTE: tennis and wrestling also produce a team result in a dual match.
  -- That needs a dual-meet scoring model we have not built; until then they
  -- are modelled as KHSAA groups them.
  ('cross-country',      'Cross Country',      'individual', NULL, NULL, NULL, 'none', 100),
  ('golf',               'Golf',               'individual', NULL, NULL, NULL, 'none', 110),
  ('swimming-and-diving','Swimming & Diving',  'individual', NULL, NULL, NULL, 'none', 120),
  ('tennis',             'Tennis',             'individual', NULL, NULL, NULL, 'none', 130),
  ('track-and-field',    'Track & Field',      'individual', NULL, NULL, NULL, 'none', 140),
  ('wrestling',          'Wrestling',          'individual', NULL, NULL, NULL, 'none', 150),

  -- sport activities: judged or separately scored events
  ('archery',           'Archery',            'activity', NULL, NULL, NULL, 'none', 200),
  ('bass-fishing',      'Bass Fishing',       'activity', NULL, NULL, NULL, 'none', 210),
  ('bowling',           'Bowling',            'activity', NULL, NULL, NULL, 'none', 220),
  ('competitive-cheer', 'Competitive Cheer',  'activity', NULL, NULL, NULL, 'none', 230),
  ('dance',             'Dance',              'activity', NULL, NULL, NULL, 'none', 240),
  ('esports',           'Esports',            'activity', NULL, NULL, NULL, 'none', 250)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      category = EXCLUDED.category,
      scoring_unit = EXCLUDED.scoring_unit,
      period_noun = EXCLUDED.period_noun,
      regulation_periods = EXCLUDED.regulation_periods,
      rpi_profile = EXCLUDED.rpi_profile,
      display_order = EXCLUDED.display_order;

-- Every one of these is part of the offering. Whether a sport is browsable is
-- a different question, answered by whether it has a current sport_season -
-- which needs real KHSAA calendar dates we do not have yet.
UPDATE sport SET is_active = true;

-- ---------------------------------------------------------------- seasons
INSERT INTO season (label, start_year) VALUES ('2026-27', 2026)
ON CONFLICT (start_year) DO NOTHING;

-- url_year is the year that appears in URLs and is NOT derivable from the
-- academic year: football 2026 is played in the fall of 2026-27, while
-- basketball for that same academic year is called 2027.
INSERT INTO sport_season (sport_id, season_id, url_year, starts_on, ends_on, regular_season_ends_on, is_current)
SELECT sp.id, se.id, v.url_year, v.starts_on, v.ends_on, v.reg_ends, true
FROM (VALUES
  ('football',   2026, DATE '2026-08-21', DATE '2026-12-05', DATE '2026-10-31'),
  ('basketball', 2027, DATE '2026-11-09', DATE '2027-03-21', DATE '2027-02-21'),
  -- PROVISIONAL: these baseball dates are approximate and have not been
  -- checked against the published KHSAA calendar. They exist so the importer
  -- has a season to write into. Correct them before any real data lands.
  ('baseball',   2027, DATE '2027-03-01', DATE '2027-06-12', DATE '2027-05-22')
) AS v(sport_slug, url_year, starts_on, ends_on, reg_ends)
JOIN sport sp ON sp.slug = v.sport_slug
JOIN season se ON se.start_year = 2026
ON CONFLICT (sport_id, season_id) DO UPDATE
  SET url_year = EXCLUDED.url_year,
      starts_on = EXCLUDED.starts_on,
      ends_on = EXCLUDED.ends_on,
      regular_season_ends_on = EXCLUDED.regular_season_ends_on;

-- ------------------------------------------------------------- alignments
-- KHSAA structure only. Which school sits in which district is a factual
-- claim about a school and is NOT seeded here - it arrives through the
-- permitted channels like any other record.
--
-- Basketball: 16 regions, 4 districts each (64), boys and girls.
-- Football: 6 classes, 4 districts each, boys.
-- Effective from the start of the 2026-28 alignment cycle.

INSERT INTO alignment (sport_id, gender, kind, name, slug, ordinal, effective_from)
SELECT sp.id, g.gender, 'region',
       'Region ' || r, 'region-' || r, r, DATE '2026-07-01'
FROM sport sp
CROSS JOIN generate_series(1, 16) AS r
CROSS JOIN (VALUES ('boys'::gender), ('girls'::gender)) AS g(gender)
WHERE sp.slug = 'basketball'
ON CONFLICT (sport_id, gender, kind, slug, effective_from) DO NOTHING;

INSERT INTO alignment (sport_id, gender, kind, name, slug, ordinal, parent_id, effective_from)
SELECT sp.id, g.gender, 'district',
       'District ' || d, 'district-' || d, d, parent.id, DATE '2026-07-01'
FROM sport sp
CROSS JOIN generate_series(1, 64) AS d
CROSS JOIN (VALUES ('boys'::gender), ('girls'::gender)) AS g(gender)
JOIN alignment parent
  ON parent.sport_id = sp.id
 AND parent.gender = g.gender
 AND parent.kind = 'region'
 AND parent.ordinal = ((d - 1) / 4) + 1
WHERE sp.slug = 'basketball'
ON CONFLICT (sport_id, gender, kind, slug, effective_from) DO NOTHING;

INSERT INTO alignment (sport_id, gender, kind, name, slug, ordinal, effective_from)
SELECT sp.id, 'boys', 'classification',
       c || 'A', 'class-' || c || 'a', c, DATE '2026-07-01'
FROM sport sp
CROSS JOIN generate_series(1, 6) AS c
WHERE sp.slug = 'football'
ON CONFLICT (sport_id, gender, kind, slug, effective_from) DO NOTHING;

INSERT INTO alignment (sport_id, gender, kind, name, slug, ordinal, parent_id, effective_from)
SELECT sp.id, 'boys', 'district',
       cls.name || ' District ' || d, 'class-' || cls.ordinal || 'a-district-' || d,
       d, cls.id, DATE '2026-07-01'
FROM sport sp
JOIN alignment cls
  ON cls.sport_id = sp.id AND cls.kind = 'classification'
CROSS JOIN generate_series(1, 4) AS d
WHERE sp.slug = 'football'
ON CONFLICT (sport_id, gender, kind, slug, effective_from) DO NOTHING;
