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
