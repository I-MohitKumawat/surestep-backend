-- Migration 017: Caregiver Resignation Requests
-- Phase 3B: Caregiver-initiated exit workflow for Care Relationships.

CREATE TABLE IF NOT EXISTS caregiver_resignation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id UUID NOT NULL REFERENCES patient_relationships(id) ON DELETE CASCADE,
  caregiver_id UUID NOT NULL REFERENCES users(id),
  patient_id UUID NOT NULL REFERENCES users(id),
  reason VARCHAR(64) NOT NULL,
  notes VARCHAR(500) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ NULL,
  responded_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_resignation_status CHECK (
    status IN ('PENDING', 'ACCEPTED', 'WITHDRAWN', 'DECLINED', 'EXPIRED')
  ),

  CONSTRAINT chk_resignation_reason CHECK (
    reason IN (
      'PERSONAL_CIRCUMSTANCES',
      'SCHEDULE_CONFLICT',
      'OUTSIDE_SERVICE_AREA',
      'CARE_NEEDS_CHANGED',
      'CAPACITY_CONSTRAINT',
      'ROLE_NO_LONGER_SUITABLE',
      'OTHER'
    )
  ),

  CONSTRAINT chk_resignation_notes_length CHECK (
    notes IS NULL OR char_length(notes) <= 500
  )
);

-- Partial unique index: at most one PENDING resignation request per care relationship
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_resignation
  ON caregiver_resignation_requests (relationship_id)
  WHERE status = 'PENDING';

-- Performance and lookup indexes
CREATE INDEX IF NOT EXISTS idx_resignation_rel_status
  ON caregiver_resignation_requests (relationship_id, status);

CREATE INDEX IF NOT EXISTS idx_resignation_patient_status
  ON caregiver_resignation_requests (patient_id, status);

CREATE INDEX IF NOT EXISTS idx_resignation_caregiver_status
  ON caregiver_resignation_requests (caregiver_id, status);
