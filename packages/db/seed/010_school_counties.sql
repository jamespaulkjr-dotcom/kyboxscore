-- County, taken from the school's own name.
--
-- "Adair County High School" states its county; that is the school telling us,
-- not us inferring. The 189 schools named for a town or a person say nothing
-- about their county and are left NULL rather than guessed at.
--
-- County matters because Kentucky spans Eastern and Central time. Every school
-- currently claims Eastern, which is wrong for the western third of the state.
-- The county is the mechanical half of fixing that; which counties are Central
-- is a factual claim that has to come from a real source.

-- A literal space, not \s. Postgres does not honour the backslash escape the
-- way a JS regex would, and a pattern using it silently matches nothing - this
-- is the third time that has cost us, so it is written down in STATUS.md.
UPDATE school
SET county = substring(name from '^(.+?) County'),
    updated_at = now()
WHERE state = 'KY'
  AND county IS NULL
  AND name ~ '^(.+?) County';
