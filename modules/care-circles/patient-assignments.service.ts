/**
 * SureStep — modules/care-circles/patient-assignments.service.ts
 *
 * Patient Assignment Service.
 * Scopes an active caregiver's routine, agenda, and telemetry access to specific Patient(s).
 * Baselines:
 *   - docs/architecture/TARGET_ARCHITECTURE.md (Sections 3.3, 4.3)
 *   - docs/workflows/03-CARE-CIRCLE.md (Section 8)
 *   - docs/workflows/06-CAREGIVER-RELATIONSHIP.md (Sections 6, 7)
 */

import pool from '../../db/config';
import { AppError } from '../../shared/errors/AppError';
import { syncUserSocketRooms } from '../../shared/realtime/socketRooms';

export class PatientAssignmentsService {
  /**
   * Assign an active Caregiver to a Patient.
   * Invariants:
   *   - Actor must be Circle Owner or hold 'Manage Caregiver Relationships'.
   *   - Caregiver relationship must be in ACTIVE or NOTICE_PERIOD status.
   *   - Patient must be associated with the same Care Circle.
   *   - Circle membership and caregiver relationship alone do NOT grant patient assignment.
   */
  async assignCaregiverToPatient(relationshipId: string, patientId: string, actorId: string) {
    // 1. Fetch relationship with Circle info
    const relRes = await pool.query(
      `SELECT cr.*, c.owner_id, c.terminated_at as circle_terminated_at
       FROM caregiver_relationships cr
       JOIN care_circles c ON cr.circle_id = c.id
       WHERE cr.id = $1`,
      [relationshipId]
    );
    const rel = relRes.rows[0];
    if (!rel || rel.circle_terminated_at) {
      throw new AppError('RELATIONSHIP_NOT_FOUND', 'Caregiver relationship not found or circle terminated', 404);
    }

    // 2. Authorize actor
    await this.assertCanManageCaregivers(rel.circle_id, actorId, rel.owner_id);

    // 3. Verify relationship status is ACTIVE or NOTICE_PERIOD
    if (rel.status !== 'ACTIVE' && rel.status !== 'NOTICE_PERIOD') {
      throw new AppError(
        'INVALID_RELATIONSHIP_STATUS',
        `Caregiver relationship must be ACTIVE or NOTICE_PERIOD to assign a patient (current: ${rel.status})`,
        400
      );
    }

    // 4. Verify patient belongs to the same Care Circle
    const patientAssoc = await pool.query(
      `SELECT id FROM patient_circle_associations
       WHERE circle_id = $1 AND patient_id = $2`,
      [rel.circle_id, patientId]
    );
    if (patientAssoc.rows.length === 0) {
      throw new AppError(
        'PATIENT_NOT_IN_CIRCLE',
        'Target patient is not associated with this Care Circle',
        400
      );
    }

    // 5. Upsert patient assignment
    const assignRes = await pool.query(
      `INSERT INTO patient_assignments (relationship_id, patient_id, assigned_by, is_active)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (relationship_id, patient_id)
       DO UPDATE SET is_active = TRUE, assigned_by = EXCLUDED.assigned_by, assigned_at = NOW()
       RETURNING *`,
      [relationshipId, patientId, actorId]
    );

    await syncUserSocketRooms(rel.caregiver_id);
    return assignRes.rows[0];
  }

  /**
   * Revoke a Caregiver-Patient assignment.
   * Actor must be Circle Owner or hold 'Manage Caregiver Relationships'.
   */
  async revokePatientAssignment(relationshipId: string, patientId: string, actorId: string) {
    const relRes = await pool.query(
      `SELECT cr.*, c.owner_id, c.terminated_at as circle_terminated_at
       FROM caregiver_relationships cr
       JOIN care_circles c ON cr.circle_id = c.id
       WHERE cr.id = $1`,
      [relationshipId]
    );
    const rel = relRes.rows[0];
    if (!rel || rel.circle_terminated_at) {
      throw new AppError('RELATIONSHIP_NOT_FOUND', 'Caregiver relationship not found or circle terminated', 404);
    }

    await this.assertCanManageCaregivers(rel.circle_id, actorId, rel.owner_id);

    const updateRes = await pool.query(
      `UPDATE patient_assignments
       SET is_active = FALSE
       WHERE relationship_id = $1 AND patient_id = $2
       RETURNING *`,
      [relationshipId, patientId]
    );

    if (updateRes.rows.length === 0) {
      throw new AppError('ASSIGNMENT_NOT_FOUND', 'Patient assignment not found', 404);
    }

    await syncUserSocketRooms(rel.caregiver_id);
    return updateRes.rows[0];
  }

  /**
   * Check if a Caregiver is actively assigned to a Patient.
   * Checks both relationship status (ACTIVE or NOTICE_PERIOD) and assignment (is_active = TRUE).
   */
  async isCaregiverAssignedToPatient(caregiverUserId: string, patientId: string): Promise<boolean> {
    const res = await pool.query(
      `SELECT pa.id
       FROM patient_assignments pa
       JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
       JOIN care_circles c ON cr.circle_id = c.id
       WHERE cr.caregiver_id = $1
         AND pa.patient_id = $2
         AND pa.is_active = TRUE
         AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
         AND c.terminated_at IS NULL`,
      [caregiverUserId, patientId]
    );

    return res.rows.length > 0;
  }

  /**
   * List Patients assigned to a Caregiver.
   */
  async getCaregiverAssignedPatients(caregiverUserId: string) {
    const res = await pool.query(
      `SELECT pa.*, u.name as patient_name, u.photo_url, u.date_of_birth, u.gender, cr.circle_id, cr.status as relationship_status
       FROM patient_assignments pa
       JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
       JOIN care_circles c ON cr.circle_id = c.id
       JOIN users u ON pa.patient_id = u.id
       WHERE cr.caregiver_id = $1
         AND pa.is_active = TRUE
         AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
         AND c.terminated_at IS NULL
       ORDER BY pa.assigned_at DESC`,
      [caregiverUserId]
    );

    return res.rows;
  }

  private async assertCanManageCaregivers(circleId: string, actorId: string, ownerId: string) {
    if (actorId === ownerId) {
      return;
    }

    const permRes = await pool.query(
      `SELECT p.id FROM circle_permissions p
       JOIN care_circle_members m ON p.member_id = m.id
       WHERE m.circle_id = $1 AND m.user_id = $2 AND p.permission_name = 'Manage Caregiver Relationships'`,
      [circleId, actorId]
    );

    if (permRes.rows.length === 0) {
      throw new AppError(
        'FORBIDDEN',
        'Only the Circle Owner or a member with "Manage Caregiver Relationships" can perform this action',
        403
      );
    }
  }
}

export const patientAssignmentsService = new PatientAssignmentsService();

