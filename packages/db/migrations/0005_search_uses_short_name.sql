-- Search should show the scoreboard label, not the legal name.
--
-- search_document is a materialized view, so it cannot be altered in place.
-- Dropped and recreated with coalesce(short_name, name); the fallback matters
-- because out-of-state opponents and any hand-added school may have no short
-- name, and showing nothing would be worse than showing the long form.
--
-- Matching still reads school.name. Display and matching are deliberately
-- different: "John Hardin" is what a parent looks for, "John Hardin High
-- School" is what an import file says.

DROP MATERIALIZED VIEW search_document;

CREATE MATERIALIZED VIEW search_document AS
  SELECT 'school'::text AS entity_type, s.id AS entity_id,
         coalesce(s.short_name, s.name) AS title,
         coalesce(s.city, '') AS subtitle, s.slug::text AS slug
  FROM school s WHERE s.is_active
  UNION ALL
  SELECT 'player', p.id, p.first_name || ' ' || p.last_name, '', p.slug::text
  FROM player p WHERE p.merged_into_id IS NULL
  UNION ALL
  SELECT 'coach', c.id, c.first_name || ' ' || c.last_name, '', c.slug::text
  FROM coach c;

CREATE INDEX search_document_trgm ON search_document USING gin (title gin_trgm_ops);
CREATE INDEX search_document_type ON search_document (entity_type);
