-- =============================================================================
-- SureStep — Migration 009: Centralized Notifications & Reminder System
-- =============================================================================

-- 1. Enhance notification_logs table with model fields
ALTER TABLE notification_logs 
  ADD COLUMN IF NOT EXISTS recipient_role VARCHAR(20),
  ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notification_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS action_link TEXT;

-- 2. Create notification_settings table
DROP TABLE IF EXISTS notification_settings CASCADE;
CREATE TABLE notification_settings (
  user_id             UUID          PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role                VARCHAR(20)   NOT NULL,
  
  -- Patient settings
  reminder_sounds     BOOLEAN       NOT NULL DEFAULT TRUE,
  reminder_vibration  BOOLEAN       NOT NULL DEFAULT TRUE,
  reminder_volume     DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  reminder_frequency  INTEGER       NOT NULL DEFAULT 5, -- repeat snooze time in minutes
  
  -- Caregiver settings
  alert_categories    JSONB         NOT NULL DEFAULT '["GEOFENCE", "SOS", "OFFLINE", "ROUTINE", "ASSESSMENT"]'::jsonb,
  quiet_hours_start   TIME          DEFAULT NULL,
  quiet_hours_end     TIME          DEFAULT NULL,
  escalation_pref     VARCHAR(20)   NOT NULL DEFAULT 'IMMEDIATE',
  
  -- Family settings
  digest_frequency    VARCHAR(20)   NOT NULL DEFAULT 'DAILY',
  critical_alert_pref VARCHAR(20)   NOT NULL DEFAULT 'ALL',
  
  -- Configurable escalation rules (Part 4)
  escalation_rules    JSONB         NOT NULL DEFAULT '[
    {"level": 1, "offset_minutes": 10, "action": "NOTIFY_PATIENT_REPEAT"},
    {"level": 2, "offset_minutes": 20, "action": "NOTIFY_PATIENT_REPEAT"},
    {"level": 3, "offset_minutes": 30, "action": "MARK_MISSED"},
    {"level": 4, "offset_minutes": 45, "action": "NOTIFY_CAREGIVER"},
    {"level": 5, "offset_minutes": 60, "action": "NOTIFY_FAMILY"}
  ]'::jsonb,

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 3. Create reminders table
DROP TABLE IF EXISTS reminders CASCADE;
CREATE TABLE reminders (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reference_id        UUID,
  reference_type      VARCHAR(50)   NOT NULL, -- 'ROUTINE', 'MEDICATION', 'APPOINTMENT', 'CUSTOM'
  title               VARCHAR(200)  NOT NULL,
  body                TEXT,
  scheduled_at        TIMESTAMPTZ   NOT NULL,
  state               VARCHAR(20)   NOT NULL DEFAULT 'SCHEDULED', -- 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'SNOOZED', 'MISSED'
  snooze_count        INTEGER       NOT NULL DEFAULT 0,
  snoozed_until       TIMESTAMPTZ,
  escalation_level    INTEGER       NOT NULL DEFAULT 0,
  last_escalated_at   TIMESTAMPTZ,
  history             JSONB         NOT NULL DEFAULT '[]'::jsonb,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reminders_patient ON reminders (patient_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_reminders_state_sched ON reminders (state, scheduled_at) WHERE state IN ('SCHEDULED', 'ACTIVE', 'SNOOZED');
