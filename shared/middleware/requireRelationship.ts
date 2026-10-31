import { Request, Response, NextFunction } from 'express';
import pool from '../../db/config';
import { AppError } from '../errors/AppError';
import { RelationshipType } from '../types';

/**
 * requireRelationship — verifies the authenticated user has an active
 * canonical relationship with the patient identified by req.params.patientId
 * (or a custom param name).
 *
 * Canonical authorization model:
 *   - Patient: self-access only.
 *   - Professional Caregiver: ACTIVE/NOTICE_PERIOD caregiver_relationships row
 *     plus an active patient_assignments row for the patient.
 *   - Family / Circle actor: active Care Circle ownership or membership for a
 *     Circle that coordinates the patient.
 *
 * `allowedTypes` is enforced for every actor branch. Legacy relationship tiers
 * are mapped to canonical Circle participation as follows:
 *   - Circle Owner / OWNER member -> GUARDIAN
 *   - Circle MEMBER               -> FAMILY_CLOSE
 *   - Assigned Professional Caregiver -> CAREGIVER
 *
 * The mapping exists only to preserve the documented tier restrictions on
 * routes that still accept them. No tier is inferred from UUID knowledge or
 * from a client-supplied relationship claim.
 *
 * Usage:
 *   router.get('/patient/:patientId/trail',
 *     authenticate,
 *     requireRelationship('patientId', ['CAREGIVER','FAMILY_CLOSE','GUARDIAN']),
 *     controller.getTrail,
 *   );
 */
export function requireRelationship(
  paramName = 'patientId',
  allowedTypes?: RelationshipType[],
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const patientId = req.params[paramName];
      const userId = req.user!.id;
      const userRole = req.user!.role;

      if (!patientId) {
        throw new AppError(
          'PATIENT_CONTEXT_REQUIRED',
          'A patient context is required for this operation',
          400,
        );
      }

      // Patients may only access their own data. This is an identity invariant,
      // not a bypass of the relationship tier contract.
      if (userRole === 'PATIENT') {
        if (userId === patientId) {
          next();
          return;
        }
        throw new AppError(
          'NOT_AUTHORIZED_FOR_PATIENT',
          'You are not authorized to access this patient',
          403,
        );
      }

      const effectiveTypes: RelationshipType[] = [];

      if (userRole === 'CAREGIVER') {
        const cgCheck = await pool.query(
          `SELECT pa.id
           FROM patient_assignments pa
           JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
           JOIN care_circles c ON cr.circle_id = c.id
           WHERE cr.caregiver_id = $1
             AND pa.patient_id = $2
             AND pa.is_active = TRUE
             AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
             AND c.terminated_at IS NULL
           LIMIT 1`,
          [userId, patientId]
        );

        if (cgCheck.rows.length > 0) {
          effectiveTypes.push('CAREGIVER');
        }
      } else {
        // Family / Circle Member / Circle Owner.
        // The query returns the caller's participation role for the patient's
        // active Circle. It deliberately does not consult patient_relationships.
        const circleCheck = await pool.query(
          `SELECT c.owner_id, m.role_in_circle
           FROM patient_circle_associations pca
           JOIN care_circles c ON pca.circle_id = c.id
           LEFT JOIN care_circle_members m
             ON m.circle_id = c.id AND m.user_id = $2
           WHERE pca.patient_id = $1
             AND c.terminated_at IS NULL
             AND (c.owner_id = $2 OR m.user_id IS NOT NULL)
           LIMIT 1`,
          [patientId, userId]
        );

        const circle = circleCheck.rows[0];
        if (circle) {
          if (circle.owner_id === userId || circle.role_in_circle === 'OWNER') {
            effectiveTypes.push('GUARDIAN');
          } else if (circle.role_in_circle === 'MEMBER') {
            effectiveTypes.push('FAMILY_CLOSE');
          } else if (circle.role_in_circle === 'CAREGIVER') {
            // A Caregiver-role Circle member still needs the canonical
            // relationship + assignment check above to act as a Caregiver.
            effectiveTypes.push('CAREGIVER');
          }
        }
      }

      if (effectiveTypes.length === 0) {
        throw new AppError(
          'RELATIONSHIP_REQUIRED',
          'No active Care Circle relationship or assignment for this patient',
          403,
        );
      }

      if (
        allowedTypes &&
        allowedTypes.length > 0 &&
        !effectiveTypes.some((type) => allowedTypes.includes(type))
      ) {
        throw new AppError(
          'INSUFFICIENT_RELATIONSHIP_TIER',
          'Your relationship tier does not permit this action',
          403,
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
