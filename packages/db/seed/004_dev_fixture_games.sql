-- Development fixture games and box scores. SYNTHETIC.
-- Dates sit inside the seeded basketball season rather than near today, so the
-- scoreboard's "latest slate" behaviour is exercised in the offseason.

INSERT INTO venue (slug, name, city, state, time_zone)
SELECT 'gym-' || s.slug, s.name || ' Gymnasium', s.city, 'KY', s.time_zone
FROM school s
WHERE s.data_source_id = (SELECT id FROM data_source WHERE slug = 'dev-fixture')
ON CONFLICT (slug) DO NOTHING;

UPDATE school s SET home_venue_id = v.id
FROM venue v WHERE v.slug = 'gym-' || s.slug AND s.home_venue_id IS NULL;

-- ------------------------------------------------------------------- games
WITH ranked AS (
  SELECT ts.team_id, ts.sport_season_id,
         (row_number() OVER (ORDER BY sc.slug))::int AS rn
  FROM team_season ts
  JOIN team t ON t.id = ts.team_id
  JOIN school sc ON sc.id = t.school_id
  JOIN sport_season ss ON ss.id = ts.sport_season_id
  JOIN sport sp ON sp.id = ss.sport_id AND sp.slug = 'basketball'
),
slate AS (
  SELECT * FROM (VALUES
    (DATE '2026-12-04', 'final'::game_status,       0),
    (DATE '2026-12-05', 'final'::game_status,       1),
    (DATE '2026-12-09', 'in_progress'::game_status, 2)
  ) AS v(local_date, status, rotation)
),
pairs AS (
  -- rotate the pairing each date so teams do not replay the same opponent
  SELECT sl.local_date, sl.status,
         h.team_id AS home_team_id, a.team_id AS away_team_id,
         h.sport_season_id, h.rn AS slot
  FROM slate sl
  JOIN ranked h ON h.rn % 2 = 1
  JOIN ranked a ON a.rn = ((h.rn - 1 + 2 * sl.rotation + 1) % 20) + 1
  WHERE h.rn <= 20 AND a.rn <> h.rn
)
INSERT INTO game (sport_season_id, short_code, local_date, status, stage,
                  periods_played, box_score_status, data_source_id)
SELECT p.sport_season_id,
       'g' || to_char(p.local_date, 'MMDD') || lpad(p.slot::text, 2, '0'),
       p.local_date,
       -- last slate: half the games still upcoming, half in progress
       CASE WHEN p.status = 'in_progress' AND p.slot % 4 = 1 THEN 'scheduled'::game_status
            ELSE p.status END,
       'regular_season',
       CASE WHEN p.status = 'final' THEN 4 ELSE NULL END,
       CASE WHEN p.status = 'final' THEN 'complete' ELSE 'none' END,
       ds.id
FROM pairs p
CROSS JOIN data_source ds
WHERE ds.slug = 'dev-fixture'
ON CONFLICT (short_code) DO NOTHING;

-- Participants must be inserted as a pair; the deferred trigger checks the
-- count at commit, so both sides land in this one statement.
WITH ranked AS (
  SELECT ts.team_id, (row_number() OVER (ORDER BY sc.slug))::int AS rn
  FROM team_season ts
  JOIN team t ON t.id = ts.team_id
  JOIN school sc ON sc.id = t.school_id
  JOIN sport_season ss ON ss.id = ts.sport_season_id
  JOIN sport sp ON sp.id = ss.sport_id AND sp.slug = 'basketball'
),
g AS (
  SELECT gm.id, gm.local_date,
         (substring(gm.short_code from 'g[0-9]{4}([0-9]{2})'))::int AS slot,
         CASE gm.local_date WHEN DATE '2026-12-04' THEN 0
                            WHEN DATE '2026-12-05' THEN 1 ELSE 2 END AS rotation
  FROM game gm
  WHERE gm.short_code LIKE 'g12%'
    AND NOT EXISTS (SELECT 1 FROM game_participant p WHERE p.game_id = gm.id)
)
INSERT INTO game_participant (game_id, team_id, role)
SELECT g.id, h.team_id, 'home'::participant_role FROM g JOIN ranked h ON h.rn = g.slot
UNION ALL
SELECT g.id, a.team_id, 'away'::participant_role
FROM g JOIN ranked a ON a.rn = ((g.slot - 1 + 2 * g.rotation + 1) % 20) + 1;
