-- SECTION 2: IDENTITY & AUTH
-- Firebase Admin SDK is used for token verification.
-- firebase_uid stores the UID from Firebase Auth.
-- ============================================================

CREATE TABLE users (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid        VARCHAR(255)  NOT NULL UNIQUE,  -- Firebase UID
  email               VARCHAR(255)  UNIQUE,            -- from Firebase token
  phone               VARCHAR(20)   UNIQUE,            -- E.164 format: +919876543210
  name                VARCHAR(100)  NOT NULL,
  date_of_birth       DATE,
  gender              VARCHAR(30),
  preferred_language  VARCHAR(10)   NOT NULL DEFAULT 'en',  -- ISO 639-1
  city                VARCHAR(100),
  photo_url           TEXT,                              -- S3 presigned base path
  is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
  onboarding_complete BOOLEAN       NOT NULL DEFAULT FALSE,
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_users_firebase_uid ON users (firebase_uid);
CREATE INDEX idx_users_email        ON users (email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_phone        ON users (phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_users_active       ON users (is_active) WHERE is_active = TRUE;
CREATE INDEX idx_users_not_deleted  ON users (deleted_at) WHERE deleted_at IS NULL;


-- One row per human per role.
-- V1 constraint: one active role per user enforced at application layer.
-- Table retained for future multi-role support.
CREATE TABLE user_roles (
  id          UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_type   user_role_type    NOT NULL,
  is_active   BOOLEAN           NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_active_role UNIQUE (user_id, is_active)
);

CREATE INDEX idx_user_roles_user   ON user_roles (user_id);
CREATE INDEX idx_user_roles_active ON user_roles (user_id) WHERE is_active = TRUE;


-- ============================================================
