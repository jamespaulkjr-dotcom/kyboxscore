-- Out-of-state schedules, so an opponent's record can be adjusted per matchup.
--
-- The mistake this replaces: `out_of_state_record` held one adjusted record per
-- team, and that is wrong the moment a team plays two Kentucky schools. RPI
-- excludes only the game against the team being rated, so Jellico's record as
-- seen by Lynn Camp and as seen by Jackson County are different questions.
--
-- `out_of_state_record` now holds the team's RAW overall record, which is a
-- fact about them. The adjusted record is derived per (Kentucky team,
-- out-of-state opponent) and never stored as if it were a fact.
--
-- This table is the skeleton of an out-of-state team's season. Rows for games
-- against Kentucky carry their result; the rest carry opponent and date and
-- wait for a score. Once those scores arrive the raw record becomes derivable
-- rather than typed.

CREATE TABLE out_of_state_game (
  id                bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sport_season_id   integer     NOT NULL REFERENCES sport_season,
  -- The out-of-state team whose schedule this is.
  team_id           bigint      NOT NULL REFERENCES team,
  -- Their opponent, when we know them. Null for an opponent outside Kentucky
  -- that we have no reason to hold: we are not building a national database.
  opponent_team_id  bigint      REFERENCES team,
  opponent_name     text        NOT NULL,
  opponent_state    char(2),
  local_date        date        NOT NULL,
  home_away         text        NOT NULL CHECK (home_away IN ('home', 'away', 'neutral')),
  status            text        NOT NULL DEFAULT 'scheduled',
  result            char(1)     CHECK (result IN ('W', 'L', 'T')),
  team_score        smallint,
  opponent_score    smallint,
  is_kentucky_opponent boolean  NOT NULL DEFAULT false,
  -- The Kentucky game this mirrors, so the two can never drift apart.
  kentucky_game_id  bigint      REFERENCES game_all ON DELETE SET NULL,
  game_key          text,
  source_name       text        NOT NULL,
  source_url        text,
  retrieved_as_of   date        NOT NULL,
  data_source_id    smallint    REFERENCES data_source,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Deduplicated on canonical identity, not on a school name. A name is not a
-- key: that lesson cost nine mismatched games. Where the opponent is a team we
-- hold, its id is the key; where it is not, the lower-cased name stands in,
-- scoped to one team's schedule on one date.
CREATE UNIQUE INDEX out_of_state_game_natural_key
  ON out_of_state_game (
    sport_season_id, team_id, local_date,
    coalesce(opponent_team_id::text, lower(opponent_name))
  );

CREATE INDEX out_of_state_game_team_idx
  ON out_of_state_game (team_id, sport_season_id);
CREATE INDEX out_of_state_game_ky_idx
  ON out_of_state_game (kentucky_game_id) WHERE kentucky_game_id IS NOT NULL;

CREATE TRIGGER out_of_state_game_touch BEFORE UPDATE ON out_of_state_game
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

COMMENT ON TABLE out_of_state_game IS
  'An out-of-state team''s own schedule. Games against Kentucky carry a '
  'result; the rest wait for one. Used to adjust an opponent''s record per '
  'Kentucky matchup rather than once per team.';

-- The raw record is a fact about the team. Say so, because it briefly held an
-- adjusted number and a field called "wins" must not mean "wins except one".
COMMENT ON COLUMN out_of_state_record.wins IS
  'The team''s RAW overall record. Never the adjusted one: RPI excludes only '
  'the game against the team being rated, which is per matchup and derived.';
