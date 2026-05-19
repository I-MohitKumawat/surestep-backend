-- SECTION 15: CAREGIVER WELLBEING
-- ============================================================
 
-- Caregiver burnout tracking.
-- burnout_flag is set by the system when indicators are met
-- (e.g. high alert_count, low mood_score over multiple days).
CREATE TABLE caregiver_wellbeing_checkins (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id        UUID          NOT NULL REFERENCES users(id),
  mood_score          INTEGER       NOT NULL CHECK (mood_score BETWEEN 1 AND 5),
  stress_score        INTEGER       CHECK (stress_score BETWEEN 1 AND 5),
  note                TEXT,
  alert_count_today   INTEGER,      -- system-populated: alerts handled on this day
  patients_active     INTEGER,      -- system-populated: active patients on this day
  burnout_flag        BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_wellbeing_caregiver ON caregiver_wellbeing_checkins (caregiver_id, created_at DESC);
 
 
-- ============================================================
