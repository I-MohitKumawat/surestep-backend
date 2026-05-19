-- SECTION 4: PROFILES
-- ============================================================
 
CREATE TABLE patient_profiles (
  user_id                       UUID          PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  diagnosis                     VARCHAR(100),                -- e.g. 'Mild Cognitive Impairment'
  diagnosis_date                DATE,
  severity_level                VARCHAR(20),                 -- Mild / Moderate / Severe
  emergency_contact_name        VARCHAR(100),
  emergency_contact_phone       VARCHAR(20),
  emergency_contact_relation    VARCHAR(50),
  -- medications stored as structured JSONB:
  -- [{id, name, dosage, form, frequency, times_of_day[], instructions,
  --   current_quantity, refill_at_quantity, prescribing_doctor, is_critical}]
  medications                   JSONB         NOT NULL DEFAULT '[]',
  known_triggers                TEXT[]        NOT NULL DEFAULT '{}',
  comfort_items                 TEXT[]        NOT NULL DEFAULT '{}',
  -- favourite_songs: [{title, artist, storage_path}]
  favourite_songs               JSONB         NOT NULL DEFAULT '[]',
  home_address                  TEXT,
  home_lat                      DOUBLE PRECISION,
  home_lng                      DOUBLE PRECISION,
  can_use_phone_independently   BOOLEAN       NOT NULL DEFAULT TRUE,
  voice_command_enabled         BOOLEAN       NOT NULL DEFAULT TRUE,
  tts_enabled                   BOOLEAN       NOT NULL DEFAULT TRUE,
  tts_speed                     DECIMAL(3,2)  NOT NULL DEFAULT 0.85,  -- 0.5 to 1.5
  cognitive_baseline_date       DATE,
  updated_at                    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
 
 
CREATE TABLE caregiver_profiles (
  user_id               UUID                  PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio                   TEXT,
  years_of_experience   INTEGER               NOT NULL DEFAULT 0,
  specializations       TEXT[]                NOT NULL DEFAULT '{}',
  languages_spoken      TEXT[]                NOT NULL DEFAULT '{}',  -- ISO 639-1
  availability_types    availability_type[]   NOT NULL DEFAULT '{}',
  service_radius_km     INTEGER               NOT NULL DEFAULT 10,
  max_patients          INTEGER               NOT NULL DEFAULT 3,
  current_patient_count INTEGER               NOT NULL DEFAULT 0,
  hourly_rate_inr       DECIMAL(10,2),
  daily_rate_inr        DECIMAL(10,2),
  is_verified           BOOLEAN               NOT NULL DEFAULT FALSE,
  verification_method   VARCHAR(50),          -- 'AADHAAR' | 'MANUAL'
  verification_date     DATE,
  aadhaar_hash          TEXT,                 -- hashed only, never raw
  rating                DECIMAL(3,2),         -- 0.00 to 5.00
  rating_count          INTEGER               NOT NULL DEFAULT 0,
  is_discoverable       BOOLEAN               NOT NULL DEFAULT TRUE,
  has_dementia_training BOOLEAN               NOT NULL DEFAULT FALSE,
  updated_at            TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_caregiver_discoverable ON caregiver_profiles (is_discoverable)
  WHERE is_discoverable = TRUE;
 
 
CREATE TABLE family_profiles (
  user_id                   UUID          PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  relation_label            VARCHAR(50),                   -- e.g. 'Daughter', 'Son'
  notify_on_breach          BOOLEAN       NOT NULL DEFAULT TRUE,
  notify_on_missed_critical BOOLEAN       NOT NULL DEFAULT TRUE,
  notify_on_sos             BOOLEAN       NOT NULL DEFAULT TRUE,
  notify_on_daily_digest    BOOLEAN       NOT NULL DEFAULT TRUE,
  digest_frequency          VARCHAR(10)   NOT NULL DEFAULT 'DAILY',   -- DAILY | WEEKLY
  digest_time               TIME          NOT NULL DEFAULT '08:00:00',
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
 
 
-- ============================================================
