-- =============================================================================
-- SureStep — Migration 021: Retire Legacy Patient Relationships
-- =============================================================================
-- Backfills legacy `patient_relationships` rows into the canonical Care Circle
-- domain (`care_circles`, `care_circle_members`, `patient_circle_associations`,
-- `caregiver_relationships`, `patient_assignments`) and retires the legacy
-- table as a read-only historical archive.
--
-- Canonical baselines:
--   - docs/architecture/TARGET_ARCHITECTURE.md (Sections 3.2, 3.3, 4.1, 4.2)
--   - docs/workflows/03-CARE-CIRCLE.md
--   - docs/workflows/06-CAREGIVER-RELATIONSHIP.md
--
-- Notes:
--   - Only rows that described actual access (not PENDING/REQUESTED) are
--     migrated. PENDING/REQUESTED legacy invitations have no canonical
--     equivalent and remain in the archive.
--   - When a legacy relationship has no Care Circle, a Circle is created so
--     existing care access is not silently lost. Family rows are processed
--     first so a Family Guardian owns the created Circle when one exists.
--   - The legacy table is renamed, not dropped, to preserve historical audit
--     data. No application code may read the archive.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Retired interactive resignation requests referenced the legacy table.
--    The canonical model uses a non-interactive 7-day NOTICE_PERIOD.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS caregiver_resignation_requests CASCADE;

-- -----------------------------------------------------------------------------
-- 2. Remove the legacy care-request -> patient_relationships pointer. Caregiver
--    acceptance now expresses interest only and never creates a relationship.
-- -----------------------------------------------------------------------------
ALTER TABLE care_requests
  DROP COLUMN IF EXISTS resulting_relationship_id;

-- -----------------------------------------------------------------------------
-- 3. Backfill Family / Guardian rows into canonical Circle membership.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_circle_id UUID;
BEGIN
  IF to_regclass('public.patient_relationships') IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT pr.*
    FROM patient_relationships pr
    JOIN users u ON u.id = pr.related_user_id
    WHERE pr.relationship_type IN ('FAMILY_CLOSE', 'FAMILY_EXTENDED', 'GUARDIAN')
      AND pr.status NOT IN ('PENDING', 'REQUESTED')
      AND u.role = 'FAMILY'
    ORDER BY
      pr.patient_user_id,
      CASE pr.relationship_type
        WHEN 'GUARDIAN' THEN 0
        WHEN 'FAMILY_CLOSE' THEN 1
        ELSE 2
      END,
      pr.created_at
  LOOP
    SELECT pca.circle_id
    INTO v_circle_id
    FROM patient_circle_associations pca
    JOIN care_circles c ON c.id = pca.circle_id AND c.terminated_at IS NULL
    WHERE pca.patient_id = r.patient_user_id
    ORDER BY pca.associated_at DESC
    LIMIT 1;

    IF v_circle_id IS NULL THEN
      INSERT INTO care_circles (name, owner_id)
      SELECT COALESCE(NULLIF(trim(u.name), ''), 'Patient') || '''s Care Circle',
             r.related_user_id
      FROM users u
      WHERE u.id = r.patient_user_id
      RETURNING id INTO v_circle_id;

      IF v_circle_id IS NULL THEN
        INSERT INTO care_circles (name, owner_id)
        VALUES ('Care Circle', r.related_user_id)
        RETURNING id INTO v_circle_id;
      END IF;

      INSERT INTO patient_circle_associations (circle_id, patient_id, associated_by)
      VALUES (v_circle_id, r.patient_user_id, r.related_user_id)
      ON CONFLICT (circle_id, patient_id) DO NOTHING;
    END IF;

    IF EXISTS (
      SELECT 1 FROM care_circles c
      WHERE c.id = v_circle_id AND c.owner_id = r.related_user_id
    ) THEN
      INSERT INTO care_circle_members (circle_id, user_id, role_in_circle)
      VALUES (v_circle_id, r.related_user_id, 'OWNER')
      ON CONFLICT (circle_id, user_id) DO NOTHING;
    ELSE
      INSERT INTO care_circle_members (circle_id, user_id, role_in_circle)
      VALUES (v_circle_id, r.related_user_id, 'MEMBER')
      ON CONFLICT (circle_id, user_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Backfill Caregiver rows into canonical relationships + assignments.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_circle_id UUID;
  v_owner_id UUID;
  v_relationship_id UUID;
  v_status TEXT;
BEGIN
  IF to_regclass('public.patient_relationships') IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT pr.*
    FROM patient_relationships pr
    JOIN users u ON u.id = pr.related_user_id
    WHERE pr.relationship_type = 'CAREGIVER'
      AND pr.status NOT IN ('PENDING', 'REQUESTED')
      AND u.role = 'CAREGIVER'
    ORDER BY
      pr.patient_user_id,
      CASE WHEN pr.status IN ('ENDED') THEN 1 ELSE 0 END,
      pr.created_at
  LOOP
    SELECT pca.circle_id
    INTO v_circle_id
    FROM patient_circle_associations pca
    JOIN care_circles c ON c.id = pca.circle_id AND c.terminated_at IS NULL
    WHERE pca.patient_id = r.patient_user_id
    ORDER BY pca.associated_at DESC
    LIMIT 1;

    IF v_circle_id IS NULL THEN
      v_owner_id := r.invited_by;

      IF v_owner_id IS NULL
         OR v_owner_id = r.patient_user_id
         OR NOT EXISTS (
           SELECT 1 FROM users u
           WHERE u.id = v_owner_id AND u.is_active = TRUE AND u.deleted_at IS NULL
         ) THEN
        v_owner_id := r.related_user_id;
      END IF;

      INSERT INTO care_circles (name, owner_id)
      SELECT COALESCE(NULLIF(trim(u.name), ''), 'Patient') || '''s Care Circle',
             v_owner_id
      FROM users u
      WHERE u.id = r.patient_user_id
      RETURNING id INTO v_circle_id;

      IF v_circle_id IS NULL THEN
        INSERT INTO care_circles (name, owner_id)
        VALUES ('Care Circle', v_owner_id)
        RETURNING id INTO v_circle_id;
      END IF;

      INSERT INTO patient_circle_associations (circle_id, patient_id, associated_by)
      VALUES (v_circle_id, r.patient_user_id, v_owner_id)
      ON CONFLICT (circle_id, patient_id) DO NOTHING;

      INSERT INTO care_circle_members (circle_id, user_id, role_in_circle)
      VALUES (v_circle_id, v_owner_id, 'OWNER')
      ON CONFLICT (circle_id, user_id) DO NOTHING;
    END IF;

    v_status := CASE
      WHEN r.status = 'ENDED' THEN 'TERMINATED'
      WHEN r.status = 'SUSPENDED' THEN 'SUSPENDED'
      ELSE 'ACTIVE'
    END;

    INSERT INTO caregiver_relationships (
      circle_id, caregiver_id, status, created_at,
      ended_at, termination_reason
    )
    VALUES (
      v_circle_id,
      r.related_user_id,
      v_status,
      COALESCE(r.confirmed_at, r.created_at, NOW()),
      CASE WHEN v_status = 'TERMINATED' THEN COALESCE(r.ended_at, NOW()) ELSE NULL END,
      CASE WHEN v_status = 'TERMINATED' THEN 'LEGACY_MIGRATION' ELSE NULL END
    )
    ON CONFLICT DO NOTHING;

    SELECT cr.id
    INTO v_relationship_id
    FROM caregiver_relationships cr
    WHERE cr.circle_id = v_circle_id
      AND cr.caregiver_id = r.related_user_id
      AND cr.status = v_status
    ORDER BY cr.created_at DESC
    LIMIT 1;

    IF v_relationship_id IS NOT NULL AND v_status = 'ACTIVE' THEN
      INSERT INTO patient_assignments (relationship_id, patient_id, assigned_by)
      VALUES (
        v_relationship_id,
        r.patient_user_id,
        COALESCE(
          NULLIF(r.invited_by, r.patient_user_id),
          v_owner_id,
          r.related_user_id
        )
      )
      ON CONFLICT (relationship_id, patient_id)
      DO UPDATE SET is_active = TRUE;
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Retire the legacy table as a historical archive. No application code may
--    read it; the name is intentionally distinct from the live domain.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.patient_relationships') IS NOT NULL
     AND to_regclass('public.patient_relationships_archive') IS NULL THEN
    DROP TRIGGER IF EXISTS trg_prevent_resurrect_ended_relationship
      ON patient_relationships;
    ALTER TABLE patient_relationships RENAME TO patient_relationships_archive;
  END IF;
END $$;

DROP FUNCTION IF EXISTS prevent_resurrect_ended_relationship();

COMMENT ON TABLE patient_relationships_archive IS
  'Read-only historical archive of pre-Care-Circle patient relationships. Retired by migration 021; do not query from application code.';
