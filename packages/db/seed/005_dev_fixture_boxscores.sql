-- Development fixture box scores. SYNTHETIC.
-- Numbers are generated deterministically from (player id, game id) so a
-- re-seed reproduces the same book, and are constructed to satisfy the
-- schema's shooting constraints (fgm<=fga, tpm<=least(tpa,fgm), ftm<=fta).

-- --------------------------------------------------------------- stat lines
INSERT INTO stat_line (game_id, game_participant_id, scope, player_id, jersey,
                       started, data_source_id)
SELECT gp.game_id, gp.id, 'player', ps.player_id, ps.jersey,
       row_number() OVER (PARTITION BY gp.id ORDER BY ps.id) <= 5,
       ds.id
FROM game g
JOIN game_participant gp ON gp.game_id = g.id
JOIN team_season ts ON ts.team_id = gp.team_id
JOIN player_season ps ON ps.team_season_id = ts.id
CROSS JOIN data_source ds
WHERE g.status = 'final' AND ds.slug = 'dev-fixture'
  AND NOT EXISTS (SELECT 1 FROM stat_line sl
                  WHERE sl.game_id = g.id AND sl.player_id = ps.player_id);

-- -------------------------------------------------------------- stat values
WITH line AS (
  SELECT sl.id AS stat_line_id, sl.game_id, sl.player_id,
         ((sl.player_id * 31 + sl.game_id * 17) % 97) AS h
  FROM stat_line sl
  WHERE NOT EXISTS (SELECT 1 FROM stat_value sv WHERE sv.stat_line_id = sl.id)
),
calc AS (
  SELECT stat_line_id, h,
         (2 + (h % 13))                                              AS fga,
         floor((2 + (h % 13)) * (25 + (h % 35)) / 100.0)::int         AS fgm,
         least(h % 6, 2 + (h % 13))                                   AS tpa
  FROM line
),
calc2 AS (
  SELECT stat_line_id, h, fga, fgm, tpa,
         least(floor(tpa * (h % 50) / 100.0)::int, fgm)               AS tpm,
         (h % 6)                                                      AS fta,
         floor((h % 6) * (50 + h % 50) / 100.0)::int                  AS ftm
  FROM calc
),
final AS (
  SELECT stat_line_id, fga, fgm, tpa, tpm, fta, ftm,
         (2 * (fgm - tpm) + 3 * tpm + ftm)                            AS pts,
         (h % 4) AS oreb, (h % 7) AS dreb, (h % 6) AS ast,
         (h % 3) AS stl, (h % 2) AS blk, (h % 4) AS tov, (h % 5) AS pf,
         (8 + h % 24) AS min
  FROM calc2
)
INSERT INTO stat_value (stat_line_id, stat_definition_id, value)
SELECT f.stat_line_id, sd.id, v.value
FROM final f
CROSS JOIN LATERAL (VALUES
  ('fga', f.fga), ('fgm', f.fgm), ('tpa', f.tpa), ('tpm', f.tpm),
  ('fta', f.fta), ('ftm', f.ftm), ('pts', f.pts), ('oreb', f.oreb),
  ('dreb', f.dreb), ('ast', f.ast), ('stl', f.stl), ('blk', f.blk),
  ('tov', f.tov), ('pf', f.pf), ('min', f.min)
) AS v(key, value)
JOIN sport sp ON sp.slug = 'basketball'
JOIN stat_definition sd ON sd.sport_id = sp.id AND sd.key = v.key
ON CONFLICT (stat_line_id, stat_definition_id) DO NOTHING;

-- ------------------------------------------------- scores from the box score
UPDATE game_participant gp
SET score = agg.total
FROM (
  SELECT sl.game_participant_id, sum(sv.value)::int AS total
  FROM stat_line sl
  JOIN stat_value sv ON sv.stat_line_id = sl.id
  JOIN stat_definition sd ON sd.id = sv.stat_definition_id AND sd.key = 'pts'
  GROUP BY sl.game_participant_id
) agg
WHERE agg.game_participant_id = gp.id AND gp.score IS NULL;

-- In progress games have a partial score but no book yet.
UPDATE game_participant gp
SET score = 28 + ((gp.id * 13) % 22)
FROM game g
WHERE g.id = gp.game_id AND g.status = 'in_progress' AND gp.score IS NULL;

-- ------------------------------------------------------------- line scores
INSERT INTO game_period_score (game_participant_id, period_number, score)
SELECT gp.id, q.n,
       CASE WHEN q.n < 4 THEN gp.score / 4
            ELSE gp.score - 3 * (gp.score / 4) END
FROM game_participant gp
JOIN game g ON g.id = gp.game_id
CROSS JOIN generate_series(1, 4) AS q(n)
WHERE g.status = 'final' AND gp.score IS NOT NULL
ON CONFLICT (game_participant_id, period_number) DO NOTHING;

-- ---------------------------------------------------------------- W-L record
INSERT INTO team_season_record (team_season_id, wins, losses, ties)
SELECT ts.id,
       count(*) FILTER (WHERE me.score > opp.score),
       count(*) FILTER (WHERE me.score < opp.score),
       count(*) FILTER (WHERE me.score = opp.score)
FROM team_season ts
JOIN game_participant me ON me.team_id = ts.team_id
JOIN game g ON g.id = me.game_id AND g.status = 'final'
             AND g.sport_season_id = ts.sport_season_id
JOIN game_participant opp ON opp.game_id = g.id AND opp.id <> me.id
GROUP BY ts.id
ON CONFLICT (team_season_id) DO UPDATE
  SET wins = EXCLUDED.wins, losses = EXCLUDED.losses, ties = EXCLUDED.ties,
      computed_at = now();

-- ------------------------------------------------------------ season rollups
-- Summable stats first, then the derived ones computed from those sums. This
-- is the read model behind team pages, player pages and leaderboards.
INSERT INTO player_season_stat
  (player_season_id, stat_definition_id, value, games_played, sport_season_id, alignment_id)
SELECT ps.id, sd.id, sum(sv.value), count(DISTINCT sl.game_id)::int,
       ts.sport_season_id, ts.alignment_id
FROM stat_line sl
JOIN stat_value sv ON sv.stat_line_id = sl.id
JOIN stat_definition sd ON sd.id = sv.stat_definition_id AND sd.season_aggregation = 'sum'
JOIN game g ON g.id = sl.game_id
JOIN team_season ts ON ts.sport_season_id = g.sport_season_id
JOIN player_season ps ON ps.team_season_id = ts.id AND ps.player_id = sl.player_id
GROUP BY ps.id, sd.id, ts.sport_season_id, ts.alignment_id
ON CONFLICT (player_season_id, stat_definition_id) DO UPDATE
  SET value = EXCLUDED.value, games_played = EXCLUDED.games_played,
      computed_at = now();

INSERT INTO player_season_stat
  (player_season_id, stat_definition_id, value, games_played, sport_season_id, alignment_id)
SELECT base.player_season_id, sd.id,
       CASE sd.key
         WHEN 'reb'    THEN base.oreb + base.dreb
         WHEN 'fg_pct' THEN CASE WHEN base.fga > 0 THEN round(base.fgm / base.fga, 3) ELSE 0 END
         WHEN 'tp_pct' THEN CASE WHEN base.tpa > 0 THEN round(base.tpm / base.tpa, 3) ELSE 0 END
         WHEN 'ft_pct' THEN CASE WHEN base.fta > 0 THEN round(base.ftm / base.fta, 3) ELSE 0 END
       END,
       base.games_played, base.sport_season_id, base.alignment_id
FROM (
  SELECT pss.player_season_id, max(pss.games_played) AS games_played,
         max(pss.sport_season_id) AS sport_season_id, max(pss.alignment_id) AS alignment_id,
         sum(pss.value) FILTER (WHERE sd.key = 'oreb') AS oreb,
         sum(pss.value) FILTER (WHERE sd.key = 'dreb') AS dreb,
         sum(pss.value) FILTER (WHERE sd.key = 'fgm')  AS fgm,
         sum(pss.value) FILTER (WHERE sd.key = 'fga')  AS fga,
         sum(pss.value) FILTER (WHERE sd.key = 'tpm')  AS tpm,
         sum(pss.value) FILTER (WHERE sd.key = 'tpa')  AS tpa,
         sum(pss.value) FILTER (WHERE sd.key = 'ftm')  AS ftm,
         sum(pss.value) FILTER (WHERE sd.key = 'fta')  AS fta
  FROM player_season_stat pss
  JOIN stat_definition sd ON sd.id = pss.stat_definition_id
  GROUP BY pss.player_season_id
) base
JOIN sport sp ON sp.slug = 'basketball'
JOIN stat_definition sd ON sd.sport_id = sp.id AND sd.key IN ('reb','fg_pct','tp_pct','ft_pct')
ON CONFLICT (player_season_id, stat_definition_id) DO UPDATE
  SET value = EXCLUDED.value, computed_at = now();

-- The search index is a materialized view; it is empty until refreshed.
-- The search index refresh now happens unconditionally at the end of
-- seed.mjs, so every environment gets it, not just the one with fixtures.
