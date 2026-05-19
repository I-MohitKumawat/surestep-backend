-- SECTION 17: MEDICATIONS
-- ============================================================
 
CREATE TABLE medications (
  id                  UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID                  NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  added_by            UUID                  NOT NULL REFERENCES users(id),
  name                VARCHAR(200)          NOT NULL,
  dosage              VARCHAR(100)          NOT NULL,    -- e.g. '500mg'
  form                medication_form       NOT NULL DEFAULT 'TABLET',
  frequency           VARCHAR(50)           NOT NULL,    -- e.g. 'Twice daily'
  times_of_day        TIME[]                NOT NULL,    -- scheduled administration times
  instructions        TEXT,                             -- e.g. 'Take with food'
  current_quantity    INTEGER,
  refill_at_quantity  INTEGER,                          -- trigger refill alert at this count
  last_refill_date    DATE,
  prescribing_doctor  VARCHAR(100),
  pharmacy_name       VARCHAR(200),
  pharmacy_phone      VARCHAR(20),
  is_critical         BOOLEAN               NOT NULL DEFAULT FALSE,
  is_active           BOOLEAN               NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_medications_patient ON medications (patient_id) WHERE is_active = TRUE;
 
 
CREATE TABLE medication_logs (
  id                UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id     UUID                    NOT NULL REFERENCES medications(id),
  patient_id        UUID                    NOT NULL REFERENCES users(id),
  scheduled_at      TIMESTAMPTZ             NOT NULL,
  status            medication_log_status   NOT NULL,
  taken_at          TIMESTAMPTZ,
  photo_proof_url   TEXT,                   -- patient photographs pill before taking
  confirmed_by      UUID                    REFERENCES users(id),
  note              TEXT,
  created_at        TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_med_logs_patient ON medication_logs (patient_id, scheduled_at DESC);
CREATE INDEX idx_med_logs_pending ON medication_logs (medication_id, status)
  WHERE status = 'TAKEN';
 
 
-- ============================================================
