-- =============================================================================
-- SureStep — Migration 012: Add modern onboarding fields to patient_profiles table
-- =============================================================================

ALTER TABLE patient_profiles
  ADD COLUMN IF NOT EXISTS severity_level VARCHAR(30),
  ADD COLUMN IF NOT EXISTS emergency_contact_relation VARCHAR(50),
  ADD COLUMN IF NOT EXISTS living_arrangement VARCHAR(50),
  ADD COLUMN IF NOT EXISTS care_needs TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS safety_concerns TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS communication_preferences TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS other_conditions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS onboarding_source VARCHAR(30) NOT NULL DEFAULT 'SELF',
  ADD COLUMN IF NOT EXISTS emergency_contact_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS emergency_contact_status VARCHAR(30) NOT NULL DEFAULT 'UNLINKED';

CREATE INDEX IF NOT EXISTS idx_patient_profiles_emergency_contact_user_id
  ON patient_profiles (emergency_contact_user_id)
  WHERE emergency_contact_user_id IS NOT NULL;
