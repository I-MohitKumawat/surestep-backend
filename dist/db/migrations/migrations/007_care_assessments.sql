-- =============================================================================
-- SureStep — Migration 007: Caregiver Assessments & Care Plans
-- =============================================================================

-- Alter ENUM to add new status values for relationship tracking
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block,
-- so we run it separately (which psql handles since there is no BEGIN/COMMIT here).
ALTER TYPE relationship_status ADD VALUE IF NOT EXISTS 'REQUESTED';
ALTER TYPE relationship_status ADD VALUE IF NOT EXISTS 'ACCEPTED';
ALTER TYPE relationship_status ADD VALUE IF NOT EXISTS 'MEETING_COMPLETED';
ALTER TYPE relationship_status ADD VALUE IF NOT EXISTS 'ASSESSMENT_PENDING';
ALTER TYPE relationship_status ADD VALUE IF NOT EXISTS 'ACTIVE_CARE';

-- Create care_assessments table
CREATE TABLE IF NOT EXISTS care_assessments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caregiver_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version             INTEGER NOT NULL DEFAULT 1,
  status              VARCHAR(20) NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'COMPLETED'
  is_latest           BOOLEAN NOT NULL DEFAULT TRUE,
  patient_basics      JSONB NOT NULL DEFAULT '{}'::jsonb,
  emergency_contacts  JSONB NOT NULL DEFAULT '[]'::jsonb,
  cognitive           JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk                JSONB NOT NULL DEFAULT '{}'::jsonb,
  mobility            VARCHAR(50) NOT NULL,
  support_needs       JSONB NOT NULL DEFAULT '{}'::jsonb,
  tech_comfort        VARCHAR(50) NOT NULL,
  notes               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for assessment retrieval
CREATE INDEX IF NOT EXISTS idx_assessments_patient_latest ON care_assessments(patient_id, is_latest);
CREATE INDEX IF NOT EXISTS idx_assessments_caregiver ON care_assessments(caregiver_id);

-- Create care_plans table
CREATE TABLE IF NOT EXISTS care_plans (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id              UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  assessment_id           UUID NOT NULL REFERENCES care_assessments(id) ON DELETE CASCADE,
  care_goals              TEXT NOT NULL,
  monitoring_requirements  TEXT NOT NULL,
  recommended_routines    JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_geofencing  JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_profile            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for care plan retrieval
CREATE INDEX IF NOT EXISTS idx_care_plans_patient ON care_plans(patient_id);
