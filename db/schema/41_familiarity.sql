-- SECTION 11: FAMILIARITY ENGINE
-- ============================================================
 
-- Family-uploaded assets used to personalise patient interactions.
-- Referenced by AI orientation script generation and patient story feed.
CREATE TABLE familiarity_assets (
  id              UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID                    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  uploaded_by     UUID                    NOT NULL REFERENCES users(id),
  asset_type      familiarity_asset_type  NOT NULL,
  storage_path    TEXT,                   -- S3 key for photo or song
  title           VARCHAR(200),           -- song title or photo label
  description     TEXT,                   -- memory text or photo caption
  people_tagged   VARCHAR(100)[],         -- names of people in photo
  year_approx     INTEGER,                -- approximate year for timeline ordering
  -- emotion_tag: 'happy' | 'nostalgic' | 'calm' | 'celebratory'
  emotion_tag     VARCHAR(30),
  play_count      INTEGER                 NOT NULL DEFAULT 0,
  last_shown_at   TIMESTAMPTZ,
  is_active       BOOLEAN                 NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_familiarity_patient ON familiarity_assets (patient_id, is_active)
  WHERE is_active = TRUE;
 
 
-- ============================================================
