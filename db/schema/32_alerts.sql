-- SECTION 9: ALERTS
-- ============================================================
 
-- Unified alerts table for all alert types across all modules.
-- context JSONB carries alert-type-specific data:
-- e.g. for TASK_MISSED_CRITICAL: {task_id, task_title, scheduled_time}
-- e.g. for ZONE_EXIT: {zone_id, zone_label, distance_m}
-- e.g. for SOS_TRIGGERED: {lat, lng, triggered_by}
CREATE TABLE alerts (
  id                UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  alert_type        alert_type      NOT NULL,
  severity          alert_severity  NOT NULL,
  status            alert_status    NOT NULL DEFAULT 'OPEN',
  title             VARCHAR(200)    NOT NULL,
  body              TEXT,
  context           JSONB,
  -- escalation_level: 1=info(in-app only) 2=warning(push) 3=critical(push+SMS+family)
  escalation_level  INTEGER         NOT NULL DEFAULT 1,
  notified_user_ids UUID[],         -- IDs that received push notifications
  acknowledged_by   UUID            REFERENCES users(id),
  acknowledged_at   TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  dedup_key         VARCHAR(150)    UNIQUE,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_alerts_patient_open ON alerts (patient_id, status) WHERE status = 'OPEN';
CREATE INDEX idx_alerts_patient_time ON alerts (patient_id, created_at DESC);
 
 
-- ============================================================
