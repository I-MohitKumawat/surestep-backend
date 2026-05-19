-- SECTION 21: NOTIFICATION LOGS
-- ============================================================
 
CREATE TABLE notification_logs (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          NOT NULL REFERENCES users(id),
  alert_id      UUID          REFERENCES alerts(id),
  -- channel: 'FCM' | 'WEBSOCKET' | 'SMS'
  channel       VARCHAR(20)   NOT NULL,
  title         VARCHAR(200),
  body          TEXT,
  delivered     BOOLEAN       NOT NULL DEFAULT FALSE,
  opened        BOOLEAN       NOT NULL DEFAULT FALSE,
  delivered_at  TIMESTAMPTZ,
  opened_at     TIMESTAMPTZ,
  error_message TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_notif_user ON notification_logs (user_id, created_at DESC);
 
 
-- ============================================================
