-- =============================================================================
-- SureStep — Migration 022: Retire Legacy Operational Tables
-- =============================================================================
-- Executed only after Pass 1–4 callers were migrated to canonical subsystems:
--   routines  -> routine_definitions / routine_occurrences / routine_completions
--   safety    -> safety_alerts / safety_alert_responses
--   Safe Zones-> safe_zones / safe_zone_monitors
--   reminders -> routine occurrences (legacy reminders decommissioned)
--
-- Historical migrations are not modified. Data that still has an authoritative
-- destination is backfilled first; derived/decommissioned data is dropped.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Backfill legacy geofence zones into canonical Circle Safe Zones.
--    Legacy UUIDs are preserved so patient_states.last_known_zone_id remains
--    meaningful. Zones without an active Circle association cannot be assigned
--    to a Circle and are intentionally not migrated.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  z RECORD;
  v_circle_id UUID;
  v_name TEXT;
  v_radius INTEGER;
BEGIN
  IF to_regclass('public.geofence_zones') IS NULL THEN
    RETURN;
  END IF;

  FOR z IN SELECT * FROM geofence_zones LOOP
    SELECT pca.circle_id
    INTO v_circle_id
    FROM patient_circle_associations pca
    JOIN care_circles c ON c.id = pca.circle_id AND c.terminated_at IS NULL
    WHERE pca.patient_id = z.patient_id
    ORDER BY pca.associated_at DESC
    LIMIT 1;

    IF v_circle_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Legacy coordinates outside the canonical bounds cannot be represented.
    IF z.center_lat NOT BETWEEN -90.0 AND 90.0
       OR z.center_lng NOT BETWEEN -180.0 AND 180.0 THEN
      CONTINUE;
    END IF;

    v_name := COALESCE(NULLIF(trim(z.label), ''), 'Safe Zone');
    IF char_length(v_name) < 2 THEN
      v_name := 'Safe Zone';
    END IF;
    v_radius := GREATEST(50, LEAST(10000, z.radius_m));

    INSERT INTO safe_zones (
      id, circle_id, name, center_lat, center_lng, radius_meters,
      is_active, created_by, created_at, updated_at
    )
    VALUES (
      z.id, v_circle_id, v_name, z.center_lat, z.center_lng, v_radius,
      z.is_active, z.created_by, z.created_at, COALESCE(z.updated_at, z.created_at)
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO safe_zone_monitors (safe_zone_id, patient_id, attached_at)
    SELECT sz.id, z.patient_id, z.created_at
    FROM safe_zones sz
    WHERE sz.id = z.id
      AND sz.circle_id = v_circle_id
    ON CONFLICT (safe_zone_id, patient_id) DO NOTHING;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Backfill legacy safety alerts into the canonical alert ledger.
--    Only incident-bearing legacy types are representable in V1:
--      SOS_TRIGGERED -> SOS_MANUAL
--      ZONE_EXIT     -> ZONE_BREACH
--    Informational ZONE_ENTER / APPROACHING_BOUNDARY rows are not incidents.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  a RECORD;
  v_circle_id UUID;
  v_alert_type TEXT;
  v_status TEXT;
  v_resolved_by UUID;
BEGIN
  IF to_regclass('public.geofence_alerts') IS NULL THEN
    RETURN;
  END IF;

  FOR a IN
    SELECT ga.*
    FROM geofence_alerts ga
    WHERE ga.alert_type IN ('SOS_TRIGGERED', 'ZONE_EXIT')
    ORDER BY ga.created_at ASC
  LOOP
    SELECT pca.circle_id
    INTO v_circle_id
    FROM patient_circle_associations pca
    JOIN care_circles c ON c.id = pca.circle_id AND c.terminated_at IS NULL
    WHERE pca.patient_id = a.patient_id
    ORDER BY pca.associated_at DESC
    LIMIT 1;

    IF v_circle_id IS NULL THEN
      CONTINUE;
    END IF;

    v_alert_type := CASE
      WHEN a.alert_type = 'SOS_TRIGGERED' THEN 'SOS_MANUAL'
      ELSE 'ZONE_BREACH'
    END;

    v_status := CASE
      WHEN a.resolved_at IS NOT NULL THEN 'RESOLVED'
      WHEN a.acknowledged_at IS NOT NULL THEN 'VIEWED'
      ELSE 'TRIGGERED'
    END;

    SELECT u.id INTO v_resolved_by
    FROM users u
    WHERE u.id = a.resolved_by
      AND u.is_active = TRUE
      AND u.deleted_at IS NULL;

    INSERT INTO safety_alerts (
      id, circle_id, patient_id, alert_type, status, trigger_lat, trigger_lng,
      safe_zone_id, dedup_key, triggered_at, resolved_at, resolved_by
    )
    VALUES (
      a.id,
      v_circle_id,
      a.patient_id,
      v_alert_type,
      v_status,
      a.lat,
      a.lng,
      CASE
        WHEN a.zone_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM safe_zones sz WHERE sz.id = a.zone_id)
        THEN a.zone_id
        ELSE NULL
      END,
      'LEGACY_GA_' || a.id::text,
      a.created_at,
      a.resolved_at,
      v_resolved_by
    )
    ON CONFLICT (id) DO NOTHING;

    IF a.responder_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM users u WHERE u.id = a.responder_id) THEN
      INSERT INTO safety_alert_responses (alert_id, responder_id, action, created_at)
      SELECT a.id, a.responder_id, 'IM_RESPONDING', COALESCE(a.responded_at, a.created_at)
      WHERE NOT EXISTS (
        SELECT 1 FROM safety_alert_responses sar
        WHERE sar.alert_id = a.id
          AND sar.responder_id = a.responder_id
          AND sar.action = 'IM_RESPONDING'
      );
    END IF;

    IF v_status = 'RESOLVED' AND v_resolved_by IS NOT NULL THEN
      INSERT INTO safety_alert_responses (alert_id, responder_id, action, created_at)
      SELECT a.id, v_resolved_by, 'RESOLVED', COALESCE(a.resolved_at, a.created_at)
      WHERE NOT EXISTS (
        SELECT 1 FROM safety_alert_responses sar
        WHERE sar.alert_id = a.id
          AND sar.responder_id = v_resolved_by
          AND sar.action = 'RESOLVED'
      );
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 2b. Repoint notification_logs.alert_id from the retired geofence_alerts table
--     to canonical safety_alerts. Legacy informational alert IDs have no
--     canonical incident equivalent and are detached instead of dangling.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.notification_logs') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'notification_logs'
         AND column_name = 'alert_id'
     ) THEN
    UPDATE notification_logs nl
    SET alert_id = NULL
    WHERE nl.alert_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM safety_alerts sa WHERE sa.id = nl.alert_id);

    ALTER TABLE notification_logs
      DROP CONSTRAINT IF EXISTS notification_logs_alert_id_fkey;

    ALTER TABLE notification_logs
      ADD CONSTRAINT notification_logs_alert_id_fkey
      FOREIGN KEY (alert_id) REFERENCES safety_alerts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Repoint patient_states.last_known_zone_id from the retired geofence table
--    to the canonical safe_zones table.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'patient_states'
      AND column_name = 'last_known_zone_id'
  ) THEN
    UPDATE patient_states ps
    SET last_known_zone_id = NULL
    WHERE ps.last_known_zone_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM safe_zones sz WHERE sz.id = ps.last_known_zone_id);

    ALTER TABLE patient_states
      DROP CONSTRAINT IF EXISTS patient_states_last_known_zone_id_fkey;

    ALTER TABLE patient_states
      ADD CONSTRAINT patient_states_last_known_zone_id_fkey
      FOREIGN KEY (last_known_zone_id) REFERENCES safe_zones(id) ON DELETE SET NULL;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Drop the legacy routine/task and geofence tables. Canonical data was
--    backfilled by migration 020 and the sections above.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS daily_adherence_snapshots CASCADE;
DROP TABLE IF EXISTS routine_attachments CASCADE;
DROP TABLE IF EXISTS routine_execution_times CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS routine_templates CASCADE;
DROP TABLE IF EXISTS geofence_alerts CASCADE;
DROP TABLE IF EXISTS geofence_zones CASCADE;
DROP TABLE IF EXISTS reminders CASCADE;

-- -----------------------------------------------------------------------------
-- 5. Drop enums that existed only for the retired tables. relationship_type /
--    relationship_status remain because the historical relationship archive and
--    legacy invite-code archive retain their historical columns.
-- -----------------------------------------------------------------------------
DROP TYPE IF EXISTS task_status;
DROP TYPE IF EXISTS recurrence_type;
DROP TYPE IF EXISTS zone_type;
DROP TYPE IF EXISTS boundary_type;
DROP TYPE IF EXISTS alert_type;
DROP TYPE IF EXISTS alert_severity;
DROP TYPE IF EXISTS alert_status;
