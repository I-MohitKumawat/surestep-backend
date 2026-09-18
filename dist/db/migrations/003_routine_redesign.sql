-- Migration to align database schemas with the redesigned routines and tasks models.
-- Drops and recreates the empty tables to prevent column/datatype mismatches.

-- Drop old tables
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS routine_templates CASCADE;
DROP TABLE IF EXISTS routine_execution_times CASCADE;
DROP TABLE IF EXISTS routine_attachments CASCADE;
DROP TABLE IF EXISTS daily_adherence_snapshots CASCADE;

-- Create routine_templates table
CREATE TABLE routine_templates (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by          UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title               VARCHAR(100)  NOT NULL,
  instructions_md     TEXT,
  caregiver_notes     TEXT,
  category            VARCHAR(50)   NOT NULL DEFAULT 'custom',
  priority            VARCHAR(50)   NOT NULL DEFAULT 'medium',
  icon_name           VARCHAR(100),
  start_date          DATE          NOT NULL DEFAULT CURRENT_DATE,
  end_date            DATE,
  recurrence_pattern  JSONB         NOT NULL DEFAULT '{"type": "DAILY"}'::JSONB,
  completion_window   INTERVAL      NOT NULL DEFAULT '1 hour'::INTERVAL,
  is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Create routine_execution_times table
CREATE TABLE routine_execution_times (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID          NOT NULL REFERENCES routine_templates(id) ON DELETE CASCADE,
  scheduled_time  TIME          NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Create routine_attachments table
CREATE TABLE routine_attachments (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID          NOT NULL REFERENCES routine_templates(id) ON DELETE CASCADE,
  file_url      TEXT          NOT NULL,
  file_type     VARCHAR(50)   NOT NULL,
  display_name  VARCHAR(255),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Create tasks table
CREATE TABLE tasks (
  id                      UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id              UUID                    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by             UUID                    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id             UUID                    REFERENCES routine_templates(id) ON DELETE SET NULL,
  title                   VARCHAR(100)            NOT NULL,
  instructions_md         TEXT,
  caregiver_note          TEXT,
  category                VARCHAR(50)             NOT NULL DEFAULT 'custom',
  priority                VARCHAR(50)             NOT NULL DEFAULT 'medium',
  icon_name               VARCHAR(100),
  emoji                   VARCHAR(10),
  scheduled_time          TIME                    NOT NULL,
  scheduled_date          DATE                    NOT NULL,
  duration_minutes        INTEGER                 NOT NULL DEFAULT 15,
  is_critical             BOOLEAN                 NOT NULL DEFAULT FALSE,
  status                  task_status             NOT NULL DEFAULT 'PENDING',
  completed_at            TIMESTAMPTZ,
  completed_by            UUID                    REFERENCES users(id) ON DELETE SET NULL,
  updated_by              UUID                    REFERENCES users(id) ON DELETE SET NULL,
  voice_note_url          TEXT,
  recurrence_type         recurrence_type        NOT NULL DEFAULT 'NONE',
  recurrence_days         INTEGER[],
  recurrence_end_date     DATE,
  parent_task_id          UUID                    REFERENCES tasks(id) ON DELETE SET NULL,
  client_action_id        VARCHAR(100)            UNIQUE,
  deleted_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

-- Create daily_adherence_snapshots table
CREATE TABLE daily_adherence_snapshots (
  patient_id        UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_date       DATE          NOT NULL,
  total_scheduled   INTEGER       NOT NULL DEFAULT 0,
  total_completed   INTEGER       NOT NULL DEFAULT 0,
  total_missed      INTEGER       NOT NULL DEFAULT 0,
  score_percentage  DECIMAL(5,2)  NOT NULL DEFAULT 0,
  computed_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (patient_id, target_date)
);

-- Indexes for performance
CREATE INDEX idx_templates_patient ON routine_templates (patient_id, is_active);
CREATE INDEX idx_tasks_patient_date ON tasks (patient_id, scheduled_date);
CREATE INDEX idx_tasks_status ON tasks (patient_id, status);
CREATE INDEX idx_tasks_client_action ON tasks (client_action_id) WHERE client_action_id IS NOT NULL;
