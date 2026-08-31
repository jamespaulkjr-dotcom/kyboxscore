-- Other names a school is known by.
--
-- "The Academy @ Shawnee" and "Shawnee High School" are one school. A schedule
-- export uses the current official name, an alignment document uses the older
-- short one, and fuzzy matching cannot safely bridge them - the strings share
-- almost nothing.
--
-- An alias is a human decision recorded once, and it takes priority over every
-- other matching rule precisely because a person made it.

CREATE TABLE school_alias (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id  bigint      NOT NULL REFERENCES school ON DELETE CASCADE,
  alias      citext      NOT NULL UNIQUE,
  -- Why this alias exists, so a future reader is not left guessing.
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX school_alias_school_idx ON school_alias (school_id);

COMMENT ON TABLE school_alias IS
  'Alternate names for a school. Checked before any other matching rule.';
