-- =============================================================================
-- SureStep — Migration 011: Add missing fields to family_profiles table
-- =============================================================================

ALTER TABLE family_profiles 
  ADD COLUMN IF NOT EXISTS relation_label VARCHAR(50),
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS notify_on_breach BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_on_missed_critical BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_on_sos BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_on_daily_digest BOOLEAN NOT NULL DEFAULT TRUE;
