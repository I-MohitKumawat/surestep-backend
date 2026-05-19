-- =============================================================================
-- SureStep — Migration 002
-- Adds missing constraints + indexes for production correctness.
-- Run after 001_initial_schema.sql
-- =============================================================================

-- Device registry: unique per (user_id, device_token) for upsert to work
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_device_user_token'
  ) THEN
    ALTER TABLE device_registry
      ADD CONSTRAINT uq_device_user_token UNIQUE (user_id, device_token);
  END IF;
END $$;

-- Subscriptions: one sub per family+patient pair (upsert-able)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_subscription_family_patient'
  ) THEN
    ALTER TABLE subscriptions
      ADD CONSTRAINT uq_subscription_family_patient UNIQUE (family_user_id, patient_user_id);
  END IF;
END $$;

-- Tasks: soft-delete column (optional, prefer keeping status = SKIPPED but add for safety)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE tasks ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END $$;

-- Familiarity faces: index for patient display order
CREATE INDEX IF NOT EXISTS idx_faces_patient_order
  ON familiarity_faces(patient_id, display_order);

-- Memory items: index for daily surfacing (least recently shown)
CREATE INDEX IF NOT EXISTS idx_memory_patient_shown
  ON memory_items(patient_id, last_shown_at NULLS FIRST);

-- Voice messages: index for delivery queue
CREATE INDEX IF NOT EXISTS idx_vmsg_status
  ON voice_messages(status, created_at) WHERE status IN ('QUEUED','GENERATING');
