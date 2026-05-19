-- SECTION 14: SHIFTS & HANDOVER
-- ============================================================
 
CREATE TABLE caregiver_shifts (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id     UUID          NOT NULL REFERENCES users(id),
  patient_id       UUID          NOT NULL REFERENCES users(id),
  scheduled_start  TIMESTAMPTZ   NOT NULL,
  scheduled_end    TIMESTAMPTZ   NOT NULL,
  actual_start     TIMESTAMPTZ,
  actual_end       TIMESTAMPTZ,
  check_in_lat     DOUBLE PRECISION,
  check_in_lng     DOUBLE PRECISION,
  status           shift_status  NOT NULL DEFAULT 'SCHEDULED',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_shifts_caregiver ON caregiver_shifts (caregiver_id, scheduled_start);
CREATE INDEX idx_shifts_patient   ON caregiver_shifts (patient_id, scheduled_start);
 
 
-- Structured handover form completed by outgoing caregiver.
-- Received and acknowledged by incoming caregiver.
CREATE TABLE shift_handovers (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id                UUID          NOT NULL REFERENCES caregiver_shifts(id),
  outgoing_caregiver_id   UUID          NOT NULL REFERENCES users(id),
  incoming_caregiver_id   UUID          REFERENCES users(id),
  -- mood_summary: GOOD | OKAY | DIFFICULT
  mood_summary            VARCHAR(20),
  tasks_summary           TEXT,
  medication_summary      TEXT,
  observations            TEXT,
  watch_for               TEXT,         -- what incoming caregiver should be alert to
  acknowledged_at         TIMESTAMPTZ,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_handovers_shift ON shift_handovers (shift_id);
 
 
-- ============================================================
