-- SECTION 19: DEVICE REGISTRY
-- ============================================================
 
-- One row per registered device per user.
-- source column on all sensor tables references device_type here.
-- Future wearable and glass devices register here before sending data.
CREATE TABLE device_registry (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_type   device_type   NOT NULL,
  device_id     VARCHAR(200)  NOT NULL,    -- client-generated fingerprint
  device_name   VARCHAR(100),
  os_version    VARCHAR(30),
  app_version   VARCHAR(20),
  fcm_token     TEXT,
  is_primary    BOOLEAN       NOT NULL DEFAULT FALSE,
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_device_user UNIQUE (user_id, device_id)
);
 
CREATE INDEX idx_devices_user ON device_registry (user_id);
 
 
-- ============================================================
