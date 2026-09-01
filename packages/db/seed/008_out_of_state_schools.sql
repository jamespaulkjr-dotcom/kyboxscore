-- Out-of-state opponents.
--
-- Kentucky teams play these schools, so the games are real and belong in the
-- record. Without them a Kentucky team's win-loss is simply short.
--
-- state is 'XX', not a guess at the real one. The column is never displayed;
-- it is used only as "is this Kentucky or not", which is exactly what RPI
-- needs - every out-of-state opponent is pinned to a flat .500 under the
-- official formula regardless of which state it is in. Inventing fifty-one
-- state codes from memory would put wrong facts in a record book to populate
-- a field nobody reads. Correct them if a source ever gives them.
--
-- is_khsaa_member is false, so these are never ranked in Kentucky standings.
-- Names are as the schedule export wrote them, minus trailing export
-- artefacts like " - *". short_name drops the institutional suffix the same
-- way Kentucky schools do, so a scoreboard reads "Ironton", not "Ironton High
-- School" beside "Somerset".

INSERT INTO school (slug, name, short_name, state, is_khsaa_member, data_source_id)
SELECT v.slug, v.name, v.short_name, 'XX', false, ds.id
FROM (VALUES
  ('aiken-and-junior', 'Aiken High School & Junior', 'Aiken'),
  ('archbishop-mcnicholas', 'Archbishop McNicholas', 'Archbishop McNicholas'),
  ('baylor-school', 'Baylor School', 'Baylor School'),
  ('brighton', 'Brighton High School', 'Brighton'),
  ('castlewood', 'Castlewood', 'Castlewood'),
  ('cathedral', 'Cathedral', 'Cathedral'),
  ('christian-brothers-college', 'Christian Brothers College', 'Christian Brothers College'),
  ('clarksville-academy', 'Clarksville Academy', 'Clarksville Academy'),
  ('clermont-northeastern', 'Clermont Northeastern', 'Clermont Northeastern'),
  ('cloudland', 'Cloudland', 'Cloudland'),
  ('elder', 'Elder', 'Elder'),
  ('evansville-fj-reitz', 'Evansville FJ Reitz', 'Evansville FJ Reitz'),
  ('gibson-southern', 'Gibson Southern', 'Gibson Southern'),
  ('gleason', 'Gleason', 'Gleason'),
  ('greenfield', 'Greenfield', 'Greenfield'),
  ('huntington-expression-prep', 'HUNTINGTON EXPRESSION PREP', 'HUNTINGTON EXPRESSION PREP'),
  ('heritage-hills', 'Heritage Hills', 'Heritage Hills'),
  ('huntington', 'Huntington', 'Huntington'),
  ('indian-hill', 'Indian Hill', 'Indian Hill'),
  ('ironton', 'Ironton', 'Ironton'),
  ('jackson', 'Jackson', 'Jackson'),
  ('jellico', 'Jellico', 'Jellico'),
  ('jo-byrns', 'Jo Byrns', 'Jo Byrns'),
  ('kenwood', 'Kenwood', 'Kenwood'),
  ('kings-academy', 'King''s Academy', 'King''s Academy'),
  ('lake-county', 'Lake County', 'Lake County'),
  ('macon-county', 'Macon County', 'Macon County'),
  ('milford', 'Milford', 'Milford'),
  ('moeller', 'Moeller', 'Moeller'),
  ('north-greene', 'North Greene', 'North Greene'),
  ('northeast', 'Northeast', 'Northeast'),
  ('northwest', 'Northwest High School', 'Northwest'),
  ('pickett-county', 'Pickett County', 'Pickett County'),
  ('portsmouth-jr-sr-portsmouth', 'Portsmouth Jr.-Sr. High School-Portsmouth', 'Portsmouth'),
  ('providence', 'Providence', 'Providence'),
  ('reading', 'Reading', 'Reading'),
  ('ridgeview', 'Ridgeview', 'Ridgeview'),
  ('south-fulton', 'South Fulton', 'South Fulton'),
  ('south-spencer', 'South Spencer', 'South Spencer'),
  ('station-camp', 'Station Camp', 'Station Camp'),
  ('stephen-t-badin', 'Stephen T. Badin', 'Stephen T. Badin'),
  ('tell-city-schools', 'Tell City Schools', 'Tell City Schools'),
  ('thomas-walker', 'Thomas Walker', 'Thomas Walker'),
  ('tolsia', 'Tolsia', 'Tolsia'),
  ('twin-springs', 'Twin Springs', 'Twin Springs'),
  ('vienna', 'Vienna', 'Vienna'),
  ('volunteer', 'Volunteer', 'Volunteer'),
  ('west-creek', 'West Creek', 'West Creek'),
  ('westmoreland', 'Westmoreland', 'Westmoreland'),
  ('wheelersburg-jr-high', 'Wheelersburg Jr. High', 'Wheelersburg'),
  ('winfield', 'Winfield', 'Winfield')
) AS v(slug, name, short_name)
CROSS JOIN data_source ds
WHERE ds.slug = 'staff-entry'
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      short_name = EXCLUDED.short_name,
      is_khsaa_member = false,
      updated_at = now();
