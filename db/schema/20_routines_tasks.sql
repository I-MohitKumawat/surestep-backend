-- SECTION 5: ROUTINES & TASKS
-- ============================================================
 
-- Reusable task definitions created by caregivers or from the platform library.
CREATE TABLE routine_templates (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by                UUID          NOT NULL REFERENCES users(id),
  title                     VARCHAR(100)  NOT NULL,
  description               TEXT,
  patient_hint              TEXT,         -- simplified patient-facing instruction
  -- steps: [{order, text}]
  steps                     JSONB         NOT NULL DEFAULT '[]',
  emoji                     VARCHAR(10),
  default_duration_minutes  INTEGER       NOT NULL DEFAULT 15,
  is_critical               BOOLEAN       NOT NULL DEFAULT FALSE,
  category                  VARCHAR(50),  -- Morning | Medication | Exercise | Meal | Hygiene | Sleep
  is_library_item           BOOLEAN       NOT NULL DEFAULT FALSE,
  tags                      TEXT[]        NOT NULL DEFAULT '{}',
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_templates_created_by ON routine_templates (created_by);
CREATE INDEX idx_templates_library    ON routine_templates (is_library_item)
  WHERE is_library_item = TRUE;
 
 
-- Individual task assigned to a specific patient for a specific date.
-- voice_note_url: caregiver records a short audio instruction per task.
-- Patient hears the voice note instead of reading text.
CREATE TABLE tasks (
  id                      UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id              UUID                    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_by             UUID                    NOT NULL REFERENCES users(id),
  template_id             UUID                    REFERENCES routine_templates(id),
  title                   VARCHAR(100)            NOT NULL,
  description             TEXT,                   -- caregiver-facing detail
  patient_hint            TEXT,                   -- simplified patient-facing instruction
  -- steps: [{order, text}]
  steps                   JSONB                   NOT NULL DEFAULT '[]',
  emoji                   VARCHAR(10),
  voice_note_url          TEXT,                   -- S3 path, caregiver voice instruction
  scheduled_time          TIME                    NOT NULL,
  scheduled_date          DATE                    NOT NULL,
  duration_minutes        INTEGER                 NOT NULL DEFAULT 15,
  is_critical             BOOLEAN                 NOT NULL DEFAULT FALSE,
  status                  task_status             NOT NULL DEFAULT 'PENDING',
  completed_at            TIMESTAMPTZ,
  unsure_at               TIMESTAMPTZ,
  missed_at               TIMESTAMPTZ,
  caregiver_note          TEXT,
  photo_confirmation_url  TEXT,                   -- patient photos proof for medication tasks
  recurrence_type         task_recurrence_type    NOT NULL DEFAULT 'NONE',
  -- recurrence_days: [0..6] where 0=Sunday, for WEEKLY recurrence
  recurrence_days         INTEGER[],
  recurrence_end_date     DATE,
  parent_task_id          UUID                    REFERENCES tasks(id),
  created_at              TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_tasks_patient_date ON tasks (patient_id, scheduled_date);
CREATE INDEX idx_tasks_status       ON tasks (patient_id, status);
CREATE INDEX idx_tasks_assigned_by  ON tasks (assigned_by);
 
 
-- ============================================================
