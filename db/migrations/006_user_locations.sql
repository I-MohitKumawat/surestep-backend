-- =============================================================================
-- SureStep — Migration 006: User Locations Table
-- Creates a table to hold the latest telemetry/locations for non-patient users
-- (caregivers and family members).
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_locations (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy_m FLOAT,
  speed_kmh FLOAT,
  heading FLOAT,
  battery_pct INTEGER,
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_locations_user ON user_locations(user_id);
