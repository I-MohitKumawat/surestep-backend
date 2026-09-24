-- =============================================================================
-- SureStep — Migration 015: Dedicated care_requests domain
-- =============================================================================

CREATE TABLE IF NOT EXISTS care_requests (
  id                        UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id                UUID            NOT NULL REFERENCES users(id),
  requester_id              UUID            NOT NULL REFERENCES users(id),
  caregiver_id              UUID            NOT NULL REFERENCES users(id),
  status                    VARCHAR(20)     NOT NULL DEFAULT 'PENDING',

  -- Schedule Terms
  schedule_type             VARCHAR(20)     NOT NULL,
  requested_shifts          TEXT[]          NULL, -- Nullable for FLEXIBLE schedule
  days_of_week              INT[]           NULL, -- E.g. [1, 2, 3, 4, 5] (Mon-Fri)
  start_date                DATE            NOT NULL,
  end_date                  DATE            NULL,

  -- Care Requirements
  requested_capabilities    TEXT[]          NOT NULL DEFAULT '{}',

  -- Pricing Proposal
  proposed_rate_type        VARCHAR(10)     NOT NULL,
  proposed_rate_inr         NUMERIC(10,2)   NOT NULL,

  -- Context
  care_context_notes        VARCHAR(1000)   NULL,

  -- Decisions & Audit Trail
  decline_reason            VARCHAR(50)     NULL,
  withdraw_reason           VARCHAR(50)     NULL,
  response_notes            VARCHAR(500)    NULL,
  resulting_relationship_id UUID            NULL REFERENCES patient_relationships(id) ON DELETE SET NULL,

  -- Timestamps
  created_at                TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  responded_at              TIMESTAMPTZ     NULL,
  expires_at                TIMESTAMPTZ     NOT NULL DEFAULT (NOW() + INTERVAL '72 hours'),

  -- Table Constraints
  CONSTRAINT chk_care_request_status CHECK (
    status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED')
  ),
  CONSTRAINT chk_care_request_rate_type CHECK (
    proposed_rate_type IN ('HOURLY', 'DAILY')
  ),
  CONSTRAINT chk_care_request_schedule_type CHECK (
    schedule_type IN ('RECURRING', 'DATE_RANGE', 'FLEXIBLE', 'ONE_TIME')
  )
);

-- Performance Indices
CREATE INDEX IF NOT EXISTS idx_care_req_caregiver_pending ON care_requests(caregiver_id, status) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_care_req_patient ON care_requests(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_care_req_requester ON care_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_care_req_expires ON care_requests(expires_at) WHERE status = 'PENDING';

-- Invariant: Exactly ONE active PENDING request per (patient, caregiver) pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_care_request 
  ON care_requests(patient_id, caregiver_id) 
  WHERE status = 'PENDING';
