-- SECTION 10: VOICE SYSTEM
-- ============================================================
 
-- Voice samples recorded by family members.
-- Phase 1: raw recordings played as-is for specific trigger types.
-- Phase 2+: cloned via ElevenLabs for dynamic script generation.
-- consent_given_at is a legally required field under DPDP Act 2023.
CREATE TABLE voice_samples (
  user_id               UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_by           UUID          NOT NULL REFERENCES users(id),
  patient_id            UUID          NOT NULL REFERENCES users(id),
  storage_path          TEXT          NOT NULL,        -- S3 key, never a public URL
  file_size_bytes       INTEGER,
  duration_seconds      INTEGER       NOT NULL,
  quality_score         FLOAT,                         -- SNR score 0.0–1.0
  language              VARCHAR(10)   NOT NULL DEFAULT 'en',
  label                 VARCHAR(100),                  -- e.g. 'Morning greeting'
  transcript            TEXT,                          -- auto-transcribed
  -- consent fields: legally required, must never be deleted
  consent_given_at      TIMESTAMPTZ   NOT NULL,
  consent_text_version  VARCHAR(20)   NOT NULL,
  clone_status          clone_status  NOT NULL DEFAULT 'RAW',
  clone_voice_id        VARCHAR(100),                  -- ElevenLabs voice ID
  clone_started_at      TIMESTAMPTZ,
  clone_completed_at    TIMESTAMPTZ,
  is_active             BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_voice_samples_patient ON voice_samples (patient_id) WHERE is_active = TRUE;
 
 
CREATE TABLE voice_messages (
  id               UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID                NOT NULL REFERENCES users(id),
  sender_id        UUID                NOT NULL REFERENCES users(id),
  trigger_type     voice_trigger_type  NOT NULL,
  voice_sample_id  UUID                REFERENCES voice_samples(id),  -- NULL = platform voice
  script           TEXT                NOT NULL,
  audio_url        TEXT,               -- S3 presigned URL, populated after TTS
  language         VARCHAR(10)         NOT NULL DEFAULT 'en',
  -- status: QUEUED | GENERATING | DELIVERED | FAILED | SKIPPED
  status           VARCHAR(20)         NOT NULL DEFAULT 'QUEUED',
  skip_reason      VARCHAR(100),       -- e.g. 'cooldown_active'
  delivered_at     TIMESTAMPTZ,
  heard_at         TIMESTAMPTZ,        -- patient device confirms playback complete
  created_at       TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_voice_messages_patient ON voice_messages (patient_id, created_at DESC);
 
 
-- ============================================================
