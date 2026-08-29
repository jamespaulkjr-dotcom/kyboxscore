-- Development fixtures. SYNTHETIC. Never loaded in production - seed.mjs
-- refuses. Schools, cities and time zones are real; every player, game, score
-- and stat line below is invented for layout work.
--
-- Everything here is attributed to the `dev-fixture` data source, so the whole
-- fixture set is removable with one delete.

INSERT INTO data_source (slug, name, kind) VALUES
  ('dev-fixture', 'Development fixture (synthetic)', 'staff_entry')
ON CONFLICT (slug) DO NOTHING;

-- ------------------------------------------------------------------ schools
-- Kentucky's western third keeps Central time. Getting this wrong puts a
-- 7:30 CT tip on the wrong night's scoreboard.
INSERT INTO school (slug, name, short_name, mascot, city, county, time_zone, data_source_id)
SELECT v.slug, v.name, v.short_name, v.mascot, v.city, v.county, v.tz, ds.id
FROM (VALUES
  ('male',                 'Male',                    'Male',        'Bulldogs',   'Louisville',   'Jefferson', 'America/New_York'),
  ('dupont-manual',        'duPont Manual',           'Manual',      'Crimsons',   'Louisville',   'Jefferson', 'America/New_York'),
  ('trinity-louisville',   'Trinity',                 'Trinity',     'Shamrocks',  'Louisville',   'Jefferson', 'America/New_York'),
  ('st-xavier',            'St. Xavier',              'St. X',       'Tigers',     'Louisville',   'Jefferson', 'America/New_York'),
  ('covington-catholic',   'Covington Catholic',      'CovCath',     'Colonels',   'Park Hills',   'Kenton',    'America/New_York'),
  ('highlands',            'Highlands',               'Highlands',   'Bluebirds',  'Fort Thomas',  'Campbell',  'America/New_York'),
  ('paul-laurence-dunbar', 'Paul Laurence Dunbar',    'Dunbar',      'Bulldogs',   'Lexington',    'Fayette',   'America/New_York'),
  ('frederick-douglass',   'Frederick Douglass',      'Douglass',    'Broncos',    'Lexington',    'Fayette',   'America/New_York'),
  ('lexington-catholic',   'Lexington Catholic',      'Lex Cath',    'Knights',    'Lexington',    'Fayette',   'America/New_York'),
  ('john-hardin',          'John Hardin',             'John Hardin', 'Bulldogs',   'Elizabethtown','Hardin',    'America/New_York'),
  ('corbin',               'Corbin',                  'Corbin',      'Redhounds',  'Corbin',       'Whitley',   'America/New_York'),
  ('somerset',             'Somerset',                'Somerset',    'Briar Jumpers','Somerset',   'Pulaski',   'America/New_York'),
  ('ashland-blazer',       'Ashland Blazer',          'Ashland',     'Tomcats',    'Ashland',      'Boyd',      'America/New_York'),
  ('scott-county',         'Scott County',            'Scott Co.',   'Cardinals',  'Georgetown',   'Scott',     'America/New_York'),
  ('bowling-green',        'Bowling Green',           'Bowling Green','Purples',   'Bowling Green','Warren',    'America/Chicago'),
  ('south-warren',         'South Warren',            'South Warren','Spartans',   'Bowling Green','Warren',    'America/Chicago'),
  ('owensboro',            'Owensboro',               'Owensboro',   'Red Devils', 'Owensboro',    'Daviess',   'America/Chicago'),
  ('madisonville-north-hopkins','Madisonville-North Hopkins','Madisonville','Maroons','Madisonville','Hopkins', 'America/Chicago'),
  ('paducah-tilghman',     'Paducah Tilghman',        'Tilghman',    'Blue Tornado','Paducah',     'McCracken', 'America/Chicago'),
  ('marshall-county',      'Marshall County',         'Marshall Co.','Marshals',   'Benton',       'Marshall',  'America/Chicago'),
  ('murray',               'Murray',                  'Murray',      'Tigers',     'Murray',       'Calloway',  'America/Chicago')
) AS v(slug,name,short_name,mascot,city,county,tz)
CROSS JOIN data_source ds
WHERE ds.slug = 'dev-fixture'
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, city = EXCLUDED.city, time_zone = EXCLUDED.time_zone;

-- ------------------------------------------------------------------- teams
INSERT INTO team (school_id, sport_id, gender, level)
SELECT s.id, sp.id, 'boys', 'varsity'
FROM school s CROSS JOIN sport sp
WHERE sp.slug = 'basketball'
ON CONFLICT (school_id, sport_id, gender, level) DO NOTHING;

-- Spread the fixture schools across districts so the "group by region"
-- scoreboard toggle has something to group on.
WITH ranked AS (
  SELECT t.id AS team_id, ss.id AS sport_season_id, sp.id AS sport_id,
         (row_number() OVER (ORDER BY s.slug))::int AS rn
  FROM team t
  JOIN school s ON s.id = t.school_id
  JOIN sport sp ON sp.id = t.sport_id AND sp.slug = 'basketball'
  JOIN sport_season ss ON ss.sport_id = sp.id AND ss.is_current
)
INSERT INTO team_season (team_id, sport_season_id, alignment_id)
SELECT r.team_id, r.sport_season_id, a.id
FROM ranked r
JOIN alignment a
  ON a.sport_id = r.sport_id AND a.gender = 'boys' AND a.kind = 'district'
 AND a.ordinal = ((r.rn - 1) % 64) + 1
ON CONFLICT (team_id, sport_season_id) DO NOTHING;

-- ------------------------------------------------------------------ rosters
-- Slug carries the team_season id (ts<id>-<n>-...) so the roster insert can
-- key off it deterministically on re-run.
INSERT INTO player (slug, first_name, last_name, data_source_id)
SELECT
  'ts' || ts.id || '-' || n.i || '-' || lower(fn.n) || '-' || lower(ln.n),
  fn.n, ln.n, ds.id
FROM team_season ts
CROSS JOIN generate_series(1, 10) AS n(i)
CROSS JOIN data_source ds
CROSS JOIN LATERAL (SELECT (ARRAY['Jalen','Cooper','Marcus','Eli','Tyrese','Brady','Isaiah','Landon','Devin','Carter',
                                  'Aidan','Malik','Grant','Xavier','Trey','Owen','Damon','Reid','Kaleb','Bryce'])
                           [((ts.id * 7 + n.i * 3) % 20) + 1] AS n) fn
CROSS JOIN LATERAL (SELECT (ARRAY['Whitaker','Combs','Stivers','Napier','Caudill','Hensley','Yeager','Bledsoe','Sizemore','Ratliff',
                                  'Gilliam','Tackett','Prather','Hurst','Slone','Riddle','Vance','Stinnett','Coomer','Puckett'])
                           [((ts.id * 11 + n.i * 5) % 20) + 1] AS n) ln
WHERE ds.slug = 'dev-fixture'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO player_season (player_id, team_season_id, jersey, grade, positions, data_source_id)
SELECT p.id,
       (substring(p.slug from '^ts([0-9]+)-'))::bigint,
       (ARRAY['0','00','1','2','3','4','5','10','11','12','14','15','20','21','22','23','24','30','32','34'])
         [((p.id * 3) % 20) + 1],
       9 + ((p.id * 5) % 4),
       ARRAY[(ARRAY['G','G','F','F','C'])[((p.id * 7) % 5) + 1]],
       ds.id
FROM player p
CROSS JOIN data_source ds
WHERE ds.slug = 'dev-fixture'
  AND p.slug ~ '^ts[0-9]+-'
ON CONFLICT (team_season_id, player_id) DO NOTHING;
