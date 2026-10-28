-- =============================================================================
-- SureStep — Migration 019: Authoritative Subsystems Domain Foundation
-- =============================================================================
-- Aligns Routines, Location & Safe Zones, Safety Alerts, Memories, and Activities
-- directly with docs/architecture/TARGET_ARCHITECTURE.md (Sections 3.4–3.7).
--
-- Account Deletion Invariants (01-IDENTITY.md §6):
--   All user-level foreign keys use ON DELETE RESTRICT to prevent silent cascades.
--   Container-level cascades (circle_id, routine_id, etc.) are preserved.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. routine_definitions
-- Master template for daily recurring care tasks and medications.
-- Administered strictly by Patient or authorized Family Member coordinating care.
-- Caregivers cannot create/edit/pause/resume/delete definitions (04-PATIENT-CARE.md).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS routine_definitions (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title             VARCHAR(150)  NOT NULL,
  category          VARCHAR(30)   NOT NULL,
  description       TEXT          NULL,
  schedule_pattern  JSONB         NOT NULL DEFAULT '{}'::jsonb,
  is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
  created_by        UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_routine_category CHECK (
    category IN ('MEDICATION', 'MEAL', 'EXERCISE', 'HYGIENE', 'APPOINTMENT')
  ),
  CONSTRAINT chk_routine_title_len CHECK (char_length(trim(title)) >= 2)
);

CREATE INDEX IF NOT EXISTS idx_routine_definitions_patient
  ON routine_definitions (patient_id);

CREATE INDEX IF NOT EXISTS idx_routine_definitions_active
  ON routine_definitions (patient_id, is_active)
  WHERE is_active = TRUE;

-- -----------------------------------------------------------------------------
-- 2. routine_occurrences
-- Individual scheduled task instances generated from definitions.
-- Authoritative Overdue Rule: Scheduled -> Ongoing -> Completed / Overdue.
-- No Skip, Missed, or Snoozed states.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS routine_occurrences (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id        UUID          NOT NULL REFERENCES routine_definitions(id) ON DELETE CASCADE,
  patient_id        UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  scheduled_date    DATE          NOT NULL,
  scheduled_time    TIME          NOT NULL,
  status            VARCHAR(20)   NOT NULL DEFAULT 'SCHEDULED',
  started_at        TIMESTAMPTZ   NULL,
  completed_at      TIMESTAMPTZ   NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_occurrence_status CHECK (
    status IN ('SCHEDULED', 'ONGOING', 'COMPLETED', 'OVERDUE', 'CANCELLED')
  )
);

CREATE INDEX IF NOT EXISTS idx_routine_occurrences_patient_date
  ON routine_occurrences (patient_id, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_routine_occurrences_routine
  ON routine_occurrences (routine_id);

CREATE INDEX IF NOT EXISTS idx_routine_occurrences_status
  ON routine_occurrences (patient_id, status);

-- -----------------------------------------------------------------------------
-- 3. routine_completions
-- Operational sign-off record for routine occurrence completion.
-- Allowed for Patient, authorized Family, or assigned Caregiver (04-PATIENT-CARE.md).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS routine_completions (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id     UUID          NOT NULL REFERENCES routine_occurrences(id) ON DELETE CASCADE,
  completed_by      UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  completion_source VARCHAR(30)   NOT NULL,
  notes             TEXT          NULL,
  completed_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_completion_source CHECK (
    completion_source IN ('PATIENT_SELF', 'CAREGIVER_ASSISTED', 'FAMILY')
  ),
  CONSTRAINT uq_routine_occurrence_completion UNIQUE (occurrence_id)
);

CREATE INDEX IF NOT EXISTS idx_routine_completions_occurrence
  ON routine_completions (occurrence_id);

CREATE INDEX IF NOT EXISTS idx_routine_completions_user
  ON routine_completions (completed_by);

-- -----------------------------------------------------------------------------
-- 4. safe_zones
-- Geofenced circular boundaries owned by the Care Circle (TARGET_ARCHITECTURE.md §3.5).
-- Circle Owner only CRUD. No polygon boundaries.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS safe_zones (
  id                UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id         UUID              NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
  name              VARCHAR(100)      NOT NULL,
  center_lat        DOUBLE PRECISION  NOT NULL,
  center_lng        DOUBLE PRECISION  NOT NULL,
  radius_meters     INTEGER           NOT NULL,
  is_active         BOOLEAN           NOT NULL DEFAULT TRUE,
  created_by        UUID              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_safe_zone_radius CHECK (radius_meters >= 50 AND radius_meters <= 10000),
  CONSTRAINT chk_safe_zone_lat CHECK (center_lat >= -90.0 AND center_lat <= 90.0),
  CONSTRAINT chk_safe_zone_lng CHECK (center_lng >= -180.0 AND center_lng <= 180.0),
  CONSTRAINT chk_safe_zone_name_len CHECK (char_length(trim(name)) >= 2)
);

CREATE INDEX IF NOT EXISTS idx_safe_zones_circle
  ON safe_zones (circle_id);

CREATE INDEX IF NOT EXISTS idx_safe_zones_active
  ON safe_zones (circle_id, is_active)
  WHERE is_active = TRUE;

-- -----------------------------------------------------------------------------
-- 5. safe_zone_monitors
-- Junction table linking Patients to Circle Safe Zones.
-- Circle Owner only manages attachment/detachment.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS safe_zone_monitors (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  safe_zone_id      UUID          NOT NULL REFERENCES safe_zones(id) ON DELETE CASCADE,
  patient_id        UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  attached_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_safe_zone_patient_monitor UNIQUE (safe_zone_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_safe_zone_monitors_zone
  ON safe_zone_monitors (safe_zone_id);

CREATE INDEX IF NOT EXISTS idx_safe_zone_monitors_patient
  ON safe_zone_monitors (patient_id);

-- -----------------------------------------------------------------------------
-- 6. location_observations
-- Raw time-series GPS observations emitted by Patient devices.
-- Stale/offline observations do NOT trigger retrospective breach alerts.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS location_observations (
  id                UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        UUID              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  lat               DOUBLE PRECISION  NOT NULL,
  lng               DOUBLE PRECISION  NOT NULL,
  accuracy_meters   DOUBLE PRECISION  NOT NULL,
  altitude_meters   DOUBLE PRECISION  NULL,
  battery_pct       INTEGER           NULL,
  is_charging       BOOLEAN           NOT NULL DEFAULT FALSE,
  recorded_at       TIMESTAMPTZ       NOT NULL,
  received_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_location_obs_battery CHECK (battery_pct IS NULL OR (battery_pct >= 0 AND battery_pct <= 100))
);

CREATE INDEX IF NOT EXISTS idx_location_obs_patient_recorded
  ON location_observations (patient_id, recorded_at DESC);

-- -----------------------------------------------------------------------------
-- 7. safety_alerts
-- Critical safety incidents (SOS and Safe Zone breaches).
-- State lifecycle: TRIGGERED -> ACTIVE -> VIEWED -> RESOLVED.
-- Human resolution is strictly Circle Owner only in V1.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS safety_alerts (
  id                UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id         UUID              NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
  patient_id        UUID              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  alert_type        VARCHAR(30)       NOT NULL,
  status            VARCHAR(20)       NOT NULL DEFAULT 'TRIGGERED',
  trigger_lat       DOUBLE PRECISION  NULL,
  trigger_lng       DOUBLE PRECISION  NULL,
  safe_zone_id      UUID              NULL REFERENCES safe_zones(id) ON DELETE SET NULL,
  dedup_key         VARCHAR(128)      NOT NULL UNIQUE,
  triggered_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ       NULL,
  resolved_by       UUID              NULL REFERENCES users(id) ON DELETE RESTRICT,

  CONSTRAINT chk_safety_alert_type CHECK (alert_type IN ('SOS_MANUAL', 'ZONE_BREACH')),
  CONSTRAINT chk_safety_alert_status CHECK (status IN ('TRIGGERED', 'ACTIVE', 'VIEWED', 'RESOLVED'))
);

CREATE INDEX IF NOT EXISTS idx_safety_alerts_circle_status
  ON safety_alerts (circle_id, status);

CREATE INDEX IF NOT EXISTS idx_safety_alerts_patient_status
  ON safety_alerts (patient_id, status);

-- -----------------------------------------------------------------------------
-- 8. safety_alert_responses
-- Operational responder action records explicitly decoupled from alert state.
-- Action 'IM_RESPONDING' logs engagement without resolving or claiming exclusive ownership.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS safety_alert_responses (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id          UUID          NOT NULL REFERENCES safety_alerts(id) ON DELETE CASCADE,
  responder_id      UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action            VARCHAR(20)   NOT NULL,
  notes             TEXT          NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_safety_alert_response_action CHECK (action IN ('IM_RESPONDING', 'RESOLVED'))
);

CREATE INDEX IF NOT EXISTS idx_safety_alert_responses_alert
  ON safety_alert_responses (alert_id);

CREATE INDEX IF NOT EXISTS idx_safety_alert_responses_responder
  ON safety_alert_responses (responder_id);

-- -----------------------------------------------------------------------------
-- 9. memories
-- Familiar memory content (photos, videos, text) for connected care audience.
-- Gated by canonical delegatable permission 'Manage Patient Memories'.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memories (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id            UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  creator_id            UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title                 VARCHAR(150)  NOT NULL,
  media_type            VARCHAR(20)   NOT NULL,
  media_key             TEXT          NULL,
  caption               TEXT          NULL,
  associated_person_id  UUID          NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_memory_media_type CHECK (media_type IN ('PHOTO', 'VIDEO', 'TEXT')),
  CONSTRAINT chk_memory_title_len CHECK (char_length(trim(title)) >= 1)
);

CREATE INDEX IF NOT EXISTS idx_memories_patient
  ON memories (patient_id);

CREATE INDEX IF NOT EXISTS idx_memories_creator
  ON memories (creator_id);

-- -----------------------------------------------------------------------------
-- 10. activity_attempts
-- Observational logs of voluntary cognitive/familiarity engagement activities.
-- Strictly NO dementia clinical progression scores or diagnostic ML.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_attempts (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  activity_type     VARCHAR(30)   NOT NULL,
  duration_seconds  INTEGER       NOT NULL DEFAULT 0,
  completed         BOOLEAN       NOT NULL DEFAULT FALSE,
  metrics           JSONB         NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_activity_type CHECK (activity_type IN ('PHOTO_MATCH', 'PUZZLE', 'BREATHING_GUIDE'))
);

CREATE INDEX IF NOT EXISTS idx_activity_attempts_patient
  ON activity_attempts (patient_id, created_at DESC);

