-- Confirmed alternate names.
--
-- Each of these was checked by a human against a real document rather than
-- inferred, which is the whole point of the table.

INSERT INTO school_alias (school_id, alias, note)
SELECT sc.id, v.alias, v.note
FROM (VALUES
  ('shawnee', 'The Academy @ Shawnee',
   'Current official name; the 2026 schedule export uses it while the KHSAA alignment says Shawnee.')
) AS v(school_slug, alias, note)
JOIN school sc ON sc.slug = v.school_slug
ON CONFLICT (alias) DO UPDATE SET school_id = EXCLUDED.school_id, note = EXCLUDED.note;

-- Names James's nightly scores documents use. Each was confirmed against the
-- schedule for the night it arrived on, by finding the one fixture it could be,
-- not by picking the closest string.
INSERT INTO school_alias (school_id, alias, note)
SELECT sc.id, v.alias, v.note
FROM (VALUES
  ('berea-community', 'Berea',
   'Scores documents drop "Community". Confirmed on Berea at Harlan, 18 September 2026.'),
  ('larry-a-ryle', 'Ryle',
   'Everyone calls it Ryle; only the database carries the full "Larry A Ryle". Confirmed on Highlands at Ryle, 18 September 2026.'),
  ('ashland-blazer', 'Blazer',
   'Confirmed on Russell at Blazer, 18 September 2026.'),
  ('w-e-b-dubois', 'W.E.B. DuBois Academy',
   'The school is "Academy"; we hold it as "High School". Confirmed on Western at W.E.B. DuBois, 18 September 2026.'),
  ('huntington-expression-prep', 'Expression Prep Academy',
   'We hold the West Virginia spelling in capitals. Confirmed on Expression Prep at Fairview, 18 September 2026.'),
  ('vienna', 'Vienna/Goreville',
   'An Illinois co-operative; we hold only the first school. Confirmed at Ballard Memorial, 18 September 2026.'),
  ('tell-city-schools', 'Tell City',
   'Confirmed at Hancock County, 18 September 2026.')
) AS v(school_slug, alias, note)
JOIN school sc ON sc.slug = v.school_slug
ON CONFLICT (alias) DO UPDATE SET school_id = EXCLUDED.school_id, note = EXCLUDED.note;
