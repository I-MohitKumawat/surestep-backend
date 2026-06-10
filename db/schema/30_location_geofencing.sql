-- SECTION 7: LOCATION & GEOFENCING
-- ============================================================
 
CREATE TABLE location_pings (
  id               UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  lat              DOUBLE PRECISION  NOT NULL,
  lng              DOUBLE PRECISION  NOT NULL,
  accuracy_m       FLOAT,
  altitude_m       FLOAT,
  speed_kmh        FLOAT,
  heading          FLOAT,
  battery_pct      INTEGER,
  network_status   VARCHAR(30),
  source           location_source   NOT NULL DEFAULT 'PHONE',
  -- TRUE when ping was captured offline and synced later.
  -- Awareness engine ignores recorded_at for offline pings.
  is_offline_sync  BOOLEAN           NOT NULL DEFAULT FALSE,
  recorded_at      TIMESTAMPTZ       NOT NULL,  -- device timestamp
  received_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_pings_patient_time ON location_pings (patient_id, recorded_at DESC);
CREATE INDEX idx_pings_recent       ON location_pings (patient_id, received_at DESC);
 
 
CREATE TABLE geofence_zones (
  id                      UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id              UUID              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by              UUID              NOT NULL REFERENCES users(id),
  label                   VARCHAR(100)      NOT NULL,
  zone_type               zone_type         NOT NULL DEFAULT 'CUSTOM',
  center_lat              DOUBLE PRECISION  NOT NULL,
  center_lng              DOUBLE PRECISION  NOT NULL,
  radius_m                INTEGER           NOT NULL,
  boundary_type           boundary_type     NOT NULL DEFAULT 'SOFT',
  approach_threshold_pct  INTEGER           NOT NULL DEFAULT 80,
  is_active               BOOLEAN           NOT NULL DEFAULT TRUE,
  active_hours_start      TIME,             -- zone only evaluated after this time (local)
  active_hours_end        TIME,             -- zone only evaluated before this time (local)
  -- active_days: [0..6] where 0=Sunday. NULL = all days.
  active_days             INTEGER[],
  colour                  VARCHAR(7)        NOT NULL DEFAULT '#2E75B6',
  created_at              TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_zones_patient_active ON geofence_zones (patient_id)
  WHERE is_active = TRUE;
 
 
-- dedup_key prevents duplicate alert rows for the same physical event.
-- Format: {patient_id}:{alert_type}:{zone_id_or_null}:{date_hour}
CREATE TABLE geofence_alerts (
  id                    UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id            UUID              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  zone_id               UUID              REFERENCES geofence_zones(id),
  alert_type            alert_type        NOT NULL,
  severity              alert_severity    NOT NULL,
  status                alert_status      NOT NULL DEFAULT 'OPEN',
  lat                   DOUBLE PRECISION  NOT NULL,
  lng                   DOUBLE PRECISION  NOT NULL,
  distance_from_zone_m  INTEGER,
  stationary_duration_s INTEGER,          -- populated for STATIONARY_UNKNOWN alerts
  acknowledged_by       UUID              REFERENCES users(id),
  acknowledged_at       TIMESTAMPTZ,
  resolved_at           TIMESTAMPTZ,
  resolution_note       TEXT,
  dedup_key             VARCHAR(150)      UNIQUE,
  created_at            TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_geo_alerts_patient ON geofence_alerts (patient_id, created_at DESC);
CREATE INDEX idx_geo_alerts_open    ON geofence_alerts (patient_id, status)
  WHERE status = 'OPEN';
 
 
-- ============================================================
