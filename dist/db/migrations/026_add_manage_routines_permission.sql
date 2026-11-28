-- Migration 026: Add canonical 'Manage Routines' Care Circle permission
-- Additive, non-destructive migration supporting Circle-level and optional
-- per-patient scoping on circle_permissions so granted caregivers cannot
-- exceed patient-specific or Circle-specific boundaries.

ALTER TABLE circle_permissions
  ADD COLUMN IF NOT EXISTS patient_id UUID NULL REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE circle_permissions
  DROP CONSTRAINT IF EXISTS chk_canonical_permission_name;

ALTER TABLE circle_permissions
  ADD CONSTRAINT chk_canonical_permission_name CHECK (
    permission_name IN (
      'Manage Member Permissions',
      'Manage Caregiver Relationships',
      'Search/Request Caregivers',
      'Manage Patient Memories',
      'Manage Routines'
    )
  );

ALTER TABLE circle_permissions
  DROP CONSTRAINT IF EXISTS uq_member_permission;

CREATE UNIQUE INDEX IF NOT EXISTS uq_member_permission_circle
  ON circle_permissions (member_id, permission_name)
  WHERE patient_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_member_permission_patient
  ON circle_permissions (member_id, permission_name, patient_id)
  WHERE patient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_circle_permissions_patient
  ON circle_permissions (patient_id)
  WHERE patient_id IS NOT NULL;
