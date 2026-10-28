-- =============================================================================
-- SureStep — Migration 018: Care Circle Domain Foundation
-- =============================================================================
-- Phase 1: Establishes decoupled Care Circle tenancy, membership, permissions,
-- patient associations, 6-digit numeric invitations, join requests, caregiver
-- contractual relationships, and independent patient assignments.
-- Authoritative baselines:
--   - docs/architecture/TARGET_ARCHITECTURE.md (Sections 3.2, 3.3, 4.1, 4.2)
--   - docs/workflows/03-CARE-CIRCLE.md
--   - docs/workflows/05-CAREGIVER-DISCOVERY.md
--   - docs/workflows/06-CAREGIVER-RELATIONSHIP.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. care_circles
-- Top-level coordination container owned by a generic User (Family or Caregiver).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS care_circles (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100)  NOT NULL,
  owner_id        UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  terminated_at   TIMESTAMPTZ   NULL,

  CONSTRAINT chk_care_circle_name_len CHECK (char_length(trim(name)) >= 2)
);

CREATE INDEX IF NOT EXISTS idx_care_circles_owner
  ON care_circles (owner_id);

-- Enforces single active circle ownership per user in V1
CREATE UNIQUE INDEX IF NOT EXISTS idx_uq_active_care_circle_owner
  ON care_circles (owner_id)
  WHERE terminated_at IS NULL;

-- -----------------------------------------------------------------------------
-- 2. care_circle_members
-- Participation bridge between a User and a Care Circle.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS care_circle_members (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id       UUID          NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
  user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_circle  VARCHAR(20)   NOT NULL,
  joined_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_role_in_circle CHECK (role_in_circle IN ('OWNER', 'MEMBER', 'CAREGIVER')),
  CONSTRAINT uq_circle_member UNIQUE (circle_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_circle_members_circle
  ON care_circle_members (circle_id);

CREATE INDEX IF NOT EXISTS idx_circle_members_user
  ON care_circle_members (user_id);

-- -----------------------------------------------------------------------------
-- 3. circle_permissions
-- Stores strictly the 4 canonical delegatable permissions granted to non-Owner members.
-- Circle Owner authority is intrinsic to care_circles.owner_id and requires no persisted rows.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS circle_permissions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       UUID          NOT NULL REFERENCES care_circle_members(id) ON DELETE CASCADE,
  permission_name VARCHAR(64)   NOT NULL,
  granted_by      UUID          NOT NULL REFERENCES users(id),
  granted_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_canonical_permission_name CHECK (
    permission_name IN (
      'Manage Member Permissions',
      'Manage Caregiver Relationships',
      'Search/Request Caregivers',
      'Manage Patient Memories'
    )
  ),
  CONSTRAINT uq_member_permission UNIQUE (member_id, permission_name)
);

CREATE INDEX IF NOT EXISTS idx_circle_permissions_member
  ON circle_permissions (member_id);

-- -----------------------------------------------------------------------------
-- 4. patient_circle_associations
-- Maps Patients to the Care Circle coordinating their care.
-- Established strictly via accepted Patient Join Requests (03-CARE-CIRCLE.md §6, §7).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_circle_associations (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id       UUID          NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
  patient_id      UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  associated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  associated_by   UUID          NOT NULL REFERENCES users(id),

  CONSTRAINT uq_patient_circle_association UNIQUE (circle_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_patient_circle_circle
  ON patient_circle_associations (circle_id);

CREATE INDEX IF NOT EXISTS idx_patient_circle_patient
  ON patient_circle_associations (patient_id);

-- -----------------------------------------------------------------------------
-- 5. circle_invitations
-- Onboarding invitations with strictly 6-digit numeric codes and 72-hour TTL.
-- Marks USED upon successful creation of a join request (03-CARE-CIRCLE.md §2, §3).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS circle_invitations (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id       UUID          NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
  code            VARCHAR(6)    NOT NULL UNIQUE,
  created_by      UUID          NOT NULL REFERENCES users(id),
  status          VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE',
  expires_at      TIMESTAMPTZ   NOT NULL,
  used_at         TIMESTAMPTZ   NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_circle_invitation_status CHECK (status IN ('ACTIVE', 'USED', 'EXPIRED', 'REVOKED')),
  CONSTRAINT chk_circle_invitation_code_format CHECK (code ~ '^[0-9]{6}$')
);

CREATE INDEX IF NOT EXISTS idx_circle_invitations_code
  ON circle_invitations (code);

CREATE INDEX IF NOT EXISTS idx_circle_invitations_circle
  ON circle_invitations (circle_id);

CREATE INDEX IF NOT EXISTS idx_circle_invitations_active
  ON circle_invitations (circle_id, status)
  WHERE status = 'ACTIVE';

-- -----------------------------------------------------------------------------
-- 6. circle_join_requests
-- Approval pipeline following invitation use.
-- Review by Owner or member holding 'Manage Member Permissions'.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS circle_join_requests (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id       UUID          NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
  user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitation_id   UUID          NOT NULL REFERENCES circle_invitations(id) ON DELETE RESTRICT,
  status          VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
  reviewed_by     UUID          NULL REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ   NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_circle_join_request_status CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED'))
);

-- At most one PENDING request per user per circle
CREATE UNIQUE INDEX IF NOT EXISTS idx_uq_pending_circle_join_request
  ON circle_join_requests (circle_id, user_id)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_circle_join_requests_circle_status
  ON circle_join_requests (circle_id, status);

CREATE INDEX IF NOT EXISTS idx_circle_join_requests_user
  ON circle_join_requests (user_id);

-- -----------------------------------------------------------------------------
-- 7. caregiver_relationships
-- Formal contractual engagement between Care Circle and Caregiver.
-- Supports non-interactive 7-day departure notice period (06-CAREGIVER-RELATIONSHIP.md).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS caregiver_relationships (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id           UUID          NOT NULL REFERENCES care_circles(id) ON DELETE RESTRICT,
  caregiver_id        UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status              VARCHAR(30)   NOT NULL DEFAULT 'RELATIONSHIP_ESTABLISHED',
  notice_started_at   TIMESTAMPTZ   NULL,
  notice_expires_at   TIMESTAMPTZ   NULL,
  termination_reason  VARCHAR(64)   NULL,
  termination_notes   TEXT          NULL,
  ended_at            TIMESTAMPTZ   NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_caregiver_relationship_status CHECK (
    status IN ('RELATIONSHIP_ESTABLISHED', 'ACTIVE', 'SUSPENDED', 'NOTICE_PERIOD', 'TERMINATED')
  ),
  CONSTRAINT chk_caregiver_termination_notes_len CHECK (
    termination_notes IS NULL OR char_length(termination_notes) <= 1000
  )
);

-- At most one active/notice/suspended relationship per caregiver per circle
CREATE UNIQUE INDEX IF NOT EXISTS idx_uq_active_caregiver_circle_rel
  ON caregiver_relationships (circle_id, caregiver_id)
  WHERE status != 'TERMINATED';

CREATE INDEX IF NOT EXISTS idx_caregiver_rel_circle_status
  ON caregiver_relationships (circle_id, status);

CREATE INDEX IF NOT EXISTS idx_caregiver_rel_caregiver_status
  ON caregiver_relationships (caregiver_id, status);

CREATE INDEX IF NOT EXISTS idx_caregiver_rel_notice
  ON caregiver_relationships (notice_expires_at)
  WHERE status = 'NOTICE_PERIOD';

-- -----------------------------------------------------------------------------
-- 8. patient_assignments
-- Scopes an active caregiver's routine, agenda, and telemetry access to specific Patient(s).
-- Decoupled from Care Circle membership and caregiver contractual status.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_assignments (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id UUID          NOT NULL REFERENCES caregiver_relationships(id) ON DELETE CASCADE,
  patient_id      UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by     UUID          NOT NULL REFERENCES users(id),
  assigned_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,

  CONSTRAINT uq_relationship_patient_assignment UNIQUE (relationship_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_patient_assignments_rel
  ON patient_assignments (relationship_id);

CREATE INDEX IF NOT EXISTS idx_patient_assignments_patient
  ON patient_assignments (patient_id);

CREATE INDEX IF NOT EXISTS idx_patient_assignments_active
  ON patient_assignments (relationship_id, patient_id)
  WHERE is_active = TRUE;
