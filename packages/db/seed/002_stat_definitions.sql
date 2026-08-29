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

-- ----------------------------------------------------------------- baseball
-- Keys mirror the MaxPreps export columns one for one (see
-- packages/parsers/src/mapping.ts) so an import is a lookup, not a guess.
--
-- Innings pitched are stored as OUTS, not as 6.2 or 6.667. The export splits
-- them across InningsPitched and PartialInningPitched precisely because 6.2
-- means six and two thirds, and that is not a decimal. Outs are exact
-- integers, ERA and WHIP divide correctly, and display converts back.
INSERT INTO stat_definition
  (sport_id, key, name, abbrev, scope, value_type, category, display_order,
   season_aggregation, is_derived, derivation, higher_is_better,
   leaderboard_eligible, qualifier)
SELECT sp.id, v.key, v.name, v.abbrev, v.scope::stat_scope, v.vtype::stat_value_type,
       v.category, v.ord, v.agg::aggregation, v.derived, v.derivation::jsonb,
       v.hib, v.lb, v.qual::jsonb
FROM sport sp, (VALUES
  ('ab',        'At Bats',            'AB',   'player','count','batting',   10,'sum',false,NULL,true, false,NULL),
  ('r',         'Runs',               'R',    'player','count','batting',   20,'sum',false,NULL,true, true, '{"min_games":10}'),
  ('h',         'Hits',               'H',    'player','count','batting',   30,'sum',false,NULL,true, true, '{"min_games":10}'),
  ('singles',   'Singles',            '1B',   'player','count','batting',   40,'sum',false,NULL,true, false,NULL),
  ('doubles',   'Doubles',            '2B',   'player','count','batting',   50,'sum',false,NULL,true, true, '{"min_games":10}'),
  ('triples',   'Triples',            '3B',   'player','count','batting',   60,'sum',false,NULL,true, true, '{"min_games":10}'),
  ('hr',        'Home Runs',          'HR',   'player','count','batting',   70,'sum',false,NULL,true, true, '{"min_games":10}'),
  ('rbi',       'Runs Batted In',     'RBI',  'player','count','batting',   80,'sum',false,NULL,true, true, '{"min_games":10}'),
  ('bb',        'Walks',              'BB',   'player','count','batting',   90,'sum',false,NULL,true, false,NULL),
  ('so',        'Strikeouts',         'SO',   'player','count','batting',  100,'sum',false,NULL,false,false,NULL),
  ('hbp',       'Hit By Pitch',       'HBP',  'player','count','batting',  110,'sum',false,NULL,true, false,NULL),
  ('sac_bunt',  'Sacrifice Bunts',    'SAC',  'player','count','batting',  120,'sum',false,NULL,true, false,NULL),
  ('sac_fly',   'Sacrifice Flies',    'SF',   'player','count','batting',  130,'sum',false,NULL,true, false,NULL),
  ('sb',        'Stolen Bases',       'SB',   'player','count','batting',  140,'sum',false,NULL,true, true, '{"min_games":10}'),
  ('sb_att',    'Stolen Base Att',    'SBA',  'player','count','batting',  150,'sum',false,NULL,true, false,NULL),
  ('roe',       'Reached On Error',   'ROE',  'player','count','batting',  160,'sum',false,NULL,true, false,NULL),
  ('fc',        'Fielders Choice',    'FC',   'player','count','batting',  170,'sum',false,NULL,false,false,NULL),
  ('avg',       'Batting Average',    'AVG',  'player','ratio','batting',  180,'derived',true,'{"op":"ratio","num":"h","den":"ab"}',true,true,'{"min_games":10,"min":{"key":"ab","per_game":2}}'),
  -- On base percentage: (H + BB + HBP) / (AB + BB + HBP + SF)
  ('obp',       'On Base Percentage', 'OBP',  'player','ratio','batting',  190,'derived',true,'{"op":"ratio","num":{"sum":["h","bb","hbp"]},"den":{"sum":["ab","bb","hbp","sac_fly"]}}',true,true,'{"min_games":10,"min":{"key":"ab","per_game":2}}'),
  -- Slugging: total bases / AB, where TB = 1B + 2*2B + 3*3B + 4*HR
  ('slg',       'Slugging',           'SLG',  'player','ratio','batting',  200,'derived',true,'{"op":"ratio","num":{"weighted":[["singles",1],["doubles",2],["triples",3],["hr",4]]},"den":"ab"}',true,true,'{"min_games":10,"min":{"key":"ab","per_game":2}}'),

  ('ip_outs',   'Outs Recorded',      'OUTS', 'player','count','pitching', 300,'sum',false,NULL,true, false,NULL),
  ('ip',        'Innings Pitched',    'IP',   'player','decimal','pitching',310,'derived',true,'{"op":"innings","key":"ip_outs"}',true,false,NULL),
  ('bf',        'Batters Faced',      'BF',   'player','count','pitching', 320,'sum',false,NULL,true, false,NULL),
  ('h_allowed', 'Hits Allowed',       'H',    'player','count','pitching', 330,'sum',false,NULL,false,false,NULL),
  ('r_allowed', 'Runs Allowed',       'R',    'player','count','pitching', 340,'sum',false,NULL,false,false,NULL),
  ('er',        'Earned Runs',        'ER',   'player','count','pitching', 350,'sum',false,NULL,false,false,NULL),
  ('bb_allowed','Walks Allowed',      'BB',   'player','count','pitching', 360,'sum',false,NULL,false,false,NULL),
  ('k',         'Strikeouts Pitched', 'K',    'player','count','pitching', 370,'sum',false,NULL,true, true, '{"min_games":5}'),
  ('hr_allowed','Home Runs Allowed',  'HR',   'player','count','pitching', 380,'sum',false,NULL,false,false,NULL),
  ('hbp_allowed','Batters Hit',       'HB',   'player','count','pitching', 390,'sum',false,NULL,false,false,NULL),
  ('wp',        'Wild Pitches',       'WP',   'player','count','pitching', 400,'sum',false,NULL,false,false,NULL),
  ('appearances','Appearances',       'APP',  'player','count','pitching', 410,'sum',false,NULL,true, false,NULL),
  ('pitches',   'Pitches Thrown',     'PC',   'player','count','pitching', 420,'sum',false,NULL,true, false,NULL),
  -- ERA = 9 * ER / (outs/3) = 27 * ER / outs. Lower is better.
  ('era',       'Earned Run Average', 'ERA',  'player','decimal','pitching',430,'derived',true,'{"op":"rate","num":"er","den":"ip_outs","scale":27}',false,true,'{"min":{"key":"ip_outs","per_game":3}}'),
  -- WHIP = (BB + H) / innings = 3 * (BB + H) / outs
  ('whip',      'Walks+Hits per IP',  'WHIP', 'player','decimal','pitching',440,'derived',true,'{"op":"rate","num":{"sum":["bb_allowed","h_allowed"]},"den":"ip_outs","scale":3}',false,true,'{"min":{"key":"ip_outs","per_game":3}}')
) AS v(key,name,abbrev,scope,vtype,category,ord,agg,derived,derivation,hib,lb,qual)
WHERE sp.slug = 'baseball'
ON CONFLICT (sport_id, key) DO UPDATE SET
  name = EXCLUDED.name, abbrev = EXCLUDED.abbrev, category = EXCLUDED.category,
  display_order = EXCLUDED.display_order, season_aggregation = EXCLUDED.season_aggregation,
  is_derived = EXCLUDED.is_derived, derivation = EXCLUDED.derivation,
  higher_is_better = EXCLUDED.higher_is_better,
  leaderboard_eligible = EXCLUDED.leaderboard_eligible, qualifier = EXCLUDED.qualifier;

-- Softball shares baseball's stat set exactly.
INSERT INTO stat_definition
  (sport_id, key, name, abbrev, scope, value_type, category, display_order,
   season_aggregation, is_derived, derivation, higher_is_better,
   leaderboard_eligible, qualifier)
SELECT sb.id, sd.key, sd.name, sd.abbrev, sd.scope, sd.value_type, sd.category,
       sd.display_order, sd.season_aggregation, sd.is_derived, sd.derivation,
       sd.higher_is_better, sd.leaderboard_eligible, sd.qualifier
FROM stat_definition sd
JOIN sport bb ON bb.id = sd.sport_id AND bb.slug = 'baseball'
CROSS JOIN sport sb
WHERE sb.slug = 'softball'
ON CONFLICT (sport_id, key) DO NOTHING;
