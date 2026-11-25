/**
 * SureStep — modules/routines/authoritative-routines.service.ts
 *
 * Authoritative Routine Definitions, Occurrences, and Sign-Off Service.
 * Baselines:
 *   - docs/architecture/TARGET_ARCHITECTURE.md (Sections 3.4, 4.3, 5.2)
 *   - docs/workflows/04-PATIENT-CARE.md (Sections 3, 12, 14, 26)
 *
 * Invariants:
 *   - Caregivers strictly forbidden from routine definition CRUD (403 CAREGIVER_ROUTINE_CRUD_FORBIDDEN).
 *   - Circle ownership alone does not grant routine definition CRUD.
 *   - Assigned Caregivers with active assignment are authorized for routine occurrence sign-off.
 *   - Occurrences follow: Scheduled -> Ongoing -> Completed / Overdue.
 *   - No Skip, Missed, or Snoozed states.
 *   - Replacement Rule: when the next occurrence arrives, an unfinished ONGOING
 *     occurrence transitions to OVERDUE. Completed occurrences never change.
 *   - Historical Immutability: definition edits never rewrite Completed/Overdue
 *     occurrences. Future SCHEDULED occurrences are cancelled and regenerated.
 */

import pool from '../../db/config';
import { AppError } from '../../shared/errors/AppError';
import { User } from '../../shared/types';

export interface RoutineSchedulePatternInput {
  frequency?: string;
  time?: string;
  times?: string[];
  daysOfWeek?: Array<number | string>;
}

export interface CreateRoutineDefinitionInput {
  title: string;
  category: 'MEDICATION' | 'MEAL' | 'EXERCISE' | 'HYGIENE' | 'APPOINTMENT';
  description?: string | null;
  schedulePattern?: RoutineSchedulePatternInput;
}

export interface UpdateRoutineDefinitionInput {
  title?: string;
  category?: 'MEDICATION' | 'MEAL' | 'EXERCISE' | 'HYGIENE' | 'APPOINTMENT';
  description?: string | null;
  schedulePattern?: RoutineSchedulePatternInput;
  isActive?: boolean;
}

export interface NormalizedSchedulePattern {
  frequency: 'DAILY' | 'WEEKLY';
  time: string;
  times: string[];
  daysOfWeek: number[];
}

export const ROUTINE_CATEGORIES = [
  'MEDICATION',
  'MEAL',
  'EXERCISE',
  'HYGIENE',
  'APPOINTMENT',
] as const;

/** Number of days, including today, for which occurrences are generated. */
export const OCCURRENCE_HORIZON_DAYS = 14;

const MAX_TIMES_PER_DAY = 24;
const DEFAULT_TIME = '09:00';

function normalizeTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Normalize the persisted schedule shape. Legacy shapes used `type`/`days`
 * or a single `time`; the canonical shape is frequency + times[] + daysOfWeek[].
 */
export function normalizeSchedulePattern(raw: unknown): NormalizedSchedulePattern {
  let input: any = raw;
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch {
      input = {};
    }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    input = {};
  }

  const frequency: 'DAILY' | 'WEEKLY' =
    String(input.frequency ?? input.type ?? '').toUpperCase() === 'WEEKLY'
      ? 'WEEKLY'
      : 'DAILY';

  const candidateTimes: unknown[] = Array.isArray(input.times)
    ? input.times
    : Array.isArray(input.execution_times)
      ? input.execution_times.map((entry: any) =>
          typeof entry === 'string' ? entry : entry?.scheduled_time,
        )
      : [];
  if (candidateTimes.length === 0) {
    candidateTimes.push(input.time ?? DEFAULT_TIME);
  }

  const times = Array.from(
    new Set<string>(
      candidateTimes
        .map(normalizeTime)
        .filter((value): value is string => value !== null),
    ),
  )
    .sort()
    .slice(0, MAX_TIMES_PER_DAY);

  if (times.length === 0) times.push(DEFAULT_TIME);

  const rawDays = Array.isArray(input.daysOfWeek)
    ? input.daysOfWeek
    : Array.isArray(input.days)
      ? input.days
      : [];
  const daysOfWeek: number[] = Array.from(
    new Set<number>(
      rawDays
        .map((day: any) => Number(day))
        .filter((day: number) => Number.isInteger(day) && day >= 0 && day <= 6),
    ),
  ).sort((a, b) => a - b);

  return {
    frequency,
    time: times[0]!,
    times,
    daysOfWeek: frequency === 'WEEKLY'
      ? (daysOfWeek.length > 0 ? daysOfWeek : [0, 1, 2, 3, 4, 5, 6])
      : [],
  };
}

interface OccurrenceWindowSlot {
  scheduled_date: string;
  dow: number;
}

export class AuthoritativeRoutinesService {
  /**
   * 1. Create a Routine Definition and materialize its occurrence horizon.
   */
  async createDefinition(patientId: string, actorId: string, input: CreateRoutineDefinitionInput) {
    if (!input.title || input.title.trim().length < 2) {
      throw new AppError('VALIDATION_ERROR', 'Title must be at least 2 characters long', 400);
    }

    if (!ROUTINE_CATEGORIES.includes(input.category)) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Category must be one of: ${ROUTINE_CATEGORIES.join(', ')}`,
        400,
      );
    }

    const pattern = normalizeSchedulePattern(
      input.schedulePattern ?? { frequency: 'DAILY', time: DEFAULT_TIME },
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `INSERT INTO routine_definitions (
           patient_id, title, category, description, schedule_pattern, is_active, created_by
         ) VALUES ($1, $2, $3, $4, $5, TRUE, $6)
         RETURNING *`,
        [
          patientId,
          input.title.trim(),
          input.category,
          input.description || null,
          JSON.stringify(pattern),
          actorId,
        ],
      );

      const definition = res.rows[0];
      await this.materializeDefinition(definition, client);
      await client.query('COMMIT');
      return definition;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * 2. Update a Routine Definition.
   *
   * Future SCHEDULED occurrences are cancelled before regenerating the new
   * schedule. Completed, Ongoing, and Overdue history is never rewritten.
   */
  async updateDefinition(patientId: string, routineId: string, input: UpdateRoutineDefinitionInput) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const check = await client.query(
        `SELECT * FROM routine_definitions WHERE id = $1 AND patient_id = $2 FOR UPDATE`,
        [routineId, patientId],
      );
      if (!check.rows[0]) {
        throw new AppError('NOT_FOUND', 'Routine definition not found for this patient', 404);
      }

      const current = check.rows[0];
      const newTitle = input.title !== undefined ? input.title.trim() : current.title;
      const newCategory = input.category !== undefined ? input.category : current.category;
      const newDesc = input.description !== undefined ? input.description : current.description;
      const newActive = input.isActive !== undefined ? input.isActive : current.is_active;
      const newPattern = input.schedulePattern !== undefined
        ? normalizeSchedulePattern(input.schedulePattern)
        : normalizeSchedulePattern(current.schedule_pattern);

      if (newTitle.length < 2) {
        throw new AppError('VALIDATION_ERROR', 'Title must be at least 2 characters long', 400);
      }
      if (!ROUTINE_CATEGORIES.includes(newCategory)) {
        throw new AppError(
          'VALIDATION_ERROR',
          `Category must be one of: ${ROUTINE_CATEGORIES.join(', ')}`,
          400,
        );
      }

      const res = await client.query(
        `UPDATE routine_definitions
         SET title = $1, category = $2, description = $3, schedule_pattern = $4,
             is_active = $5, updated_at = NOW()
         WHERE id = $6 AND patient_id = $7
         RETURNING *`,
        [newTitle, newCategory, newDesc, JSON.stringify(newPattern), newActive, routineId, patientId],
      );

      await client.query(
        `UPDATE routine_occurrences
         SET status = 'CANCELLED'
         WHERE routine_id = $1
           AND status = 'SCHEDULED'
           AND scheduled_date >= CURRENT_DATE`,
        [routineId],
      );

      const definition = res.rows[0];
      if (definition.is_active) {
        await this.materializeDefinition(definition, client);
      }

      await client.query('COMMIT');
      return definition;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * 3. Get Routine Definitions for a Patient (materializes the horizon first).
   */
  async getDefinitions(patientId: string, onlyActive = true) {
    await this.materializePatient(patientId);

    let sql = `SELECT * FROM routine_definitions WHERE patient_id = $1`;
    if (onlyActive) {
      sql += ` AND is_active = TRUE`;
    }
    sql += ` ORDER BY created_at DESC`;

    const res = await pool.query(sql, [patientId]);
    return res.rows;
  }

  /**
   * 4. Get a single Routine Definition.
   */
  async getDefinitionById(patientId: string, routineId: string) {
    const res = await pool.query(
      `SELECT * FROM routine_definitions WHERE id = $1 AND patient_id = $2`,
      [routineId, patientId],
    );
    if (!res.rows[0]) {
      throw new AppError('NOT_FOUND', 'Routine definition not found for this patient', 404);
    }
    return res.rows[0];
  }

  /**
   * 5. Delete (deactivate) a Routine Definition.
   */
  async deleteDefinition(patientId: string, routineId: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query(
        `UPDATE routine_definitions
         SET is_active = FALSE, updated_at = NOW()
         WHERE id = $1 AND patient_id = $2
         RETURNING *`,
        [routineId, patientId],
      );
      if (!res.rows[0]) {
        throw new AppError('NOT_FOUND', 'Routine definition not found for this patient', 404);
      }

      await client.query(
        `UPDATE routine_occurrences
         SET status = 'CANCELLED'
         WHERE routine_id = $1
           AND status = 'SCHEDULED'
           AND scheduled_date >= CURRENT_DATE`,
        [routineId],
      );

      await client.query('COMMIT');
      return res.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * 6. List Routine Occurrences for a Patient with Replacement Overdue Evaluation.
   */
  async listOccurrences(patientId: string, date?: string) {
    await this.materializePatient(patientId);
    await this.sweepOccurrenceStates(patientId);

    const res = await pool.query(
      `SELECT o.*, d.title, d.category, d.description,
              c.completed_by, c.completion_source, c.notes as completion_notes,
              c.completed_at as signed_off_at
       FROM routine_occurrences o
       JOIN routine_definitions d ON o.routine_id = d.id
       LEFT JOIN routine_completions c ON o.id = c.occurrence_id
       WHERE o.patient_id = $1 AND o.scheduled_date = COALESCE($2::date, CURRENT_DATE)
       ORDER BY o.scheduled_time ASC`,
      [patientId, date || null],
    );

    return res.rows;
  }

  /**
   * 7. Sign off a Routine Occurrence.
   * Invariant (04-PATIENT-CARE.md §3, §12, §14):
   *   - Care participation action confirming task completion.
   *   - Records completion in routine_completions.
   *   - Transitions occurrence status from SCHEDULED or ONGOING to COMPLETED.
   *   - No skip or missed state.
   */
  async signOffOccurrence(
    patientId: string,
    routineId: string,
    occurrenceId: string,
    actorUser: User,
    notes?: string,
  ) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const occRes = await client.query(
        `SELECT * FROM routine_occurrences WHERE id = $1 FOR UPDATE`,
        [occurrenceId],
      );
      const occ = occRes.rows[0];
      if (!occ) {
        throw new AppError('NOT_FOUND', 'Routine occurrence not found', 404);
      }

      if ((patientId && occ.patient_id !== patientId) || (routineId && occ.routine_id !== routineId)) {
        throw new AppError('NOT_FOUND', 'Routine occurrence not found for this patient and routine', 404);
      }

      const targetPatientId = occ.patient_id;
      let isAuthorized = false;

      // 2a. Patient self sign-off only. A Patient must never fall through to the
      // family/Circle-member branch for another Patient.
      if (actorUser.role === 'PATIENT') {
        if (actorUser.id !== targetPatientId) {
          throw new AppError(
            'FORBIDDEN',
            'Not authorized to sign off routine occurrences for this patient',
            403,
          );
        }
        isAuthorized = true;
      }

      // 2b. Caregiver sign-off (active/notice-period relationship + active assignment)
      if (!isAuthorized && actorUser.role === 'CAREGIVER') {
        const assignCheck = await client.query(
          `SELECT pa.id
           FROM patient_assignments pa
           JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
           JOIN care_circles c ON cr.circle_id = c.id
           WHERE cr.caregiver_id = $1
             AND pa.patient_id = $2
             AND pa.is_active = TRUE
             AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
             AND c.terminated_at IS NULL`,
          [actorUser.id, targetPatientId],
        );
        if (assignCheck.rows.length > 0) {
          isAuthorized = true;
        } else {
          throw new AppError('CAREGIVER_NOT_ASSIGNED', 'Caregiver is not assigned to this patient', 403);
        }
      }

      // 2c. Family Member / Circle Member sign-off
      if (!isAuthorized) {
        const familyCheck = await client.query(
          `SELECT c.id
           FROM patient_circle_associations pca
           JOIN care_circles c ON pca.circle_id = c.id
           WHERE pca.patient_id = $1 AND c.terminated_at IS NULL
             AND (
               c.owner_id = $2
               OR EXISTS (
                 SELECT 1 FROM care_circle_members m
                 WHERE m.circle_id = c.id AND m.user_id = $2
               )
             )`,
          [targetPatientId, actorUser.id],
        );
        if (familyCheck.rows.length > 0) {
          isAuthorized = true;
        }
      }

      if (!isAuthorized) {
        throw new AppError(
          'FORBIDDEN',
          'Not authorized to sign off routine occurrences for this patient',
          403,
        );
      }

      if (occ.status === 'COMPLETED') {
        throw new AppError('ALREADY_COMPLETED', 'This routine occurrence is already marked completed', 400);
      }
      if (occ.status === 'CANCELLED') {
        throw new AppError('INVALID_STATE', 'Cannot complete a cancelled routine occurrence', 400);
      }
      if (occ.status === 'OVERDUE') {
        throw new AppError(
          'INVALID_STATE',
          'This occurrence was replaced by the next routine occurrence and is overdue',
          400,
        );
      }

      let completionSource: 'PATIENT_SELF' | 'CAREGIVER_ASSISTED' | 'FAMILY';
      if (actorUser.role === 'PATIENT') {
        completionSource = 'PATIENT_SELF';
      } else if (actorUser.role === 'CAREGIVER') {
        completionSource = 'CAREGIVER_ASSISTED';
      } else {
        completionSource = 'FAMILY';
      }

      const updatedOccRes = await client.query(
        `UPDATE routine_occurrences
         SET status = 'COMPLETED', completed_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [occurrenceId],
      );

      const compRes = await client.query(
        `INSERT INTO routine_completions (
           occurrence_id, completed_by, completion_source, notes, completed_at
         ) VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (occurrence_id)
         DO UPDATE SET completed_by = EXCLUDED.completed_by,
                       completion_source = EXCLUDED.completion_source,
                       notes = EXCLUDED.notes,
                       completed_at = NOW()
         RETURNING *`,
        [occurrenceId, actorUser.id, completionSource, notes || null],
      );

      await client.query('COMMIT');

      try {
        const { io } = await import('../../server');
        const payload = {
          occurrenceId,
          patientId: occ.patient_id,
          routineId: occ.routine_id,
          status: 'COMPLETED',
          completedBy: actorUser.id,
          completedAt: compRes.rows[0].completed_at,
        };
        io.to(`patient:${occ.patient_id}`).emit('routine:occurrence:updated', payload);
        io.to(`patient:${occ.patient_id}`).emit('routine:update', payload);
      } catch (_) {
        // Socket fan-out is best-effort; the sign-off is already durable.
      }

      return {
        occurrence: updatedOccRes.rows[0],
        completion: compRes.rows[0],
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── Materialization & State Sweeps ────────────────────────────────────────

  private async getOccurrenceWindow(
    client: { query: (text: string, params?: any[]) => Promise<any> },
    horizonDays = OCCURRENCE_HORIZON_DAYS,
  ): Promise<OccurrenceWindowSlot[]> {
    const res = await client.query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS scheduled_date,
              EXTRACT(DOW FROM d)::int AS dow
       FROM generate_series(
         CURRENT_DATE::timestamp,
         (CURRENT_DATE + ($1::int - 1))::timestamp,
         interval '1 day'
       ) AS d`,
      [horizonDays],
    );
    return res.rows;
  }

  /**
   * Idempotently generate all occurrence slots for one definition over the
   * current horizon. No-op for inactive definitions.
   */
  private async materializeDefinition(definition: any, client: any = pool, horizonDays = OCCURRENCE_HORIZON_DAYS) {
    if (!definition?.is_active) return 0;

    const pattern = normalizeSchedulePattern(definition.schedule_pattern);
    const window = await this.getOccurrenceWindow(client, horizonDays);
    const dates: string[] = [];
    const times: string[] = [];

    for (const slot of window) {
      if (pattern.frequency === 'WEEKLY' && !pattern.daysOfWeek.includes(slot.dow)) {
        continue;
      }
      for (const time of pattern.times) {
        dates.push(slot.scheduled_date);
        times.push(time);
      }
    }

    if (dates.length === 0) return 0;

    const res = await client.query(
      `INSERT INTO routine_occurrences (
         routine_id, patient_id, scheduled_date, scheduled_time, status
       )
       SELECT $1::uuid, $2::uuid, slot_date::date, slot_time::time, 'SCHEDULED'
       FROM UNNEST($3::text[], $4::text[]) AS slot(slot_date, slot_time)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [definition.id, definition.patient_id, dates, times],
    );

    return res.rowCount ?? 0;
  }

  /** Materialize the occurrence horizon for every active definition of a patient. */
  async materializePatient(patientId: string, client: any = pool) {
    const defs = await client.query(
      `SELECT * FROM routine_definitions WHERE patient_id = $1 AND is_active = TRUE`,
      [patientId],
    );
    if (defs.rows.length === 0) return 0;

    let created = 0;
    for (const definition of defs.rows) {
      created += await this.materializeDefinition(definition, client);
    }
    return created;
  }

  /** Materialize the occurrence horizon for every active definition. */
  async materializeAllActive(client: any = pool) {
    const defs = await client.query(
      `SELECT * FROM routine_definitions WHERE is_active = TRUE ORDER BY patient_id`,
    );

    let created = 0;
    for (const definition of defs.rows) {
      created += await this.materializeDefinition(definition, client);
    }
    return created;
  }

  /**
   * Advance the canonical occurrence lifecycle:
   *   SCHEDULED -> ONGOING once the scheduled slot arrives.
   *   ONGOING -> OVERDUE when a later occurrence slot has arrived.
   * Completed occurrences are never touched.
   */
  async sweepOccurrenceStates(patientId?: string, client: any = pool) {
    const params: any[] = patientId ? [patientId] : [];
    const patientFilter = patientId ? ' AND patient_id = $1' : '';

    const startedRes = await client.query(
      `UPDATE routine_occurrences
       SET status = 'ONGOING', started_at = COALESCE(started_at, NOW())
       WHERE status = 'SCHEDULED'
         AND (
           scheduled_date < CURRENT_DATE
           OR (scheduled_date = CURRENT_DATE AND scheduled_time <= CURRENT_TIME)
         )${patientFilter}`,
      params,
    );

    const overdueRes = await client.query(
      `UPDATE routine_occurrences o
       SET status = 'OVERDUE'
       WHERE o.status = 'ONGOING'
         ${patientId ? 'AND o.patient_id = $1' : ''}
         AND EXISTS (
           SELECT 1
           FROM routine_occurrences n
           WHERE n.routine_id = o.routine_id
             AND n.status <> 'CANCELLED'
             AND (
               n.scheduled_date > o.scheduled_date
               OR (n.scheduled_date = o.scheduled_date AND n.scheduled_time > o.scheduled_time)
             )
             AND (
               n.scheduled_date < CURRENT_DATE
               OR (n.scheduled_date = CURRENT_DATE AND n.scheduled_time <= CURRENT_TIME)
             )
         )`,
      params,
    );

    return {
      started: startedRes.rowCount ?? 0,
      overdue: overdueRes.rowCount ?? 0,
    };
  }

  /** Cancel future SCHEDULED occurrences belonging to inactive definitions. */
  async cancelInactiveScheduled(client: any = pool) {
    const res = await client.query(
      `UPDATE routine_occurrences o
       SET status = 'CANCELLED'
       FROM routine_definitions d
       WHERE o.routine_id = d.id
         AND d.is_active = FALSE
         AND o.status = 'SCHEDULED'
         AND o.scheduled_date >= CURRENT_DATE`,
    );
    return res.rowCount ?? 0;
  }

  /**
   * Periodic sweep: extend the horizon, cancel orphaned future slots, and
   * advance Scheduled -> Ongoing -> Overdue states.
   */
  async sweepRoutineOccurrences() {
    const materialized = await this.materializeAllActive();
    const cancelled = await this.cancelInactiveScheduled();
    const states = await this.sweepOccurrenceStates();
    return { materialized, cancelled, ...states };
  }
}

export const authoritativeRoutinesService = new AuthoritativeRoutinesService();
