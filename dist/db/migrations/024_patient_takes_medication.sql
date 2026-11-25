-- =============================================================================
-- SureStep — Migration 024: Persist Patient takes_medication Yes/No selection
-- =============================================================================

ALTER TABLE patient_profiles
  ADD COLUMN IF NOT EXISTS takes_medication BOOLEAN DEFAULT NULL;

-- Backfill existing profiles that already contain medication records.
-- Profiles without medications and without a recorded choice remain NULL
-- so unknown historical selections are not assumed to be FALSE ("No").
UPDATE patient_profiles
SET takes_medication = TRUE
WHERE takes_medication IS NULL
  AND jsonb_typeof(medications) = 'array'
  AND jsonb_array_length(medications) > 0;
