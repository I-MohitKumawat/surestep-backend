-- =============================================================================
-- SureStep — Migration 016: End Care Relationship Domain Metadata & Constraints
-- =============================================================================

-- 1. Add termination metadata columns
ALTER TABLE patient_relationships
  ADD COLUMN IF NOT EXISTS end_reason VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS end_notes VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS ended_by UUID NULL REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS previous_status relationship_status NULL;

-- 2. Invariant: Canonical end reason CHECK constraint
DO $$ BEGIN
  ALTER TABLE patient_relationships
    ADD CONSTRAINT chk_relationship_end_reason
    CHECK (
      end_reason IS NULL OR end_reason IN (
        'CARE_NO_LONGER_REQUIRED',
        'FAMILY_TAKING_OVER',
        'FOUND_DIFFERENT_CARE',
        'CAREGIVER_NOT_A_GOOD_FIT',
        'SCHEDULE_CHANGED',
        'CAREGIVER_REQUESTED_END',
        'OTHER'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Performance Index: Querying ended relationship history
CREATE INDEX IF NOT EXISTS idx_rel_ended_history
  ON patient_relationships(patient_user_id, status, ended_at DESC);

-- 4. Engine-level invariant: ENDED is terminal (cannot resurrect an ENDED relationship)
CREATE OR REPLACE FUNCTION prevent_resurrect_ended_relationship()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'ENDED' AND NEW.status != 'ENDED' THEN
    RAISE EXCEPTION 'Cannot resurrect an ENDED relationship (terminal state)'
      USING ERRCODE = '23514'; -- check_violation
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_resurrect_ended_relationship ON patient_relationships;
CREATE TRIGGER trg_prevent_resurrect_ended_relationship
  BEFORE UPDATE ON patient_relationships
  FOR EACH ROW
  EXECUTE FUNCTION prevent_resurrect_ended_relationship();
