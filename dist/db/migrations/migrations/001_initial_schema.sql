-- =============================================================================
-- SureStep — Complete Schema Migration
-- Migration: 001_initial_schema
-- Auth: Firebase Admin SDK (firebase_uid replaces clerk_id)
-- Run once on a fresh database. Idempotent via IF NOT EXISTS guards.
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- ENUMS
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('PATIENT','CAREGIVER','FAMILY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE relationship_type AS ENUM (
    'CAREGIVER','GUARDIAN','FAMILY_CLOSE','FAMILY_EXTENDED','DOCTOR'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE relationship_status AS ENUM ('PENDING','CONFIRMED','SUSPENDED','ENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('PENDING','DONE','MISSED','UNSURE','SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE recurrence_type AS ENUM ('NONE','DAILY','WEEKLY','CUSTOM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE location_source AS ENUM ('PHONE','WEARABLE','GLASS','MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE zone_type AS ENUM ('HOME','CLINIC','PARK','PHARMACY','TEMPLE','MARKET','CUSTOM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE boundary_type AS ENUM ('SOFT','HARD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE alert_type AS ENUM (
    'ZONE_EXIT','ZONE_ENTER','APPROACHING',
    'STATIONARY_UNKNOWN','ERRATIC_MOVEMENT','NO_SIGNAL',
    'FALL_DETECTED','SOS_TRIGGERED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE alert_severity AS ENUM ('INFO','WARNING','CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE location_state AS ENUM ('MOVING','STATIONARY_KNOWN','STATIONARY_UNKNOWN','NO_SIGNAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE safety_state AS ENUM ('SAFE','APPROACHING','BREACH','CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE routine_state AS ENUM ('ON_TRACK','BEHIND','MISSED_CRITICAL','ALL_DONE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE engagement_state AS ENUM ('ACTIVE','IDLE','NO_INTERACTION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE voice_trigger AS ENUM (
    'MANUAL','AUTO_STATIONARY','AUTO_DISORIENTED','AUTO_ROUTINE','SCHEDULED','SOS'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE clone_status AS ENUM ('RAW','PROCESSING','READY','FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE message_status AS ENUM ('QUEUED','GENERATING','DELIVERED','FAILED','SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE game_type AS ENUM (
    'MEMORY_MATCH','WORD_FINDER','COLOR_SORT',
    'SOUND_RECALL','FACE_RECOGNITION',
    'ORIENTATION_CHECK','PICTURE_PUZZLE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE metric_type AS ENUM (
    'REACTION_TIME_MS','RECALL_ACCURACY','SEQUENCE_ERROR',
    'TOUCH_HESITATION_MS','ORIENTATION_CORRECT','FACE_RECOGNISED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cog_trend AS ENUM ('IMPROVING','STABLE','DECLINING','INSUFFICIENT_DATA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE device_type AS ENUM ('PHONE_IOS','PHONE_ANDROID','WEARABLE','GLASS','HOME_HUB');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE message_type AS ENUM ('TEXT','VOICE_MEMO','PHOTO','STORY_POST','SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('PENDING','COMPLETED','FAILED','REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE subscription_tier AS ENUM ('FREE','BASIC','PREMIUM','AGENCY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- IDENTITY & AUTH (Firebase-based — firebase_uid is the external identity key)
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid        VARCHAR(200) NOT NULL UNIQUE, -- Firebase UID (e.g. "abc123XYZ")
  email               VARCHAR(255) UNIQUE,           -- from Firebase auth token
  phone               VARCHAR(20)  UNIQUE,           -- E.164 format
  name                VARCHAR(100) NOT NULL,
  role                user_role    NOT NULL,
  date_of_birth       DATE,
  gender              VARCHAR(20),
  preferred_language  VARCHAR(10)  NOT NULL DEFAULT 'en',
  city                VARCHAR(100),
  photo_url           TEXT,
  is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
  onboarding_complete BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_firebase  ON users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_phone     ON users(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role      ON users(role);

-- Device / FCM token registry (Firebase handles auth sessions — we only track devices for push)
CREATE TABLE IF NOT EXISTS device_registry (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_type  device_type NOT NULL,
  device_token TEXT        NOT NULL,  -- FCM token
  device_name  VARCHAR(100),
  os_version   VARCHAR(20),
  app_version  VARCHAR(20),
  is_primary   BOOLEAN     NOT NULL DEFAULT FALSE,
  last_seen_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_user ON device_registry(user_id);

-- =============================================================================
-- PROFILES
-- =============================================================================

CREATE TABLE IF NOT EXISTS patient_profiles (
  user_id                 UUID    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  emergency_contact_name  VARCHAR(100),
  emergency_contact_phone VARCHAR(20),
  diagnosis               VARCHAR(100),
  diagnosis_date          DATE,
  medications             JSONB   NOT NULL DEFAULT '[]',
  known_triggers          TEXT[]  NOT NULL DEFAULT '{}',
  comfort_items           TEXT[]  NOT NULL DEFAULT '{}',
  favourite_songs         JSONB   NOT NULL DEFAULT '[]',
  cognitive_baseline_date DATE,
  nimhans_patient_id      VARCHAR(50),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS caregiver_profiles (
  user_id              UUID           PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  years_of_experience  INTEGER        NOT NULL DEFAULT 0,
  specializations      TEXT[]         NOT NULL DEFAULT '{}',
  languages_spoken     TEXT[]         NOT NULL DEFAULT '{}',
  availability_types   TEXT[]         NOT NULL DEFAULT '{}',
  service_radius_km    INTEGER        NOT NULL DEFAULT 10,
  max_patients         INTEGER        NOT NULL DEFAULT 3,
  hourly_rate          DECIMAL(10,2),
  daily_rate           DECIMAL(10,2),
  bio                  TEXT,
  is_verified          BOOLEAN        NOT NULL DEFAULT FALSE,
  verification_method  VARCHAR(50),
  verification_date    DATE,
  rating               DECIMAL(3,2),
  rating_count         INTEGER        NOT NULL DEFAULT 0,
  is_discoverable      BOOLEAN        NOT NULL DEFAULT TRUE,
  updated_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS family_profiles (
  user_id                     UUID    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  notification_digest_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  digest_frequency            VARCHAR(20) NOT NULL DEFAULT 'DAILY',
  whatsapp_number             VARCHAR(20),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- RELATIONSHIPS
-- =============================================================================

CREATE TABLE IF NOT EXISTS patient_relationships (
  id                UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id   UUID                NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  related_user_id   UUID                NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship_type relationship_type   NOT NULL,
  status            relationship_status NOT NULL DEFAULT 'PENDING',
  invited_by        UUID                REFERENCES users(id),
  invite_token      VARCHAR(64)         UNIQUE,
  invite_expires_at TIMESTAMPTZ,
  confirmed_at      TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  UNIQUE(patient_user_id, related_user_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_rel_patient ON patient_relationships(patient_user_id, status);
CREATE INDEX IF NOT EXISTS idx_rel_related ON patient_relationships(related_user_id, status);
CREATE INDEX IF NOT EXISTS idx_rel_token   ON patient_relationships(invite_token) WHERE invite_token IS NOT NULL;

-- =============================================================================
-- ROUTINES & TASKS
-- =============================================================================

CREATE TABLE IF NOT EXISTS routine_templates (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by       UUID        NOT NULL REFERENCES users(id),
  title            VARCHAR(100) NOT NULL,
  description      TEXT,
  emoji            VARCHAR(10),
  steps            JSONB       NOT NULL DEFAULT '[]',
  patient_hint     TEXT,
  duration_minutes INTEGER     NOT NULL DEFAULT 15,
  is_library_item  BOOLEAN     NOT NULL DEFAULT FALSE,
  category         VARCHAR(50),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id               UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by      UUID            NOT NULL REFERENCES users(id),
  template_id      UUID            REFERENCES routine_templates(id),
  title            VARCHAR(100)    NOT NULL,
  description      TEXT,
  patient_hint     TEXT,
  emoji            VARCHAR(10),
  steps            JSONB           NOT NULL DEFAULT '[]',
  scheduled_time   TIME            NOT NULL,
  scheduled_date   DATE            NOT NULL,
  duration_minutes INTEGER         NOT NULL DEFAULT 15,
  is_critical      BOOLEAN         NOT NULL DEFAULT FALSE,
  status           task_status     NOT NULL DEFAULT 'PENDING',
  completed_at     TIMESTAMPTZ,
  caregiver_note   TEXT,
  voice_note_url   TEXT,
  recurrence_type  recurrence_type NOT NULL DEFAULT 'NONE',
  recurrence_days  INTEGER[],
  recurrence_end   DATE,
  parent_task_id   UUID            REFERENCES tasks(id),
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_patient_date ON tasks(patient_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status       ON tasks(patient_id, status);

-- =============================================================================
-- LOCATION & GEOFENCING
-- =============================================================================

CREATE TABLE IF NOT EXISTS location_pings (
  id          UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  accuracy_m  FLOAT,
  source      location_source  NOT NULL DEFAULT 'PHONE',
  speed_kmh   FLOAT,
  heading     FLOAT,
  battery_pct INTEGER,
  recorded_at TIMESTAMPTZ      NOT NULL,
  received_at TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pings_patient_time ON location_pings(patient_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS geofence_zones (
  id                     UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id             UUID             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by             UUID             NOT NULL REFERENCES users(id),
  label                  VARCHAR(100)     NOT NULL,
  zone_type              zone_type        NOT NULL DEFAULT 'CUSTOM',
  center_lat             DOUBLE PRECISION NOT NULL,
  center_lng             DOUBLE PRECISION NOT NULL,
  radius_m               INTEGER          NOT NULL,
  boundary_type          boundary_type    NOT NULL DEFAULT 'SOFT',
  approach_threshold_pct INTEGER          NOT NULL DEFAULT 80,
  is_active              BOOLEAN          NOT NULL DEFAULT TRUE,
  active_hours_start     TIME,
  active_hours_end       TIME,
  created_at             TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zones_patient ON geofence_zones(patient_id, is_active);

CREATE TABLE IF NOT EXISTS geofence_alerts (
  id                   UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id           UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  zone_id              UUID           REFERENCES geofence_zones(id),
  alert_type           alert_type     NOT NULL,
  severity             alert_severity NOT NULL,
  lat                  DOUBLE PRECISION NOT NULL,
  lng                  DOUBLE PRECISION NOT NULL,
  distance_from_zone_m INTEGER,
  acknowledged_by      UUID           REFERENCES users(id),
  acknowledged_at      TIMESTAMPTZ,
  resolved_at          TIMESTAMPTZ,
  dedup_key            VARCHAR(100)   UNIQUE,
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_galerts_patient ON geofence_alerts(patient_id, created_at DESC);

-- =============================================================================
-- AWARENESS ENGINE
-- =============================================================================

CREATE TABLE IF NOT EXISTS patient_states (
  patient_id              UUID             PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  location_state          location_state   NOT NULL DEFAULT 'NO_SIGNAL',
  safety_state            safety_state     NOT NULL DEFAULT 'SAFE',
  routine_state           routine_state    NOT NULL DEFAULT 'ON_TRACK',
  engagement_state        engagement_state NOT NULL DEFAULT 'NO_INTERACTION',
  last_known_lat          DOUBLE PRECISION,
  last_known_lng          DOUBLE PRECISION,
  last_ping_at            TIMESTAMPTZ,
  stationary_since        TIMESTAMPTZ,
  voice_last_triggered_at TIMESTAMPTZ,
  sos_active              BOOLEAN          NOT NULL DEFAULT FALSE,
  computed_at             TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS caregiver_handovers (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_caregiver UUID        NOT NULL REFERENCES users(id),
  to_caregiver   UUID        REFERENCES users(id),
  mood_today     VARCHAR(30),
  tasks_summary  TEXT,
  anomalies      TEXT,
  medications_ok BOOLEAN     NOT NULL DEFAULT TRUE,
  watch_for      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- VOICE SYSTEM
-- =============================================================================

CREATE TABLE IF NOT EXISTS voice_samples (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_by      UUID         NOT NULL REFERENCES users(id),
  patient_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label            VARCHAR(100) NOT NULL,
  storage_path     TEXT         NOT NULL,
  duration_seconds INTEGER      NOT NULL,
  quality_score    FLOAT,
  consent_given_at TIMESTAMPTZ  NOT NULL,
  clone_status     clone_status NOT NULL DEFAULT 'RAW',
  clone_voice_id   VARCHAR(100),
  clone_consent_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS voice_messages (
  id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id       UUID           REFERENCES users(id),
  trigger_type    voice_trigger  NOT NULL,
  voice_sample_id UUID           REFERENCES voice_samples(id),
  script          TEXT           NOT NULL,
  audio_url       TEXT,
  status          message_status NOT NULL DEFAULT 'QUEUED',
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vmsg_patient ON voice_messages(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vmsg_status  ON voice_messages(status, created_at) WHERE status IN ('QUEUED','GENERATING');

-- =============================================================================
-- FAMILIARITY ENGINE
-- =============================================================================

CREATE TABLE IF NOT EXISTS familiarity_faces (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uploaded_by        UUID        NOT NULL REFERENCES users(id),
  person_name        VARCHAR(100) NOT NULL,
  relationship_label VARCHAR(60)  NOT NULL,
  photo_url          TEXT        NOT NULL,
  display_order      INTEGER     NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faces_patient_order ON familiarity_faces(patient_id, display_order);

CREATE TABLE IF NOT EXISTS family_story_posts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  posted_by       UUID        NOT NULL REFERENCES users(id),
  caption         TEXT,
  photo_url       TEXT,
  voice_note_url  TEXT,
  is_approved     BOOLEAN     NOT NULL DEFAULT TRUE,
  patient_reacted BOOLEAN     NOT NULL DEFAULT FALSE,
  reaction_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_patient ON family_story_posts(patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS memory_items (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uploaded_by   UUID        NOT NULL REFERENCES users(id),
  title         VARCHAR(200) NOT NULL,
  description   TEXT,
  photo_url     TEXT,
  voice_note_url TEXT,
  year          INTEGER,
  last_shown_at TIMESTAMPTZ,
  show_count    INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_patient_shown ON memory_items(patient_id, last_shown_at NULLS FIRST);

-- =============================================================================
-- COGNITIVE ASSESSMENT
-- =============================================================================

CREATE TABLE IF NOT EXISTS game_sessions (
  id               UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_type        game_type NOT NULL,
  difficulty_level INTEGER   NOT NULL DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 5),
  duration_seconds INTEGER   NOT NULL,
  completed        BOOLEAN   NOT NULL DEFAULT FALSE,
  score            INTEGER,
  error_count      INTEGER   NOT NULL DEFAULT 0,
  hint_count       INTEGER   NOT NULL DEFAULT 0,
  played_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_patient ON game_sessions(patient_id, played_at DESC);

CREATE TABLE IF NOT EXISTS game_metrics (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  metric_type metric_type NOT NULL,
  value       FLOAT       NOT NULL,
  context     JSONB,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_session ON game_metrics(session_id);

CREATE TABLE IF NOT EXISTS cognitive_assessments (
  id                   UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id           UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start         DATE      NOT NULL,
  period_end           DATE      NOT NULL,
  memory_score         FLOAT,
  attention_score      FLOAT,
  language_score       FLOAT,
  orientation_score    FLOAT,
  visuospatial_score   FLOAT,
  reaction_time_avg_ms FLOAT,
  sessions_count       INTEGER   NOT NULL DEFAULT 0,
  trend                cog_trend,
  clinician_notes      TEXT,
  computed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(patient_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_cog_patient ON cognitive_assessments(patient_id, period_start DESC);

-- =============================================================================
-- MESSAGING & CALENDAR
-- =============================================================================

CREATE TABLE IF NOT EXISTS patient_threads (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS thread_messages (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id    UUID         NOT NULL REFERENCES patient_threads(id) ON DELETE CASCADE,
  sender_id    UUID         NOT NULL REFERENCES users(id),
  message_type message_type NOT NULL DEFAULT 'TEXT',
  content      TEXT,
  media_url    TEXT,
  is_read_by   UUID[]       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tmsg_thread ON thread_messages(thread_id, created_at DESC);

CREATE TABLE IF NOT EXISTS appointments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by       UUID        NOT NULL REFERENCES users(id),
  title            VARCHAR(200) NOT NULL,
  location         TEXT,
  notes            TEXT,
  appointment_at   TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER     NOT NULL DEFAULT 60,
  transport_needed BOOLEAN     NOT NULL DEFAULT FALSE,
  reminder_sent    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appt_patient ON appointments(patient_id, appointment_at);

CREATE TABLE IF NOT EXISTS shared_documents (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uploaded_by   UUID        NOT NULL REFERENCES users(id),
  title         VARCHAR(200) NOT NULL,
  document_type VARCHAR(60)  NOT NULL,
  storage_path  TEXT        NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- CAREGIVER WELLBEING
-- =============================================================================

CREATE TABLE IF NOT EXISTS caregiver_wellbeing_logs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mood_score        INTEGER     NOT NULL CHECK (mood_score BETWEEN 1 AND 5),
  shift_note        TEXT,
  alert_count_today INTEGER     NOT NULL DEFAULT 0,
  burnout_flag      BOOLEAN     NOT NULL DEFAULT FALSE,
  logged_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wellbeing_cg ON caregiver_wellbeing_logs(caregiver_id, logged_at DESC);

-- =============================================================================
-- PAYMENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id                   UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  family_user_id       UUID              NOT NULL REFERENCES users(id),
  patient_user_id      UUID              NOT NULL REFERENCES users(id),
  tier                 subscription_tier NOT NULL DEFAULT 'FREE',
  razorpay_sub_id      VARCHAR(100),
  status               VARCHAR(30)       NOT NULL DEFAULT 'ACTIVE',
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  created_at           TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_subscription_family_patient UNIQUE (family_user_id, patient_user_id)
);

CREATE TABLE IF NOT EXISTS caregiver_payments (
  id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  from_family_id    UUID           NOT NULL REFERENCES users(id),
  to_caregiver_id   UUID           NOT NULL REFERENCES users(id),
  patient_id        UUID           NOT NULL REFERENCES users(id),
  amount            DECIMAL(12,2)  NOT NULL,
  commission_amount DECIMAL(12,2)  NOT NULL DEFAULT 0,
  currency          VARCHAR(3)     NOT NULL DEFAULT 'INR',
  razorpay_order_id VARCHAR(100),
  status            payment_status NOT NULL DEFAULT 'PENDING',
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS caregiver_ratings (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id UUID        NOT NULL REFERENCES users(id),
  rated_by     UUID        NOT NULL REFERENCES users(id),
  patient_id   UUID        NOT NULL REFERENCES users(id),
  score        INTEGER     NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(caregiver_id, rated_by, patient_id)
);

CREATE TABLE IF NOT EXISTS incident_reports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_by   UUID        NOT NULL REFERENCES users(id),
  reported_user UUID        NOT NULL REFERENCES users(id),
  patient_id    UUID        NOT NULL REFERENCES users(id),
  description   TEXT        NOT NULL,
  status        VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  reviewed_by   UUID        REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  resolution    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
