-- =============================================================================
-- SureStep — Migration 023: Retire Unsupported V1 Operational Tables
-- =============================================================================
-- Retires legacy/prototype tables that have zero V1 workflow backing, zero
-- frontend callers, and were served only by the removed alerts.router.ts:
--   - appointments
--   - shared_documents
--   - caregiver_handovers
--   - patient_threads / thread_messages
--   - caregiver_wellbeing_logs
--   - incident_reports (legacy uncategorized stub; archived if populated)
--   - caregiver_ratings (excluded in V1_REQUIREMENT.md §12)
--
-- Historical migrations 001-022 are not modified.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Preserve any populated incident_reports rows before dropping the stub.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.incident_reports') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM incident_reports LIMIT 1) THEN
      CREATE TABLE IF NOT EXISTS incident_reports_archive AS
        SELECT *, NOW() AS archived_at FROM incident_reports;
    END IF;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Preserve any populated caregiver_ratings rows before dropping.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.caregiver_ratings') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM caregiver_ratings LIMIT 1) THEN
      CREATE TABLE IF NOT EXISTS caregiver_ratings_archive AS
        SELECT *, NOW() AS archived_at FROM caregiver_ratings;
    END IF;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Drop unsupported operational tables in dependency order (no CASCADE so
--    PostgreSQL fails fast if any unexpected canonical FK exists).
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS thread_messages;
DROP TABLE IF EXISTS patient_threads;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS shared_documents;
DROP TABLE IF EXISTS caregiver_handovers;
DROP TABLE IF EXISTS caregiver_wellbeing_logs;
DROP TABLE IF EXISTS caregiver_ratings;
DROP TABLE IF EXISTS incident_reports;

-- -----------------------------------------------------------------------------
-- 4. Drop enum used exclusively by thread_messages.
-- -----------------------------------------------------------------------------
DROP TYPE IF EXISTS message_type;
