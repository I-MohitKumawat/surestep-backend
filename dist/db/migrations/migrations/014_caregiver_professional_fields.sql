-- =============================================================================
-- SureStep — Migration 014: Add professional caregiver profile fields
-- =============================================================================

ALTER TABLE caregiver_profiles
  ADD COLUMN IF NOT EXISTS professional_role VARCHAR(50),
  ADD COLUMN IF NOT EXISTS dementia_experience_years INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS care_capabilities TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS qualifications JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS has_dementia_training BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS service_city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(30) NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS verification_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_caregiver_role
  ON caregiver_profiles (professional_role)
  WHERE professional_role IS NOT NULL;
