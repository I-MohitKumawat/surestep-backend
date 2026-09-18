-- =============================================================================
-- SureStep — Migration 004: Geofencing MVP Enhancements
-- Adds notify_on_arrival/departure toggles to geofence_zones
-- and colour column for UI theming.
-- Idempotent via IF NOT EXISTS / DO NOTHING guards.
-- =============================================================================

-- Add arrival/departure notification toggle columns to geofence_zones
ALTER TABLE geofence_zones
  ADD COLUMN IF NOT EXISTS notify_on_arrival   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_on_departure  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS colour               VARCHAR(7) NOT NULL DEFAULT '#2563EB';

-- Add updated_at for geofence_zones if missing (schema file omits it)
ALTER TABLE geofence_zones
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Add is_offline_sync flag to location_pings if missing
ALTER TABLE location_pings
  ADD COLUMN IF NOT EXISTS is_offline_sync BOOLEAN NOT NULL DEFAULT FALSE;

-- Ensure status column exists on geofence_alerts (some schema versions omit it)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_status') THEN
    CREATE TYPE alert_status AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'geofence_alerts' AND column_name = 'status'
  ) THEN
    ALTER TABLE geofence_alerts ADD COLUMN status alert_status NOT NULL DEFAULT 'OPEN';
  END IF;
END $$;

-- Ensure columns exist on patient_states
ALTER TABLE patient_states
  ADD COLUMN IF NOT EXISTS sos_active BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_known_zone_id UUID REFERENCES geofence_zones(id) ON DELETE SET NULL;

-- Add additional index for open alert queries if missing
CREATE INDEX IF NOT EXISTS idx_galerts_patient_open
  ON geofence_alerts (patient_id, created_at DESC)
  WHERE acknowledged_at IS NULL;

-- Add index for zone notifications
CREATE INDEX IF NOT EXISTS idx_zones_active_patient
  ON geofence_zones (patient_id)
  WHERE is_active = TRUE;

-- Register device_token column alias (migration 001 uses device_token, schema file uses fcm_token — ensure both work)
ALTER TABLE device_registry
  ADD COLUMN IF NOT EXISTS device_id VARCHAR(200);

-- Backfill device_id from device_token where null
UPDATE device_registry SET device_id = device_token WHERE device_id IS NULL;
