-- =============================================================================
-- SureStep — Migration 005: Alert Synchronization Updates
-- Adds columns to geofence_alerts to track responder details
-- and appends 'RESPONDING' status to alert_status type.
-- Run outside of transaction block if required.
-- =============================================================================

-- Add 'RESPONDING' to alert_status enum if not present
ALTER TYPE alert_status ADD VALUE IF NOT EXISTS 'RESPONDING';

-- Add responder and resolver details to geofence_alerts
ALTER TABLE geofence_alerts
  ADD COLUMN IF NOT EXISTS responder_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS responder_role VARCHAR(30),
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id);
