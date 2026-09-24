-- =============================================================================
-- SureStep — Migration 013: Add proximity and involvement_interests to family_profiles
-- =============================================================================

ALTER TABLE family_profiles
  ADD COLUMN IF NOT EXISTS proximity VARCHAR(50),
  ADD COLUMN IF NOT EXISTS involvement_interests TEXT[] NOT NULL DEFAULT '{}';
