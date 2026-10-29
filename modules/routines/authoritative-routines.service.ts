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
 *   - Replacement Rule: when next occurrence arrives, ongoing occurrence transitions to Overdue.
 *   - Historical Immutability: definition edits never rewrite Completed/Overdue occurrences.
 */

import pool from '../../db/config';
import { AppError } from '../../shared/errors/AppError';
import { User } from '../../shared/types';

export interface CreateRoutineDefinitionInput {
  title: string;
  category: 'MEDICATION' | 'MEAL' | 'EXERCISE' | 'HYGIENE' | 'APPOINTMENT';
  description?: string | null;
  schedulePattern?: {
    frequency?: string;
    time?: string;
    daysOfWeek?: number[];
  };
}

export interface UpdateRoutineDefinitionInput {
  title?: string;
  category?: 'MEDICATION' | 'MEAL' | 'EXERCISE' | 'HYGIENE' | 'APPOINTMENT';
  description?: string | null;
  schedulePattern?: any;
  isActive?: boolean;
}

export class AuthoritativeRoutinesService {
  /**
   * 1. Create a Routine Definition
   */
  async createDefinition(patientId: string, actorId: string, input: CreateRoutineDefinitionInput) {
    if (!input.title || input.title.trim().length < 2) {
      throw new AppError('VALIDATION_ERROR', 'Title must be at least 2 characters long', 400);
    }

    const validCategories = ['MEDICATION', 'MEAL', 'EXERCISE', 'HYGIENE', 'APPOINTMENT'];
    if (!validCategories.includes(input.category)) {
      throw new AppError('VALIDATION_ERROR', `Category must be one of: ${validCategories.join(', ')}`, 400);
    }

    const pattern = input.schedulePattern || { frequency: 'DAILY', time: '09:00' };

    const res = await pool.query(
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
      ]
    );

    const definition = res.rows[0];

    // Seed an initial occurrence for today so it's immediately available on agenda
    const today = new Date().toISOString().split('T')[0];
    const time = pattern.time || '09:00';
    await pool.query(
      `INSERT INTO routine_occurrences (
         routine_id, patient_id, scheduled_date, scheduled_time, status
       ) VALUES ($1, $2, $3, $4, 'SCHEDULED')
       ON CONFLICT DO NOTHING`,
      [definition.id, patientId, today, time]
    );

    return definition;
  }

  /**
   * 2. Update a Routine Definition
   */
  async updateDefinition(patientId: string, routineId: string, input: UpdateRoutineDefinitionInput) {
    // IDOR check: verify definition belongs to patientId
    const check = await pool.query(
      `SELECT * FROM routine_definitions WHERE id = $1 AND patient_id = $2`,
      [routineId, patientId]
    );
    if (!check.rows[0]) {
      throw new AppError('NOT_FOUND', 'Routine definition not found for this patient', 404);
    }

    const current = check.rows[0];
    const newTitle = input.title !== undefined ? input.title.trim() : current.title;
    const newCategory = input.category !== undefined ? input.category : current.category;
    const newDesc = input.description !== undefined ? input.description : current.description;
    const newPattern = input.schedulePattern !== undefined ? JSON.stringify(input.schedulePattern) : current.schedule_pattern;
    const newActive = input.isActive !== undefined ? input.isActive : current.is_active;

    if (newTitle.length < 2) {
      throw new AppError('VALIDATION_ERROR', 'Title must be at least 2 characters long', 400);
    }

    const res = await pool.query(
      `UPDATE routine_definitions
       SET title = $1, category = $2, description = $3, schedule_pattern = $4, is_active = $5, updated_at = NOW()
       WHERE id = $6 AND patient_id = $7
       RETURNING *`,
      [newTitle, newCategory, newDesc, newPattern, newActive, routineId, patientId]
    );

    return res.rows[0];
  }

  /**
   * 3. Get Routine Definitions for a Patient
   */
  async getDefinitions(patientId: string, onlyActive = true) {
    let sql = `SELECT * FROM routine_definitions WHERE patient_id = $1`;
    if (onlyActive) {
      sql += ` AND is_active = TRUE`;
    }
    sql += ` ORDER BY created_at DESC`;

    const res = await pool.query(sql, [patientId]);
    return res.rows;
  }

  /**
   * 4. Get a single Routine Definition
   */
  async getDefinitionById(patientId: string, routineId: string) {
    const res = await pool.query(
      `SELECT * FROM routine_definitions WHERE id = $1 AND patient_id = $2`,
      [routineId, patientId]
    );
    if (!res.rows[0]) {
      throw new AppError('NOT_FOUND', 'Routine definition not found for this patient', 404);
    }
    return res.rows[0];
  }

  /**
   * 5. Delete (deactivate) a Routine Definition
   */
  async deleteDefinition(patientId: string, routineId: string) {
    const check = await pool.query(
      `SELECT * FROM routine_definitions WHERE id = $1 AND patient_id = $2`,
      [routineId, patientId]
    );
    if (!check.rows[0]) {
      throw new AppError('NOT_FOUND', 'Routine definition not found for this patient', 404);
    }

    const res = await pool.query(
      `UPDATE routine_definitions SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND patient_id = $2
       RETURNING *`,
      [routineId, patientId]
    );
    return res.rows[0];
  }

  /**
   * 6. List Routine Occurrences for a Patient with Replacement Overdue Evaluation
   */
  async listOccurrences(patientId: string, date?: string) {
    const targetDate = date || new Date().toISOString().split('T')[0];

    // Evaluate replacement overdue rule before returning
    await this.evaluateReplacementOverdue(patientId, targetDate);

    const res = await pool.query(
      `SELECT o.*, d.title, d.category, d.description,
              c.completed_by, c.completion_source, c.notes as completion_notes, c.completed_at as signed_off_at
       FROM routine_occurrences o
       JOIN routine_definitions d ON o.routine_id = d.id
       LEFT JOIN routine_completions c ON o.id = c.occurrence_id
       WHERE o.patient_id = $1 AND o.scheduled_date = $2
       ORDER BY o.scheduled_time ASC`,
      [patientId, targetDate]
    );

    return res.rows;
  }

  /**
   * 7. Sign off a Routine Occurrence
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
    notes?: string
  ) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Fetch occurrence with IDOR guard
      const occRes = await client.query(
        `SELECT * FROM routine_occurrences
         WHERE id = $1
         FOR UPDATE`,
        [occurrenceId]
      );
      const occ = occRes.rows[0];
      if (!occ) {
        throw new AppError('NOT_FOUND', 'Routine occurrence not found', 404);
      }

      // If client supplied patientId or routineId, ensure exact match
      if ((patientId && occ.patient_id !== patientId) || (routineId && occ.routine_id !== routineId)) {
        throw new AppError('NOT_FOUND', 'Routine occurrence not found for this patient and routine', 404);
      }

      const targetPatientId = occ.patient_id;

      // 2. Resource-Aware Authorization Guard on targetPatientId
      let isAuthorized = false;

      // 2a. Patient self sign-off only. A Patient must never fall through to the
      // family/Circle-member branch for another Patient.
      if (actorUser.role === 'PATIENT') {
        if (actorUser.id !== targetPatientId) {
          throw new AppError('FORBIDDEN', 'Not authorized to sign off routine occurrences for this patient', 403);
        }
        isAuthorized = true;
      }

      // 2b. Caregiver sign-off (requires active/notice-period relationship + active patient assignment)
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
          [actorUser.id, targetPatientId]
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
          [targetPatientId, actorUser.id]
        );
        if (familyCheck.rows.length > 0) {
          isAuthorized = true;
        }
      }

      if (!isAuthorized) {
        throw new AppError('FORBIDDEN', 'Not authorized to sign off routine occurrences for this patient', 403);
      }

      if (occ.status === 'COMPLETED') {
        throw new AppError('ALREADY_COMPLETED', 'This routine occurrence is already marked completed', 400);
      }

      if (occ.status === 'CANCELLED') {
        throw new AppError('INVALID_STATE', 'Cannot complete a cancelled routine occurrence', 400);
      }

      // 2. Determine completion source
      let completionSource: 'PATIENT_SELF' | 'CAREGIVER_ASSISTED' | 'FAMILY';
      if (actorUser.role === 'PATIENT') {
        completionSource = 'PATIENT_SELF';
      } else if (actorUser.role === 'CAREGIVER') {
        completionSource = 'CAREGIVER_ASSISTED';
      } else {
        completionSource = 'FAMILY';
      }

      // 3. Update occurrence status
      const updatedOccRes = await client.query(
        `UPDATE routine_occurrences
         SET status = 'COMPLETED', completed_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [occurrenceId]
      );

      // 4. Insert completion sign-off record
      const compRes = await client.query(
        `INSERT INTO routine_completions (
           occurrence_id, completed_by, completion_source, notes, completed_at
         ) VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (occurrence_id)
         DO UPDATE SET completed_by = EXCLUDED.completed_by, notes = EXCLUDED.notes, completed_at = NOW()
         RETURNING *`,
        [occurrenceId, actorUser.id, completionSource, notes || null]
      );

      await client.query('COMMIT');
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

  /**
   * Helper: Replacement Overdue Rule (TARGET_ARCHITECTURE.md §5.2):
   * If occurrence N is Ongoing when occurrence N+1 arrives, occurrence N transitions to Overdue.
   * Also transitions past-due scheduled occurrences on earlier dates to OVERDUE.
   */
  private async evaluateReplacementOverdue(patientId: string, currentDate: string) {
    // 1. Mark past-date scheduled/ongoing occurrences as OVERDUE
    await pool.query(
      `UPDATE routine_occurrences
       SET status = 'OVERDUE'
       WHERE patient_id = $1
         AND scheduled_date < $2
         AND status IN ('SCHEDULED', 'ONGOING')`,
      [patientId, currentDate]
    );

    // 2. On today: if multiple occurrences exist for the same routine,
    // any ONGOING occurrence earlier than the latest scheduled time that is now past becomes OVERDUE
    await pool.query(
      `UPDATE routine_occurrences o
       SET status = 'OVERDUE'
       WHERE o.patient_id = $1
         AND o.scheduled_date = $2
         AND o.status = 'ONGOING'
         AND o.scheduled_time < CURRENT_TIME - INTERVAL '15 minutes'
         AND EXISTS (
           SELECT 1 FROM routine_occurrences next_occ
           WHERE next_occ.routine_id = o.routine_id
             AND next_occ.scheduled_date = o.scheduled_date
             AND next_occ.scheduled_time > o.scheduled_time
             AND next_occ.scheduled_time <= CURRENT_TIME
         )`,
      [patientId, currentDate]
    );
  }
}

export const authoritativeRoutinesService = new AuthoritativeRoutinesService();

