-- SECTION 16: COGNITIVE ASSESSMENT
-- ============================================================
 
CREATE TABLE game_sessions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID        NOT NULL REFERENCES users(id),
  game_type           game_type   NOT NULL,
  difficulty_level    INTEGER     NOT NULL DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 5),
  duration_seconds    INTEGER     NOT NULL,
  completed           BOOLEAN     NOT NULL DEFAULT FALSE,
  abandoned           BOOLEAN     NOT NULL DEFAULT FALSE,
  -- abandon_reason: 'USER_QUIT' | 'INACTIVITY_TIMEOUT'
  abandon_reason      VARCHAR(100),
  score               INTEGER,
  max_possible_score  INTEGER,
  error_count         INTEGER     NOT NULL DEFAULT 0,
  hint_count          INTEGER     NOT NULL DEFAULT 0,
  correct_count       INTEGER     NOT NULL DEFAULT 0,
  avg_reaction_ms     FLOAT,
  played_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_game_sessions_patient ON game_sessions (patient_id, played_at DESC);
CREATE INDEX idx_game_sessions_type    ON game_sessions (patient_id, game_type, played_at DESC);
 
 
-- Granular per-event metrics extracted from game sessions.
-- context JSONB carries event-specific data:
-- e.g. for SEQUENCE_ERROR: {expected_sequence, given_sequence}
-- e.g. for FACE_RECOGNISED: {person_name, was_correct}
-- e.g. for ORIENTATION_CORRECT: {domain: 'day'|'date'|'city', was_correct}
CREATE TABLE game_metrics (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID          NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  patient_id    UUID          NOT NULL REFERENCES users(id),  -- denormalised for query speed
  metric_type   metric_type   NOT NULL,
  value         FLOAT         NOT NULL,
  context       JSONB,
  sequence_no   INTEGER,      -- event order within the session
  recorded_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_game_metrics_session ON game_metrics (session_id);
CREATE INDEX idx_game_metrics_patient ON game_metrics (patient_id, metric_type, recorded_at DESC);
 
 
-- Aggregated weekly/monthly scores computed from game_metrics.
-- trend_vs_baseline: percentage change vs first cognitive_assessments row for patient.
-- anomalies_detected: [{type, description, detected_at}]
CREATE TABLE cognitive_assessments (
  id                    UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id            UUID              NOT NULL REFERENCES users(id),
  period_start          DATE              NOT NULL,
  period_end            DATE              NOT NULL,
  memory_score          FLOAT,            -- normalised 0–100
  attention_score       FLOAT,
  language_score        FLOAT,
  orientation_score     FLOAT,
  visuospatial_score    FLOAT,
  reaction_time_avg_ms  FLOAT,
  sessions_count        INTEGER           NOT NULL DEFAULT 0,
  sessions_completed    INTEGER           NOT NULL DEFAULT 0,
  trend                 cognitive_trend   NOT NULL DEFAULT 'INSUFFICIENT_DATA',
  trend_vs_baseline     FLOAT,
  anomalies_detected    JSONB,
  ai_narrative          TEXT,             -- Claude-generated plain-language summary
  clinician_notes       TEXT,
  exported_at           TIMESTAMPTZ,
  computed_at           TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_assessments_patient ON cognitive_assessments (patient_id, period_start DESC);
 
 
CREATE TABLE mood_checkins (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID          NOT NULL REFERENCES users(id),
  score       INTEGER       NOT NULL CHECK (score BETWEEN 1 AND 3),  -- 1=poor 2=okay 3=good
  context     mood_context,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_mood_patient ON mood_checkins (patient_id, created_at DESC);
 
 
-- ============================================================
