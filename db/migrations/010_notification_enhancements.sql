-- =============================================================================
-- SureStep — Migration 010: Notification Enhancements
-- Adds is_test flag to notification_logs and reminders for test/dev use.
-- Adds notification_type index for filtered queries.
-- =============================================================================

-- Add is_test flag to notification_logs (safe to re-run)
ALTER TABLE notification_logs
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

-- Add is_test flag to reminders (safe to re-run)
ALTER TABLE reminders
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

-- Composite index for notification type queries (history screen filters)
CREATE INDEX IF NOT EXISTS idx_notif_type
  ON notification_logs (user_id, notification_type, created_at DESC);

-- Index for active non-test reminders (reminder sweep ignores test rows)
CREATE INDEX IF NOT EXISTS idx_reminders_active_non_test
  ON reminders (patient_id, state, scheduled_at)
  WHERE state IN ('SCHEDULED', 'ACTIVE', 'SNOOZED') AND is_test = FALSE;
