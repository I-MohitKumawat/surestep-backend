-- SECTION 3: RELATIONSHIPS & PERMISSIONS
-- ============================================================
 
-- Central permission table.
-- Every data access request is validated against this table.
-- Relationship type determines read/write scope for the related user.
-- Family members are onboarded via invite_token, not cold registration.
CREATE TABLE patient_relationships (
  id                  UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id     UUID                  NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  related_user_id     UUID                  NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  relationship_type   relationship_type     NOT NULL,
  status              relationship_status   NOT NULL DEFAULT 'PENDING',
  invited_by          UUID                  REFERENCES users(id),
  invite_token        VARCHAR(64)           UNIQUE,          -- one-time family onboarding token
  invite_expires_at   TIMESTAMPTZ,
  note                TEXT,
  confirmed_at        TIMESTAMPTZ,
  suspended_at        TIMESTAMPTZ,
  ended_at            TIMESTAMPTZ,
  created_at          TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_patient_related UNIQUE (patient_user_id, related_user_id)
);
 
CREATE INDEX idx_rel_patient      ON patient_relationships (patient_user_id);
CREATE INDEX idx_rel_related      ON patient_relationships (related_user_id);
CREATE INDEX idx_rel_status       ON patient_relationships (status);
CREATE INDEX idx_rel_invite_token ON patient_relationships (invite_token)
  WHERE invite_token IS NOT NULL;
 
 
-- ============================================================
