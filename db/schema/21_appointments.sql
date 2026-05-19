-- SECTION 6: APPOINTMENTS & CALENDAR
-- ============================================================
 
CREATE TABLE appointments (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id            UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by            UUID          NOT NULL REFERENCES users(id),
  title                 VARCHAR(200)  NOT NULL,
  location_name         VARCHAR(200),
  location_address      TEXT,
  location_lat          DOUBLE PRECISION,
  location_lng          DOUBLE PRECISION,
  doctor_name           VARCHAR(100),
  speciality            VARCHAR(100),
  notes                 TEXT,
  scheduled_at          TIMESTAMPTZ   NOT NULL,
  duration_minutes      INTEGER       NOT NULL DEFAULT 30,
  transport_required    BOOLEAN       NOT NULL DEFAULT FALSE,
  transport_notes       TEXT,
  reminder_day_before   BOOLEAN       NOT NULL DEFAULT TRUE,
  reminder_2hr_before   BOOLEAN       NOT NULL DEFAULT TRUE,
  reminder_30min_before BOOLEAN       NOT NULL DEFAULT TRUE,
  is_completed          BOOLEAN       NOT NULL DEFAULT FALSE,
  completed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_appointments_patient  ON appointments (patient_id, scheduled_at);
CREATE INDEX idx_appointments_upcoming ON appointments (scheduled_at)
  WHERE is_completed = FALSE;
 
 
-- ============================================================
