-- =============================================================================
-- SureStep — Migration 020: Canonical Routine Occurrence Consistency
-- =============================================================================
-- Makes routine occurrence slots idempotent and backfills legacy routine
-- templates/tasks into the authoritative routine_definitions /
-- routine_occurrences / routine_completions model.
--
-- Legacy tables are not dropped here. They remain read-only until Pass 6/7
-- verify zero active callers.
--
-- Mapping:
--   routine_templates          -> routine_definitions (legacy id preserved)
--   routine_execution_times    -> schedule_pattern.times[]
--   tasks                      -> routine_occurrences (task id preserved)
--   tasks.status = DONE        -> routine_completions
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Deduplicate existing canonical occurrence slots before enforcing uniqueness.
-- Keep the most advanced row (COMPLETED > ONGOING > OVERDUE > SCHEDULED > CANCELLED).
-- -----------------------------------------------------------------------------
DELETE FROM routine_occurrences o
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY routine_id, scheduled_date, scheduled_time
           ORDER BY
             CASE status
               WHEN 'COMPLETED' THEN 0
               WHEN 'ONGOING' THEN 1
               WHEN 'OVERDUE' THEN 2
               WHEN 'SCHEDULED' THEN 3
               ELSE 4
             END,
             created_at ASC,
             id ASC
         ) AS rn
  FROM routine_occurrences
) duplicates
WHERE o.id = duplicates.id
  AND duplicates.rn > 1;

-- -----------------------------------------------------------------------------
-- 2. One occurrence per routine slot. This makes materialization idempotent.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_routine_occurrence_slot
  ON routine_occurrences (routine_id, scheduled_date, scheduled_time);

-- -----------------------------------------------------------------------------
-- 3. Backfill legacy routine templates as canonical definitions.
-- Legacy ids are preserved so task.template_id can be mapped without an
-- additional mapping column.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.routine_templates') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO routine_definitions (
    id, patient_id, title, category, description, schedule_pattern,
    is_active, created_by, created_at, updated_at
  )
  SELECT
    rt.id,
    rt.patient_id,
    COALESCE(NULLIF(trim(rt.title), ''), 'Routine'),
    CASE
      WHEN lower(rt.category) LIKE '%medic%' THEN 'MEDICATION'
      WHEN lower(rt.category) LIKE '%meal%' OR lower(rt.category) LIKE '%food%' THEN 'MEAL'
      WHEN lower(rt.category) LIKE '%exerc%' OR lower(rt.category) LIKE '%activ%' THEN 'EXERCISE'
      WHEN lower(rt.category) LIKE '%hygien%' OR lower(rt.category) LIKE '%personal%' THEN 'HYGIENE'
      ELSE 'APPOINTMENT'
    END,
    rt.instructions_md,
    jsonb_build_object(
      'frequency',
        CASE
          WHEN upper(COALESCE(rt.recurrence_pattern->>'type', 'DAILY')) = 'WEEKLY' THEN 'WEEKLY'
          ELSE 'DAILY'
        END,
      'time', COALESCE(exec_times.times[1], '09:00'),
      'times', to_jsonb(COALESCE(exec_times.times, ARRAY['09:00']::text[])),
      'daysOfWeek',
        CASE
          WHEN upper(COALESCE(rt.recurrence_pattern->>'type', 'DAILY')) <> 'WEEKLY' THEN '[]'::jsonb
          ELSE COALESCE(
            (
              SELECT jsonb_agg(day_value::int ORDER BY day_value::int)
              FROM jsonb_array_elements_text(
                COALESCE(rt.recurrence_pattern->'days', '[]'::jsonb)
              ) AS days(day_value)
              WHERE day_value ~ '^[0-6]$'
            ),
            '[]'::jsonb
          )
        END
    ),
    COALESCE(rt.is_active, TRUE),
    rt.created_by,
    rt.created_at,
    COALESCE(rt.updated_at, rt.created_at, NOW())
  FROM routine_templates rt
  LEFT JOIN LATERAL (
    SELECT array_agg(ret.scheduled_time::text ORDER BY ret.scheduled_time) AS times
    FROM routine_execution_times ret
    WHERE ret.template_id = rt.id
  ) AS exec_times ON TRUE
  WHERE NOT EXISTS (
    SELECT 1 FROM routine_definitions rd WHERE rd.id = rt.id
  )
  ON CONFLICT (id) DO NOTHING;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Standalone legacy tasks (no template) become one-off canonical definitions.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.tasks') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO routine_definitions (
    id, patient_id, title, category, description, schedule_pattern,
    is_active, created_by, created_at, updated_at
  )
  SELECT
    t.id,
    t.patient_id,
    COALESCE(NULLIF(trim(t.title), ''), 'Routine'),
    CASE
      WHEN lower(t.category) LIKE '%medic%' THEN 'MEDICATION'
      WHEN lower(t.category) LIKE '%meal%' OR lower(t.category) LIKE '%food%' THEN 'MEAL'
      WHEN lower(t.category) LIKE '%exerc%' OR lower(t.category) LIKE '%activ%' THEN 'EXERCISE'
      WHEN lower(t.category) LIKE '%hygien%' OR lower(t.category) LIKE '%personal%' THEN 'HYGIENE'
      ELSE 'APPOINTMENT'
    END,
    t.instructions_md,
    jsonb_build_object(
      'frequency', 'DAILY',
      'time', to_char(t.scheduled_time, 'HH24:MI'),
      'times', jsonb_build_array(to_char(t.scheduled_time, 'HH24:MI')),
      'daysOfWeek', '[]'::jsonb
    ),
    TRUE,
    t.assigned_by,
    t.created_at,
    COALESCE(t.updated_at, t.created_at, NOW())
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND (t.template_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM routine_definitions rd WHERE rd.id = t.template_id
    ))
    AND NOT EXISTS (
      SELECT 1 FROM routine_definitions rd2 WHERE rd2.id = t.id
    )
  ON CONFLICT (id) DO NOTHING;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Backfill legacy task instances as canonical occurrences.
-- Historical states collapse into the only canonical non-completion state:
-- OVERDUE. Future PENDING tasks remain SCHEDULED; past-due PENDING tasks are
-- ONGOING so the replacement sweep can advance them naturally.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.tasks') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO routine_occurrences (
    id, routine_id, patient_id, scheduled_date, scheduled_time,
    status, started_at, completed_at, created_at
  )
  SELECT
    t.id,
    CASE
      WHEN t.template_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM routine_definitions rd WHERE rd.id = t.template_id)
      THEN t.template_id
      ELSE t.id
    END,
    t.patient_id,
    t.scheduled_date,
    t.scheduled_time,
    CASE
      WHEN t.status = 'DONE' THEN 'COMPLETED'
      WHEN t.scheduled_date > CURRENT_DATE
        OR (t.scheduled_date = CURRENT_DATE AND t.scheduled_time > CURRENT_TIME)
        THEN 'SCHEDULED'
      WHEN t.status IN ('MISSED', 'UNSURE', 'SKIPPED') THEN 'OVERDUE'
      ELSE 'ONGOING'
    END,
    CASE
      WHEN t.status = 'DONE' THEN COALESCE(t.completed_at, t.updated_at)
      WHEN t.scheduled_date < CURRENT_DATE
        OR (t.scheduled_date = CURRENT_DATE AND t.scheduled_time <= CURRENT_TIME)
        THEN COALESCE(t.updated_at, t.created_at)
      ELSE NULL
    END,
    CASE WHEN t.status = 'DONE' THEN COALESCE(t.completed_at, t.updated_at) ELSE NULL END,
    t.created_at
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM routine_definitions rd
      WHERE rd.id = CASE
        WHEN t.template_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM routine_definitions rd2 WHERE rd2.id = t.template_id)
        THEN t.template_id
        ELSE t.id
      END
    )
  ON CONFLICT DO NOTHING;
END $$;

-- -----------------------------------------------------------------------------
-- 6. Backfill completion sign-offs for legacy DONE tasks.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.tasks') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO routine_completions (
    occurrence_id, completed_by, completion_source, notes, completed_at
  )
  SELECT
    o.id,
    COALESCE(t.completed_by, t.assigned_by),
    CASE
      WHEN u.role = 'PATIENT' THEN 'PATIENT_SELF'
      WHEN u.role = 'FAMILY' THEN 'FAMILY'
      ELSE 'CAREGIVER_ASSISTED'
    END,
    t.caregiver_note,
    COALESCE(t.completed_at, t.updated_at, t.created_at, NOW())
  FROM tasks t
  JOIN routine_occurrences o ON o.id = t.id
  LEFT JOIN users u ON u.id = COALESCE(t.completed_by, t.assigned_by)
  WHERE t.status = 'DONE'
    AND t.deleted_at IS NULL
    AND COALESCE(t.completed_by, t.assigned_by) IS NOT NULL
  ON CONFLICT (occurrence_id) DO NOTHING;
END $$;
