-- SECTION 8: AWARENESS ENGINE
-- ============================================================
 
-- One live row per patient. Updated in-place on every state evaluation.
-- This is the materialised current state used by caregiver triage
-- and family peace-of-mind feed.
CREATE TABLE patient_states (
  patient_id               UUID              PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  location_state           location_state    NOT NULL DEFAULT 'NO_SIGNAL',
  safety_state             safety_state      NOT NULL DEFAULT 'SAFE',
  routine_state            routine_state     NOT NULL DEFAULT 'ON_TRACK',
  engagement_state         engagement_state  NOT NULL DEFAULT 'NO_INTERACTION',
  last_known_lat           DOUBLE PRECISION,
  last_known_lng           DOUBLE PRECISION,
  last_known_zone_id       UUID              REFERENCES geofence_zones(id),
  last_ping_at             TIMESTAMPTZ,
  last_interaction_at      TIMESTAMPTZ,
  stationary_since         TIMESTAMPTZ,      -- when current stationary period began
  stationary_duration_s    INTEGER,          -- seconds stationary, updated each ping
  tasks_total_today        INTEGER           NOT NULL DEFAULT 0,
  tasks_done_today         INTEGER           NOT NULL DEFAULT 0,
  tasks_missed_today       INTEGER           NOT NULL DEFAULT 0,
  mood_last_score          INTEGER,          -- 1=poor 2=okay 3=good
  mood_recorded_at         TIMESTAMPTZ,
  voice_last_triggered_at  TIMESTAMPTZ,      -- cooldown enforcement for voice triggers
  battery_pct              INTEGER,
  computed_at              TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);
 
 
-- Append-only log of every state dimension transition.
-- Used for anomaly detection, RAG analytics, and caregiver reports.
CREATE TABLE patient_state_history (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- dimension: 'location' | 'safety' | 'routine' | 'engagement'
  dimension       VARCHAR(30)   NOT NULL,
  from_state      VARCHAR(30)   NOT NULL,
  to_state        VARCHAR(30)   NOT NULL,
  -- trigger_source: 'location_ping' | 'task_completion' | 'manual' | 'timeout_job'
  trigger_source  VARCHAR(50),
  context         JSONB,        -- additional data about the transition
  occurred_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_state_history_patient ON patient_state_history (patient_id, occurred_at DESC);
CREATE INDEX idx_state_history_dim     ON patient_state_history (patient_id, dimension, occurred_at DESC);
 
 
-- ============================================================
