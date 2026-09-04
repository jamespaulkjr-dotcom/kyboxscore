-- Deleting a game should not destroy it.
--
-- Delete shipped on 2026-09-04 and its first real use had to be undone within
-- the hour: a Valley at Southern fixture looked like a phantom, was removed,
-- and had in fact been played 42-0. It was only recoverable because the score
-- was still known. A game with a full play-by-play would simply have been gone.
--
-- **`game` is now a view.** The table is `game_all`; the view is every game
-- that has not been deleted. That is deliberate and it is the whole point:
-- roughly twenty queries read games, and a filter that has to be remembered in
-- twenty places is a filter that will be forgotten in one. The view is
-- auto-updatable, so INSERT, UPDATE and DELETE against `game` still work
-- exactly as before.
--
-- Anything that genuinely needs to see deleted games - the restore screen -
-- queries `game_all` and says so.

ALTER TABLE game
  ADD COLUMN deleted_at         timestamptz,
  ADD COLUMN deleted_by_user_id bigint REFERENCES app_user;

COMMENT ON COLUMN game.deleted_at IS
  'Soft delete. Nothing reads a deleted game except the restore screen.';

ALTER TABLE game RENAME TO game_all;

CREATE VIEW game AS SELECT * FROM game_all WHERE deleted_at IS NULL;

COMMENT ON VIEW game IS
  'Every game that has not been deleted. Auto-updatable, so writes pass '
  'straight through. Query game_all only when you mean to see deleted ones.';

-- A deleted fixture must not hold the natural key hostage: if a schedule
-- import re-creates the same two teams on the same date, that has to succeed.
DROP INDEX game_natural_key;
CREATE UNIQUE INDEX game_natural_key ON game_all (team_pair_key, local_date)
  WHERE team_pair_key IS NOT NULL AND deleted_at IS NULL;

-- The restore screen lists recently deleted games, newest first.
CREATE INDEX game_deleted_idx ON game_all (deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

-- Both trigger functions named `game`, which now resolves to the view. They
-- mean the table: a deleted game still needs its pair key kept straight, and
-- the participant-count check must not be skipped just because a game is
-- hidden.
CREATE OR REPLACE FUNCTION sync_game_pair_key() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE gid bigint := COALESCE(NEW.game_id, OLD.game_id);
BEGIN
  UPDATE game_all g SET team_pair_key = (
    SELECT string_agg(p.team_id::text, '-' ORDER BY p.team_id)
    FROM game_participant p WHERE p.game_id = gid
  ) WHERE g.id = gid;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION check_game_participant_count() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE gid bigint := COALESCE(NEW.game_id, OLD.game_id); n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM game_all WHERE id = gid) THEN RETURN NULL; END IF;
  SELECT count(*) INTO n FROM game_participant WHERE game_id = gid;
  IF n <> 2 THEN
    RAISE EXCEPTION 'game % must have exactly two participants, has %', gid, n;
  END IF;
  RETURN NULL;
END $$;
