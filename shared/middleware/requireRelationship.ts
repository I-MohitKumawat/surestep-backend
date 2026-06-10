import { Request, Response, NextFunction } from 'express';
import pool from '../../db/config';
import { AppError } from '../errors/AppError';
import { RelationshipType } from '../types';

/**
 * requireRelationship — verifies the authenticated user has an active
 * CONFIRMED relationship with the patient identified by req.params.patientId
 * (or a custom param name).
 *
 * Optionally restrict to specific relationship types (tiers).
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

      // Patients can always access their own data
      if (userRole === 'PATIENT' && userId === patientId) {
        next();
        return;
      }

      let query = `
        SELECT id, relationship_type
        FROM   patient_relationships
        WHERE  patient_user_id = $1
          AND  related_user_id = $2
          AND  status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')
      `;
      const params: string[] = [patientId, userId];

      if (allowedTypes && allowedTypes.length > 0) {
        query += ` AND relationship_type = ANY($3::relationship_type[])`;
        params.push(`{${allowedTypes.join(',')}}`);
      }

      const result = await pool.query(query, params);

      if (!result.rows[0]) {
        if (allowedTypes) {
          throw new AppError(
            'INSUFFICIENT_RELATIONSHIP_TIER',
            'Your relationship tier does not permit this action',
            403,
          );
        }
        throw new AppError(
          'RELATIONSHIP_REQUIRED',
          'No active relationship with this patient',
          403,
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
