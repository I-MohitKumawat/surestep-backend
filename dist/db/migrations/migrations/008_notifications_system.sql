-- =============================================================================
-- SureStep — Migration 008: Safe creation & enhancement of notification_logs
-- =============================================================================

-- Create notification_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS notification_logs (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_id      UUID          REFERENCES geofence_alerts(id) ON DELETE SET NULL,
  channel       VARCHAR(20)   NOT NULL, -- 'FCM', 'WEBSOCKET', 'SMS'
  title         VARCHAR(200),
  body          TEXT,
  delivered     BOOLEAN       NOT NULL DEFAULT FALSE,
  opened        BOOLEAN       NOT NULL DEFAULT FALSE,
  delivered_at  TIMESTAMPTZ,
  opened_at     TIMESTAMPTZ,
  error_message TEXT,
  is_read       BOOLEAN       NOT NULL DEFAULT FALSE,
  read_at       TIMESTAMPTZ,
  payload       JSONB         NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_notif_user ON notification_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_unread ON notification_logs (user_id, is_read) WHERE is_read = FALSE;
