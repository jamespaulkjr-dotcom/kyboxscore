-- Credentials and server-side sessions.
--
-- app_user already existed; it had no way to authenticate. Phase one has no
-- public signup - accounts are provisioned by staff - so there is deliberately
-- no email verification, no password reset token, and no OAuth here. Those
-- arrive when the audience widens beyond coaches and administrators.
--
-- Sessions are opaque random tokens stored server-side, not JWTs. Revocation
-- has to be immediate: a coach who leaves a school must lose access now, not
-- when a token expires. That is worth a database round trip per request.

ALTER TABLE app_user
  -- Encoded as scrypt$N$r$p$<salt_b64>$<hash_b64>. Node's crypto.scrypt is
  -- built in, so this adds no dependency and no native build step.
  -- NULL means the account exists but has no credential set yet, which is the
  -- normal state between "staff created the account" and "coach first logs in".
  ADD COLUMN password_hash   text,
  ADD COLUMN password_set_at timestamptz;

CREATE TABLE user_session (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      bigint      NOT NULL REFERENCES app_user ON DELETE CASCADE,
  -- sha256 of the cookie token, peppered with AUTH_SECRET. The raw token is
  -- never stored, so a database leak does not hand over live sessions.
  token_hash   char(64)    NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz
);

-- Lookup is always "this token, still valid".
CREATE INDEX user_session_active_idx
  ON user_session (token_hash) WHERE revoked_at IS NULL;
-- Supports both session cleanup and "log me out everywhere".
CREATE INDEX user_session_user_idx
  ON user_session (user_id, expires_at) WHERE revoked_at IS NULL;

COMMENT ON TABLE user_session IS
  'Opaque server-side sessions. Deleting a row logs the user out immediately.';

-- Rate limiting for the login form. Recorded for failures and successes both,
-- so a spike of failures followed by a success is visible.
--
-- This holds adult staff data only, never student athlete data. Rows older
-- than 30 days carry no value; prune them.
CREATE TABLE login_attempt (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email        citext      NOT NULL,
  ip           inet,
  succeeded    boolean     NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX login_attempt_email_idx ON login_attempt (email, attempted_at DESC);
CREATE INDEX login_attempt_ip_idx    ON login_attempt (ip, attempted_at DESC)
  WHERE ip IS NOT NULL;
