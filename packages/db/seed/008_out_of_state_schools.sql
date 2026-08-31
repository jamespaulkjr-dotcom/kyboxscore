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
-- artefacts like " - *".

INSERT INTO school (slug, name, short_name, state, is_khsaa_member, data_source_id)
SELECT v.slug, v.name, v.name, 'XX', false, ds.id
FROM (VALUES
  ('aiken-and-junior', 'Aiken High School & Junior'),
  ('archbishop-mcnicholas', 'Archbishop McNicholas'),
  ('baylor-school', 'Baylor School'),
  ('brighton', 'Brighton High School'),
  ('castlewood', 'Castlewood'),
  ('cathedral', 'Cathedral'),
  ('christian-brothers-college', 'Christian Brothers College'),
  ('clarksville-academy', 'Clarksville Academy'),
  ('clermont-northeastern', 'Clermont Northeastern'),
  ('cloudland', 'Cloudland'),
  ('elder', 'Elder'),
  ('evansville-fj-reitz', 'Evansville FJ Reitz'),
  ('gibson-southern', 'Gibson Southern'),
  ('gleason', 'Gleason'),
  ('greenfield', 'Greenfield'),
  ('huntington-expression-prep', 'HUNTINGTON EXPRESSION PREP'),
  ('heritage-hills', 'Heritage Hills'),
  ('huntington', 'Huntington'),
  ('indian-hill', 'Indian Hill'),
  ('ironton', 'Ironton'),
  ('jackson', 'Jackson'),
  ('jellico', 'Jellico'),
  ('jo-byrns', 'Jo Byrns'),
  ('kenwood', 'Kenwood'),
  ('kings-academy', 'King''s Academy'),
  ('lake-county', 'Lake County'),
  ('macon-county', 'Macon County'),
  ('milford', 'Milford'),
  ('moeller', 'Moeller'),
  ('north-greene', 'North Greene'),
  ('northeast', 'Northeast'),
  ('northwest', 'Northwest High School'),
  ('pickett-county', 'Pickett County'),
  ('portsmouth-jr-sr-portsmouth', 'Portsmouth Jr.-Sr. High School-Portsmouth'),
  ('providence', 'Providence'),
  ('reading', 'Reading'),
  ('ridgeview', 'Ridgeview'),
  ('south-fulton', 'South Fulton'),
  ('south-spencer', 'South Spencer'),
  ('station-camp', 'Station Camp'),
  ('stephen-t-badin', 'Stephen T. Badin'),
  ('tell-city-schools', 'Tell City Schools'),
  ('thomas-walker', 'Thomas Walker'),
  ('tolsia', 'Tolsia'),
  ('twin-springs', 'Twin Springs'),
  ('vienna', 'Vienna'),
  ('volunteer', 'Volunteer'),
  ('west-creek', 'West Creek'),
  ('westmoreland', 'Westmoreland'),
  ('wheelersburg-jr-high', 'Wheelersburg Jr. High'),
  ('winfield', 'Winfield')
) AS v(slug, name)
CROSS JOIN data_source ds
WHERE ds.slug = 'staff-entry'
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      short_name = EXCLUDED.short_name,
      is_khsaa_member = false,
      updated_at = now();
