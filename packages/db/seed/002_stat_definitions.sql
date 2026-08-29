-- Stat definitions. Adding a sport is INSERTs here, never a migration.
--
-- is_derived stats are computed from other keys and are never written to
-- stat_value; they are produced in the rollups. `qualifier` gates leaderboard
-- eligibility so a 1-for-1 shooter does not top the field goal percentage
-- board.

-- --------------------------------------------------------------- basketball
INSERT INTO stat_definition
  (sport_id, key, name, abbrev, scope, value_type, category, display_order,
   season_aggregation, is_derived, derivation, higher_is_better,
   leaderboard_eligible, qualifier)
SELECT sp.id, v.key, v.name, v.abbrev, v.scope::stat_scope, v.vtype::stat_value_type,
       v.category, v.ord, v.agg::aggregation, v.derived, v.derivation::jsonb,
       v.hib, v.lb, v.qual::jsonb
FROM sport sp, (VALUES
  ('min',    'Minutes',              'MIN', 'player', 'decimal', 'general',  10, 'sum', false, NULL, true,  false, NULL),
  ('pts',    'Points',               'PTS', 'player', 'count',   'scoring',  20, 'sum', false, NULL, true,  true,  '{"min_games":8}'),
  ('fgm',    'Field Goals Made',     'FGM', 'player', 'count',   'shooting', 30, 'sum', false, NULL, true,  false, NULL),
  ('fga',    'Field Goals Attempted','FGA', 'player', 'count',   'shooting', 40, 'sum', false, NULL, false, false, NULL),
  ('fg_pct', 'Field Goal Pct',       'FG%', 'player', 'ratio',   'shooting', 50, 'derived', true, '{"op":"ratio","num":"fgm","den":"fga"}', true, true, '{"min_games":8,"min":{"key":"fga","per_game":5}}'),
  ('tpm',    'Three Pointers Made',  '3PM', 'player', 'count',   'shooting', 60, 'sum', false, NULL, true,  true,  '{"min_games":8}'),
  ('tpa',    'Three Pointers Att',   '3PA', 'player', 'count',   'shooting', 70, 'sum', false, NULL, false, false, NULL),
  ('tp_pct', 'Three Point Pct',      '3P%', 'player', 'ratio',   'shooting', 80, 'derived', true, '{"op":"ratio","num":"tpm","den":"tpa"}', true, true, '{"min_games":8,"min":{"key":"tpa","per_game":2}}'),
  ('ftm',    'Free Throws Made',     'FTM', 'player', 'count',   'shooting', 90, 'sum', false, NULL, true,  false, NULL),
  ('fta',    'Free Throws Attempted','FTA', 'player', 'count',   'shooting', 100,'sum', false, NULL, false, false, NULL),
  ('ft_pct', 'Free Throw Pct',       'FT%', 'player', 'ratio',   'shooting', 110,'derived', true, '{"op":"ratio","num":"ftm","den":"fta"}', true, true, '{"min_games":8,"min":{"key":"fta","per_game":2}}'),
  ('oreb',   'Offensive Rebounds',   'OR',  'player', 'count',   'rebounding',120,'sum', false, NULL, true, false, NULL),
  ('dreb',   'Defensive Rebounds',   'DR',  'player', 'count',   'rebounding',130,'sum', false, NULL, true, false, NULL),
  ('reb',    'Rebounds',             'REB', 'player', 'count',   'rebounding',140,'derived', true, '{"op":"sum","keys":["oreb","dreb"]}', true, true, '{"min_games":8}'),
  ('ast',    'Assists',              'AST', 'player', 'count',   'playmaking',150,'sum', false, NULL, true, true,  '{"min_games":8}'),
  ('stl',    'Steals',               'STL', 'player', 'count',   'defense',  160,'sum', false, NULL, true,  true,  '{"min_games":8}'),
  ('blk',    'Blocks',               'BLK', 'player', 'count',   'defense',  170,'sum', false, NULL, true,  true,  '{"min_games":8}'),
  ('tov',    'Turnovers',            'TO',  'player', 'count',   'playmaking',180,'sum',false, NULL, false, false, NULL),
  ('pf',     'Personal Fouls',       'PF',  'player', 'count',   'general',  190,'sum', false, NULL, false, false, NULL)
) AS v(key,name,abbrev,scope,vtype,category,ord,agg,derived,derivation,hib,lb,qual)
WHERE sp.slug = 'basketball'
ON CONFLICT (sport_id, key) DO UPDATE SET
  name = EXCLUDED.name, abbrev = EXCLUDED.abbrev, category = EXCLUDED.category,
  display_order = EXCLUDED.display_order, season_aggregation = EXCLUDED.season_aggregation,
  is_derived = EXCLUDED.is_derived, derivation = EXCLUDED.derivation,
  higher_is_better = EXCLUDED.higher_is_better,
  leaderboard_eligible = EXCLUDED.leaderboard_eligible, qualifier = EXCLUDED.qualifier;

-- ----------------------------------------------------------------- football
INSERT INTO stat_definition
  (sport_id, key, name, abbrev, scope, value_type, category, display_order,
   season_aggregation, is_derived, derivation, higher_is_better,
   leaderboard_eligible, qualifier)
SELECT sp.id, v.key, v.name, v.abbrev, v.scope::stat_scope, v.vtype::stat_value_type,
       v.category, v.ord, v.agg::aggregation, v.derived, v.derivation::jsonb,
       v.hib, v.lb, v.qual::jsonb
FROM sport sp, (VALUES
  ('pass_cmp','Completions',        'CMP',  'player','count','passing',   10,'sum',false,NULL,true, false,NULL),
  ('pass_att','Pass Attempts',      'ATT',  'player','count','passing',   20,'sum',false,NULL,false,false,NULL),
  ('cmp_pct', 'Completion Pct',     'CMP%', 'player','ratio','passing',   30,'derived',true,'{"op":"ratio","num":"pass_cmp","den":"pass_att"}',true,true,'{"min_games":5,"min":{"key":"pass_att","per_game":10}}'),
  ('pass_yds','Passing Yards',      'YDS',  'player','count','passing',   40,'sum',false,NULL,true, true, '{"min_games":5}'),
  ('pass_td', 'Passing TD',         'TD',   'player','count','passing',   50,'sum',false,NULL,true, true, '{"min_games":5}'),
  ('pass_int','Interceptions Thrown','INT', 'player','count','passing',   60,'sum',false,NULL,false,false,NULL),
  ('rush_att','Rush Attempts',      'CAR',  'player','count','rushing',   70,'sum',false,NULL,true, false,NULL),
  ('rush_yds','Rushing Yards',      'YDS',  'player','count','rushing',   80,'sum',false,NULL,true, true, '{"min_games":5}'),
  ('ypc',     'Yards Per Carry',    'AVG',  'player','decimal','rushing', 90,'derived',true,'{"op":"ratio","num":"rush_yds","den":"rush_att"}',true,true,'{"min_games":5,"min":{"key":"rush_att","per_game":8}}'),
  ('rush_td', 'Rushing TD',         'TD',   'player','count','rushing',  100,'sum',false,NULL,true, true, '{"min_games":5}'),
  ('rec',     'Receptions',         'REC',  'player','count','receiving',110,'sum',false,NULL,true, true, '{"min_games":5}'),
  ('rec_yds', 'Receiving Yards',    'YDS',  'player','count','receiving',120,'sum',false,NULL,true, true, '{"min_games":5}'),
  ('rec_td',  'Receiving TD',       'TD',   'player','count','receiving',130,'sum',false,NULL,true, true, '{"min_games":5}'),
  ('tkl_solo','Solo Tackles',       'SOLO', 'player','count','defense',  140,'sum',false,NULL,true, false,NULL),
  ('tkl_ast', 'Assisted Tackles',   'AST',  'player','count','defense',  150,'sum',false,NULL,true, false,NULL),
  ('tkl_tot', 'Total Tackles',      'TOT',  'player','decimal','defense',160,'derived',true,'{"op":"weighted","terms":[{"key":"tkl_solo","w":1},{"key":"tkl_ast","w":0.5}]}',true,true,'{"min_games":5}'),
  ('sacks',   'Sacks',              'SK',   'player','decimal','defense',170,'sum',false,NULL,true, true, '{"min_games":5}'),
  ('tfl',     'Tackles For Loss',   'TFL',  'player','decimal','defense',180,'sum',false,NULL,true, true, '{"min_games":5}'),
  ('def_int', 'Interceptions',      'INT',  'player','count','defense',  190,'sum',false,NULL,true, true, '{"min_games":5}'),
  ('ff',      'Forced Fumbles',     'FF',   'player','count','defense',  200,'sum',false,NULL,true, false,NULL),
  ('fr',      'Fumbles Recovered',  'FR',   'player','count','defense',  210,'sum',false,NULL,true, false,NULL),
  ('fg_made', 'Field Goals Made',   'FGM',  'player','count','kicking',  220,'sum',false,NULL,true, true, '{"min_games":5}'),
  ('fg_att',  'Field Goals Att',    'FGA',  'player','count','kicking',  230,'sum',false,NULL,false,false,NULL),
  ('xp_made', 'Extra Points Made',  'XPM',  'player','count','kicking',  240,'sum',false,NULL,true, false,NULL),
  ('xp_att',  'Extra Points Att',   'XPA',  'player','count','kicking',  250,'sum',false,NULL,false,false,NULL),
  ('punts',   'Punts',              'PUNT', 'player','count','kicking',  260,'sum',false,NULL,false,false,NULL),
  ('punt_yds','Punt Yards',         'YDS',  'player','count','kicking',  270,'sum',false,NULL,true, false,NULL)
) AS v(key,name,abbrev,scope,vtype,category,ord,agg,derived,derivation,hib,lb,qual)
WHERE sp.slug = 'football'
ON CONFLICT (sport_id, key) DO UPDATE SET
  name = EXCLUDED.name, abbrev = EXCLUDED.abbrev, category = EXCLUDED.category,
  display_order = EXCLUDED.display_order, season_aggregation = EXCLUDED.season_aggregation,
  is_derived = EXCLUDED.is_derived, derivation = EXCLUDED.derivation,
  higher_is_better = EXCLUDED.higher_is_better,
  leaderboard_eligible = EXCLUDED.leaderboard_eligible, qualifier = EXCLUDED.qualifier;
