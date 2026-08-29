-- ============================================================================
-- kyboxscore.com — data model (PostgreSQL 17)
--
-- Derived from CLAUDE.md.docx and ky-scoreboard-build-prompt.md.docx.
--
-- DATA POLICY, ENCODED HERE ON PURPOSE:
--   Minors are involved. This schema stores names, school, jersey number,
--   grade, and game statistics. There is deliberately NO column for address,
--   birthdate, phone, email, or photo on any athlete table. Do not add one
--   without a consent workflow. "When in doubt, leave the field out."
--
--   Every factual record traces to a data_source whose `kind` is restricted
--   to the four permitted acquisition channels. There is no channel for
--   scraped data, by construction.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS citext;      -- case-insensitive slugs and emails
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- import name matching + type-ahead search
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- exclusion constraints on date ranges

-- ============================================================================
-- Enums
-- ============================================================================

CREATE TYPE gender          AS ENUM ('boys', 'girls', 'coed');
CREATE TYPE team_level      AS ENUM ('varsity', 'jv', 'freshman', 'middle_school');
CREATE TYPE participant_role AS ENUM ('home', 'away');
CREATE TYPE game_status     AS ENUM ('scheduled', 'in_progress', 'final',
                                     'postponed', 'canceled', 'forfeit');
CREATE TYPE game_stage      AS ENUM ('scrimmage', 'regular_season', 'district_tournament',
                                     'regional_tournament', 'state_tournament',
                                     'other_tournament');
CREATE TYPE alignment_kind  AS ENUM ('classification', 'region', 'district');
CREATE TYPE stat_scope      AS ENUM ('player', 'team');
CREATE TYPE stat_value_type AS ENUM ('count', 'decimal', 'seconds', 'ratio');
CREATE TYPE aggregation     AS ENUM ('sum', 'avg', 'max', 'min', 'derived');
CREATE TYPE rpi_variant     AS ENUM ('official', 'shadow');
CREATE TYPE user_role       AS ENUM ('admin', 'staff', 'athletic_director', 'coach');

-- The four permitted ways data may enter this system. Scraping is not among
-- them and must never be added.
CREATE TYPE source_kind AS ENUM (
  'coach_submission',   -- coach or AD through our own forms
  'licensed_api',       -- signed agreement (e.g. a future Arbiter Partner API)
  'public_record',      -- public domain / permissively licensed
  'staff_entry'         -- manual entry by our own staff
);

-- ============================================================================
-- Provenance — referenced by every table that holds a claim about the world
-- ============================================================================

CREATE TABLE data_source (
  id           smallint    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug         citext      NOT NULL UNIQUE,        -- 'coach-upload', 'arbiter-api'
  name         text        NOT NULL,
  kind         source_kind NOT NULL,
  vendor       text,                               -- 'hudl', 'gamechanger', NULL
  license_note text,                               -- agreement reference, if any
  is_active    boolean     NOT NULL DEFAULT true
);

-- ============================================================================
-- Reference structure
-- ============================================================================

CREATE TABLE sport (
  id                 smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug               citext   NOT NULL UNIQUE,     -- 'football', 'basketball'
  name               text     NOT NULL,
  scoring_unit       text     NOT NULL,            -- 'points', 'runs', 'goals', 'sets'
  period_noun        text     NOT NULL,            -- 'quarter', 'half', 'inning', 'set'
  regulation_periods smallint NOT NULL CHECK (regulation_periods > 0),
  -- Football assigns opponent WP differently from every other sport.
  rpi_profile        text     NOT NULL DEFAULT 'standard'
                              CHECK (rpi_profile IN ('standard', 'football')),
  is_active          boolean  NOT NULL DEFAULT true,
  display_order      smallint NOT NULL DEFAULT 100
);

CREATE TABLE season (
  id         smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label      text     NOT NULL UNIQUE,             -- '2026-27' (academic year)
  start_year smallint NOT NULL UNIQUE
);

-- One sport's slice of one academic year.
CREATE TABLE sport_season (
  id          integer  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sport_id    smallint NOT NULL REFERENCES sport,
  season_id   smallint NOT NULL REFERENCES season,
  -- The year that appears in URLs: /football/2026/... Football 2026 is the
  -- fall of academic year 2026-27; basketball 2027 is the same academic year.
  -- Not derivable from season — see commentary.
  url_year    smallint NOT NULL,
  starts_on   date     NOT NULL,
  ends_on     date     NOT NULL,
  -- Regular season ends here; RPI counts only games before this date.
  regular_season_ends_on date,
  is_current  boolean  NOT NULL DEFAULT false,
  UNIQUE (sport_id, season_id),
  UNIQUE (sport_id, url_year),
  CHECK (ends_on > starts_on)
);
CREATE UNIQUE INDEX sport_season_current_uq
  ON sport_season (sport_id) WHERE is_current;

CREATE TABLE venue (
  id        bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug      citext  NOT NULL UNIQUE,
  name      text    NOT NULL,
  city      text,
  state     char(2) NOT NULL DEFAULT 'KY',
  time_zone text    NOT NULL DEFAULT 'America/New_York'
);

CREATE TABLE school (
  id              bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug            citext  NOT NULL UNIQUE,          -- 'john-hardin' — URL identity
  name            text    NOT NULL,
  short_name      text,                             -- scoreboard label
  mascot          text,
  city            text,
  county          text,                             -- KY facet; NULL out of state
  state           char(2) NOT NULL DEFAULT 'KY',
  khsaa_id        text    UNIQUE,
  is_khsaa_member boolean NOT NULL DEFAULT true,
  is_home_school  boolean NOT NULL DEFAULT false,   -- flat .500 WP in RPI
  -- Kentucky spans Eastern and Central time. See commentary.
  time_zone       text    NOT NULL DEFAULT 'America/New_York'
                          CHECK (time_zone IN ('America/New_York', 'America/Chicago')),
  primary_color   char(7) CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  secondary_color char(7) CHECK (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  home_venue_id   bigint  REFERENCES venue,
  is_active       boolean NOT NULL DEFAULT true,
  data_source_id  smallint REFERENCES data_source,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX school_state_idx ON school (state, is_active);
CREATE INDEX school_name_trgm ON school USING gin (name gin_trgm_ops);

-- Classifications, regions and districts, with effective dates because KHSAA
-- realigns every two years. Self-referencing: football is Class -> District,
-- basketball is Region -> District.
CREATE TABLE alignment (
  id             integer        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sport_id       smallint       NOT NULL REFERENCES sport,
  gender         gender         NOT NULL,
  kind           alignment_kind NOT NULL,
  name           text           NOT NULL,          -- '3A', 'Region 7', 'District 25'
  slug           citext         NOT NULL,
  -- 1A=1 ... 6A=6. Drives the RPI class factor (~15% per step up).
  ordinal        smallint,
  parent_id      integer        REFERENCES alignment,
  effective_from date           NOT NULL,
  effective_to   date,                             -- NULL = still in effect
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CHECK (kind <> 'classification' OR ordinal IS NOT NULL),
  UNIQUE (sport_id, gender, kind, slug, effective_from)
);
CREATE INDEX alignment_parent_idx ON alignment (parent_id);

-- ============================================================================
-- Teams
-- ============================================================================

-- Durable identity, season-independent: "John Hardin boys varsity basketball".
CREATE TABLE team (
  id        bigint     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id bigint     NOT NULL REFERENCES school,
  sport_id  smallint   NOT NULL REFERENCES sport,
  gender    gender     NOT NULL,
  level     team_level NOT NULL DEFAULT 'varsity',
  UNIQUE (school_id, sport_id, gender, level)
);

CREATE TABLE team_season (
  id              bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id         bigint  NOT NULL REFERENCES team,
  sport_season_id integer NOT NULL REFERENCES sport_season,
  -- Leaf alignment, normally the district; class/region via parent_id.
  -- NULL for out-of-state, independent, and home school teams.
  alignment_id    integer REFERENCES alignment,
  UNIQUE (team_id, sport_season_id)
);
CREATE INDEX team_season_alignment_idx ON team_season (alignment_id);
CREATE INDEX team_season_sport_season_idx ON team_season (sport_season_id);

-- Out-of-state opponents are ordinary schools/teams (state <> 'KY'). This is
-- the spec's OutOfStateTeams, narrowed to what it is actually for: a W-L
-- record for Shadow RPI. Only teams KY schools actually played get a row.
CREATE TABLE out_of_state_record (
  id             bigint   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id        bigint   NOT NULL REFERENCES team,
  sport_season_id integer NOT NULL REFERENCES sport_season,
  wins           smallint NOT NULL CHECK (wins >= 0),
  losses         smallint NOT NULL CHECK (losses >= 0),
  ties           smallint NOT NULL DEFAULT 0 CHECK (ties >= 0),
  source_name    text     NOT NULL,                -- e.g. 'IHSAA published standings'
  source_url     text,
  as_of          date     NOT NULL,
  data_source_id smallint NOT NULL REFERENCES data_source,
  UNIQUE (team_id, sport_season_id)
);

CREATE TABLE coach (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       citext NOT NULL UNIQUE,
  first_name text   NOT NULL,
  last_name  text   NOT NULL
);

CREATE TABLE coach_assignment (
  id             bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  coach_id       bigint  NOT NULL REFERENCES coach,
  team_season_id bigint  NOT NULL REFERENCES team_season ON DELETE CASCADE,
  role           text    NOT NULL DEFAULT 'head' CHECK (role IN ('head', 'assistant')),
  data_source_id smallint REFERENCES data_source,
  UNIQUE (team_season_id, coach_id, role)
);
CREATE UNIQUE INDEX coach_assignment_head_uq
  ON coach_assignment (team_season_id) WHERE role = 'head';

-- ============================================================================
-- Athletes
--
-- NOTE: name, grade, jersey, position only. No birthdate, address, contact
-- information, or photo. Do not add them. See the data policy header.
-- ============================================================================

CREATE TABLE player (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug           citext NOT NULL UNIQUE,
  first_name     text   NOT NULL,
  last_name      text   NOT NULL,
  -- Set when this row is found to duplicate another. Reads follow the pointer;
  -- the row survives so old URLs and old stat lines keep resolving.
  merged_into_id bigint REFERENCES player,
  data_source_id smallint REFERENCES data_source,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (merged_into_id IS DISTINCT FROM id)
);
CREATE INDEX player_name_trgm  ON player USING gin ((first_name || ' ' || last_name) gin_trgm_ops);
CREATE INDEX player_merged_idx ON player (merged_into_id) WHERE merged_into_id IS NOT NULL;

-- The spec's PlayerSeasons: transfers and grade progression.
CREATE TABLE player_season (
  id             bigint   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id      bigint   NOT NULL REFERENCES player,
  team_season_id bigint   NOT NULL REFERENCES team_season ON DELETE CASCADE,
  jersey         text,                             -- text: '00' is not '0'
  grade          smallint CHECK (grade BETWEEN 6 AND 12),
  positions      text[],
  data_source_id smallint REFERENCES data_source,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_season_id, player_id)
);
CREATE INDEX player_season_player_idx ON player_season (player_id);
-- Deliberately NOT unique on (team_season_id, jersey): sub-varsity call-ups
-- and imperfect source data both produce duplicates within a roster.
CREATE INDEX player_season_jersey_idx ON player_season (team_season_id, jersey);

-- ============================================================================
-- Games
-- ============================================================================

CREATE TABLE game (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sport_season_id integer     NOT NULL REFERENCES sport_season,
  -- Short, shareable permalink component: /basketball/2027/g/7fkq2m
  short_code      citext      NOT NULL UNIQUE,
  -- local_date is the authoritative "what night was this" value and drives
  -- every scoreboard query. starts_at is the exact instant and is often
  -- unknown. See the time zone commentary.
  local_date      date        NOT NULL,
  starts_at       timestamptz,
  status          game_status NOT NULL DEFAULT 'scheduled',
  stage           game_stage  NOT NULL DEFAULT 'regular_season',
  neutral_site    boolean     NOT NULL DEFAULT false,
  venue_id        bigint      REFERENCES venue,
  event_name      text,                            -- 'Sweet 16 Quarterfinal'
  periods_played  smallint    CHECK (periods_played > 0),
  -- Distinguishes "no book yet" from "book is in" for a game already final.
  box_score_status text       NOT NULL DEFAULT 'none'
                              CHECK (box_score_status IN ('none','partial','complete')),
  notes           text,
  data_source_id  smallint    REFERENCES data_source,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX game_scoreboard_idx ON game (sport_season_id, local_date, status);
CREATE INDEX game_date_idx       ON game (local_date DESC);
CREATE INDEX game_live_idx       ON game (local_date) WHERE status = 'in_progress';

-- The spec's GameParticipants. Two rows per game.
CREATE TABLE game_participant (
  id         bigint           GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id    bigint           NOT NULL REFERENCES game ON DELETE CASCADE,
  team_id    bigint           NOT NULL REFERENCES team,
  role       participant_role NOT NULL,
  score      smallint         CHECK (score >= 0),
  is_forfeit boolean          NOT NULL DEFAULT false,
  UNIQUE (game_id, role),
  UNIQUE (game_id, team_id)
);
CREATE INDEX game_participant_team_idx ON game_participant (team_id, game_id);

-- Idempotent ingest key. The natural key of a game ("these two teams, this
-- date") spans game and its participants, which no single unique constraint
-- can express. team_pair_key denormalizes the sorted team pair onto game so
-- the constraint becomes declarative. Maintained by trigger below.
ALTER TABLE game ADD COLUMN team_pair_key text;
CREATE UNIQUE INDEX game_natural_key ON game (team_pair_key, local_date)
  WHERE team_pair_key IS NOT NULL;

CREATE FUNCTION sync_game_pair_key() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE gid bigint := COALESCE(NEW.game_id, OLD.game_id);
BEGIN
  UPDATE game g SET team_pair_key = (
    SELECT string_agg(p.team_id::text, '-' ORDER BY p.team_id)
    FROM game_participant p WHERE p.game_id = gid
  ) WHERE g.id = gid;
  RETURN NULL;
END $$;

CREATE TRIGGER game_participant_pair_key
  AFTER INSERT OR UPDATE OF team_id OR DELETE ON game_participant
  FOR EACH ROW EXECUTE FUNCTION sync_game_pair_key();

-- "Exactly two participants" is not expressible declaratively; enforce it at
-- commit time so a two-statement insert is legal in between.
CREATE FUNCTION check_game_participant_count() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE gid bigint := COALESCE(NEW.game_id, OLD.game_id); n integer;
BEGIN
  -- The game itself may have been deleted (cascade); nothing left to check.
  IF NOT EXISTS (SELECT 1 FROM game WHERE id = gid) THEN RETURN NULL; END IF;
  SELECT count(*) INTO n FROM game_participant WHERE game_id = gid;
  IF n <> 2 THEN
    RAISE EXCEPTION 'game % must have exactly 2 participants, found %', gid, n;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER game_participant_pair
  AFTER INSERT OR UPDATE OR DELETE ON game_participant
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_game_participant_count();

-- Linescore. Quarters, halves, innings and sets alike.
CREATE TABLE game_period_score (
  game_participant_id bigint   NOT NULL REFERENCES game_participant ON DELETE CASCADE,
  period_number       smallint NOT NULL CHECK (period_number > 0),
  -- NULL is meaningful: the home half-inning never played (the 'X').
  score               smallint CHECK (score >= 0),
  PRIMARY KEY (game_participant_id, period_number)
);

-- Scoring summary for the game page.
CREATE TABLE scoring_play (
  id                  bigint   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_participant_id bigint   NOT NULL REFERENCES game_participant ON DELETE CASCADE,
  period_number       smallint NOT NULL,
  clock               text,                        -- '04:12' as printed
  sequence            integer  NOT NULL,           -- order within the game
  points              smallint NOT NULL DEFAULT 0,
  description         text     NOT NULL,
  player_id           bigint   REFERENCES player,
  assist_player_id    bigint   REFERENCES player,
  home_score_after    smallint,
  away_score_after    smallint,
  UNIQUE (game_participant_id, sequence)
);

-- ============================================================================
-- Statistics — data driven, so a new sport is INSERTs, not a migration
-- ============================================================================

CREATE TABLE stat_definition (
  id                   smallint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sport_id             smallint        NOT NULL REFERENCES sport,
  key                  citext          NOT NULL,   -- 'fgm', 'rush_yds', 'era'
  name                 text            NOT NULL,   -- 'Field Goals Made'
  abbrev               text            NOT NULL,   -- 'FGM'
  scope                stat_scope      NOT NULL DEFAULT 'player',
  value_type           stat_value_type NOT NULL DEFAULT 'count',
  category             text,                       -- box score section: 'passing', 'shooting'
  display_order        smallint        NOT NULL DEFAULT 100,
  -- How a season total is produced from game values.
  season_aggregation   aggregation     NOT NULL DEFAULT 'sum',
  -- Derived stats (FG%, batting average, yards per carry) are computed from
  -- other keys and never stored on stat_value.
  is_derived           boolean         NOT NULL DEFAULT false,
  derivation           jsonb,                      -- {"op":"ratio","num":"fgm","den":"fga"}
  min_value            numeric,
  max_value            numeric,
  higher_is_better     boolean         NOT NULL DEFAULT true,
  leaderboard_eligible boolean         NOT NULL DEFAULT false,
  -- Minimum volume to appear on a leaderboard, e.g. {"min_games": 10}
  -- or {"min": {"key": "fga", "per_game": 5}}. Rate stats need this.
  qualifier            jsonb,
  UNIQUE (sport_id, key),
  CHECK (is_derived = (derivation IS NOT NULL)),
  CHECK (NOT is_derived OR season_aggregation = 'derived')
);
CREATE INDEX stat_definition_sport_idx ON stat_definition (sport_id, display_order);

-- One row per player (or team) per game. Carries the provenance the spec
-- requires on every stat record.
CREATE TABLE stat_line (
  id                  bigint     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id             bigint     NOT NULL REFERENCES game ON DELETE CASCADE,
  game_participant_id bigint     NOT NULL REFERENCES game_participant ON DELETE CASCADE,
  scope               stat_scope NOT NULL DEFAULT 'player',
  player_id           bigint     REFERENCES player,   -- NULL for team-scope lines
  jersey              text,                           -- as printed in THIS book
  started             boolean,
  did_not_play        boolean    NOT NULL DEFAULT false,
  -- Provenance. Required: "when a coach disputes a number, you need to know
  -- where it came from."
  data_source_id      smallint   NOT NULL REFERENCES data_source,
  import_batch_id     bigint,                         -- FK added after import_batch
  entered_by_user_id  bigint,                         -- FK added after app_user
  entered_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'player') = (player_id IS NOT NULL))
);
CREATE UNIQUE INDEX stat_line_player_uq
  ON stat_line (game_id, player_id) WHERE player_id IS NOT NULL;
CREATE UNIQUE INDEX stat_line_team_uq
  ON stat_line (game_participant_id) WHERE scope = 'team';
CREATE INDEX stat_line_player_idx ON stat_line (player_id, game_id);

CREATE TABLE stat_value (
  stat_line_id       bigint        NOT NULL REFERENCES stat_line ON DELETE CASCADE,
  stat_definition_id smallint      NOT NULL REFERENCES stat_definition,
  value              numeric(12,3) NOT NULL,
  PRIMARY KEY (stat_line_id, stat_definition_id)
);
-- Single-game record book: "most points in a game, ever".
CREATE INDEX stat_value_record_idx ON stat_value (stat_definition_id, value DESC);

-- ---------------------------------------------------------------------------
-- Rollups. stat_value is the write model; these are the read model for team
-- pages, player pages and leaderboards. Refreshed after every committed
-- import or manual entry.
-- ---------------------------------------------------------------------------

CREATE TABLE player_season_stat (
  player_season_id   bigint        NOT NULL REFERENCES player_season ON DELETE CASCADE,
  stat_definition_id smallint      NOT NULL REFERENCES stat_definition,
  value              numeric(12,3) NOT NULL,
  games_played       smallint      NOT NULL,
  -- Denormalized from player_season so a statewide or by-class leaderboard is
  -- one index range scan with no join.
  sport_season_id    integer       NOT NULL REFERENCES sport_season,
  alignment_id       integer       REFERENCES alignment,
  computed_at        timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (player_season_id, stat_definition_id)
);
CREATE INDEX player_season_stat_leaderboard_idx
  ON player_season_stat (sport_season_id, stat_definition_id, value DESC);
CREATE INDEX player_season_stat_by_class_idx
  ON player_season_stat (sport_season_id, stat_definition_id, alignment_id, value DESC);

CREATE TABLE team_season_stat (
  team_season_id     bigint        NOT NULL REFERENCES team_season ON DELETE CASCADE,
  stat_definition_id smallint      NOT NULL REFERENCES stat_definition,
  value              numeric(12,3) NOT NULL,
  games_played       smallint      NOT NULL,
  computed_at        timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (team_season_id, stat_definition_id)
);

CREATE TABLE team_season_record (
  team_season_id bigint      PRIMARY KEY REFERENCES team_season ON DELETE CASCADE,
  wins           smallint    NOT NULL DEFAULT 0,
  losses         smallint    NOT NULL DEFAULT 0,
  ties           smallint    NOT NULL DEFAULT 0,
  district_wins  smallint    NOT NULL DEFAULT 0,
  district_losses smallint   NOT NULL DEFAULT 0,
  computed_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Accounts — coaches and administrators only in phase one
-- ============================================================================

CREATE TABLE app_user (
  id            bigint    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         citext    NOT NULL UNIQUE,
  name          text      NOT NULL,
  role          user_role NOT NULL DEFAULT 'coach',
  coach_id      bigint    REFERENCES coach,
  is_active     boolean   NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

-- Which teams a user may enter statistics for.
CREATE TABLE user_team_grant (
  user_id       bigint      NOT NULL REFERENCES app_user ON DELETE CASCADE,
  team_id       bigint      NOT NULL REFERENCES team ON DELETE CASCADE,
  granted_by_id bigint      REFERENCES app_user,
  granted_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, team_id)
);

ALTER TABLE stat_line
  ADD CONSTRAINT stat_line_entered_by_fk
  FOREIGN KEY (entered_by_user_id) REFERENCES app_user;

-- ============================================================================
-- Import pipeline
-- ============================================================================

CREATE TABLE import_batch (
  id                bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  data_source_id    smallint    NOT NULL REFERENCES data_source,
  uploaded_by_id    bigint      NOT NULL REFERENCES app_user,
  team_season_id    bigint      REFERENCES team_season,
  game_id           bigint      REFERENCES game,
  vendor            text        CHECK (vendor IN ('hudl','gamechanger','other')),
  format            text        NOT NULL
                                CHECK (format IN ('maxpreps_txt','csv','xlsx','manual')),
  original_filename text,
  byte_size         integer,
  -- Idempotency: the same file uploaded twice is recognized, not duplicated.
  sha256            char(64),
  -- Retained so a parser fix can be replayed without asking the coach again.
  raw_text          text,
  status            text        NOT NULL DEFAULT 'uploaded'
                                CHECK (status IN ('uploaded','parsed','awaiting_review',
                                                  'committed','failed','superseded')),
  parsed_summary    jsonb,
  superseded_by_id  bigint      REFERENCES import_batch,
  created_at        timestamptz NOT NULL DEFAULT now(),
  parsed_at         timestamptz,
  committed_at      timestamptz
);
CREATE UNIQUE INDEX import_batch_sha_uq
  ON import_batch (team_season_id, sha256) WHERE sha256 IS NOT NULL;

ALTER TABLE stat_line
  ADD CONSTRAINT stat_line_import_batch_fk
  FOREIGN KEY (import_batch_id) REFERENCES import_batch;

-- Parsed rows held for preview, before anything is written to stat_line.
CREATE TABLE import_row (
  id                bigint   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_batch_id   bigint   NOT NULL REFERENCES import_batch ON DELETE CASCADE,
  row_number        integer  NOT NULL,
  raw               jsonb    NOT NULL,             -- exactly what the file said
  parsed_name       text,
  parsed_jersey     text,
  matched_player_id bigint   REFERENCES player,
  match_confidence  numeric(4,3),
  match_method      text     CHECK (match_method IN ('exact','jersey','fuzzy',
                                                     'alias','manual','unmatched')),
  resolved_by_id    bigint   REFERENCES app_user,
  resolved_at       timestamptz,
  UNIQUE (import_batch_id, row_number)
);
CREATE INDEX import_row_unresolved_idx
  ON import_row (import_batch_id) WHERE matched_player_id IS NULL;

-- "Never fail silently. Report what was skipped and why."
CREATE TABLE import_issue (
  id              bigint   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_batch_id bigint   NOT NULL REFERENCES import_batch ON DELETE CASCADE,
  import_row_id   bigint   REFERENCES import_row ON DELETE CASCADE,
  severity        text     NOT NULL CHECK (severity IN ('info','warning','error')),
  code            text     NOT NULL,               -- 'unknown_player', 'bad_stat_key'
  message         text     NOT NULL,
  context         jsonb
);
CREATE INDEX import_issue_batch_idx ON import_issue (import_batch_id, severity);

-- Fuzzy matching that learns from corrections. Scoped to the roster, because
-- "J. Smith" is only unambiguous within one team's season.
CREATE TABLE player_name_alias (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_season_id bigint      NOT NULL REFERENCES team_season ON DELETE CASCADE,
  raw_name       citext      NOT NULL,             -- as the vendor file spells it
  player_id      bigint      NOT NULL REFERENCES player,
  vendor         text,
  confirmed_by_id bigint     REFERENCES app_user,
  confirmed_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_season_id, raw_name)
);

-- Remembered CSV column mapping, so a coach's second upload is one click.
CREATE TABLE import_column_mapping (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        bigint      NOT NULL REFERENCES app_user ON DELETE CASCADE,
  sport_id       smallint    NOT NULL REFERENCES sport,
  format         text        NOT NULL,
  header_hash    char(64)    NOT NULL,             -- hash of the header row
  mapping        jsonb       NOT NULL,             -- {"PTS": "points", ...}
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sport_id, header_hash)
);

-- ============================================================================
-- RPI — official and shadow, fully reproducible
-- ============================================================================

CREATE TABLE rpi_run (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sport_season_id integer     NOT NULL REFERENCES sport_season,
  variant         rpi_variant NOT NULL,
  formula_version text        NOT NULL,            -- 'khsaa-2026.1'
  -- The full weight/class-factor configuration actually used, so a past run
  -- stays reproducible after the constants change.
  config          jsonb       NOT NULL,
  -- Only games with local_date <= this were considered.
  through_date    date        NOT NULL,
  computed_at     timestamptz NOT NULL DEFAULT now(),
  -- Detailed rpi_input rows are pruned for old runs; see commentary.
  inputs_retained boolean     NOT NULL DEFAULT true
);
CREATE INDEX rpi_run_lookup_idx ON rpi_run (sport_season_id, variant, computed_at DESC);

CREATE TABLE rpi_result (
  rpi_run_id       bigint        NOT NULL REFERENCES rpi_run ON DELETE CASCADE,
  team_id          bigint        NOT NULL REFERENCES team,
  wins             smallint      NOT NULL,
  losses           smallint      NOT NULL,
  ties             smallint      NOT NULL DEFAULT 0,
  wp               numeric(8,6)  NOT NULL,
  owp              numeric(8,6)  NOT NULL,
  oowp             numeric(8,6)  NOT NULL,
  class_factor     numeric(6,4)  NOT NULL DEFAULT 1.0,
  rpi              numeric(8,6)  NOT NULL,
  state_rank       integer,
  class_rank       integer,
  region_rank      integer,
  -- "Do not publish an RPI for any team with missing scores."
  is_published     boolean       NOT NULL DEFAULT true,
  suppressed_reason text         CHECK (suppressed_reason IN ('missing_scores',
                                                              'insufficient_games')),
  PRIMARY KEY (rpi_run_id, team_id),
  CHECK (is_published = (suppressed_reason IS NULL))
);
CREATE INDEX rpi_result_rank_idx ON rpi_result (rpi_run_id, rpi DESC);

-- The arithmetic, per contributing game. This is what you show the coach
-- who disputes a ranking.
CREATE TABLE rpi_input (
  id                  bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rpi_run_id          bigint       NOT NULL REFERENCES rpi_run ON DELETE CASCADE,
  team_id             bigint       NOT NULL REFERENCES team,
  game_id             bigint       NOT NULL REFERENCES game,
  opponent_team_id    bigint       NOT NULL REFERENCES team,
  opponent_is_in_state boolean     NOT NULL,
  -- What the opponent's WP actually was, and what the formula used instead.
  opponent_actual_wp  numeric(8,6),
  opponent_applied_wp numeric(8,6) NOT NULL,
  applied_wp_reason   text         NOT NULL,       -- 'actual', 'flat_500_out_of_state',
                                                   -- 'flat_500_home_school'
  result_value        numeric(4,3) NOT NULL,       -- 1 / 0.5 / 0, football differs
  class_delta         smallint     NOT NULL DEFAULT 0
);
CREATE INDEX rpi_input_lookup_idx ON rpi_input (rpi_run_id, team_id);

-- ============================================================================
-- Search — one box that resolves schools, teams, players and coaches
-- ============================================================================

CREATE MATERIALIZED VIEW search_document AS
  SELECT 'school'::text AS entity_type, s.id AS entity_id, s.name AS title,
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

-- ============================================================================
-- updated_at
-- ============================================================================

CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER school_touch    BEFORE UPDATE ON school
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER player_touch    BEFORE UPDATE ON player
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER game_touch      BEFORE UPDATE ON game
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER stat_line_touch BEFORE UPDATE ON stat_line
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
