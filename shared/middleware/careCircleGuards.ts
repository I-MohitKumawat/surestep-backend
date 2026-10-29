/**
 * SureStep — shared/middleware/careCircleGuards.ts
 *
 * Resource-Aware Server-Side Authorization Policy Guards.
 * Baselines:
 *   - docs/architecture/TARGET_ARCHITECTURE.md (Section 4)
 *   - docs/workflows/03-CARE-CIRCLE.md
 *   - docs/workflows/04-PATIENT-CARE.md
 *   - docs/workflows/06-CAREGIVER-RELATIONSHIP.md
 *   - docs/workflows/07-SAFETY.md
 *   - docs/workflows/08-LOCATION-AND-SAFE-ZONES.md
 */

import { Request, Response, NextFunction } from 'express';
import '../../shared/types';
import pool from '../../db/config';
import { AppError } from '../errors/AppError';
import { CanonicalPermissionName } from '../../modules/care-circles/care-circles.types';

/**
 * 1. requireCircleMembership
 * Asserts the authenticated caller is an active member or associated patient in :circleId.
 */
export function requireCircleMembership(circleIdParam = 'circleId') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const circleId = req.params[circleIdParam] || req.body[circleIdParam];
      const userId = req.user?.id;

      if (!circleId || !userId) {
        throw new AppError('UNAUTHORIZED', 'Authentication and Circle context required', 401);
      }

      // Check if circle exists and is active
      const circleRes = await pool.query(
        'SELECT id, owner_id, terminated_at FROM care_circles WHERE id = $1',
        [circleId]
      );
      const circle = circleRes.rows[0];
      if (!circle || circle.terminated_at) {
        throw new AppError('CIRCLE_NOT_FOUND', 'Active Care Circle not found', 404);
      }

      // Check if user is owner, member, or associated patient
      if (circle.owner_id === userId) {
        (req as any).circle = circle;
        (req as any).roleInCircle = 'OWNER';
        return next();
      }

      // A Patient association takes precedence over a generic membership row.
      const memberCheck = await pool.query(
        `SELECT COALESCE(
           (SELECT 'PATIENT' FROM patient_circle_associations
            WHERE circle_id = $1 AND patient_id = $2),
           (SELECT role_in_circle FROM care_circle_members
            WHERE circle_id = $1 AND user_id = $2)
         ) AS role_in_circle`,
        [circleId, userId]
      );

      const roleInCircle = memberCheck.rows[0]?.role_in_circle;
      if (!roleInCircle) {
        throw new AppError('ACCESS_DENIED', 'You do not belong to this Care Circle', 403);
      }

      (req as any).circle = circle;
      (req as any).roleInCircle = roleInCircle;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * 2. requireCircleOwner
 * Asserts the caller is the intrinsic Circle Owner.
 */
export function requireCircleOwner(circleIdParam = 'circleId') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const circleId = req.params[circleIdParam] || req.body[circleIdParam];
      const userId = req.user?.id;

      if (!circleId || !userId) {
        throw new AppError('UNAUTHORIZED', 'Authentication and Circle context required', 401);
      }

      const circleRes = await pool.query(
        'SELECT id, owner_id, terminated_at FROM care_circles WHERE id = $1',
        [circleId]
      );
      const circle = circleRes.rows[0];
      if (!circle || circle.terminated_at) {
        throw new AppError('CIRCLE_NOT_FOUND', 'Active Care Circle not found', 404);
      }

      if (circle.owner_id !== userId) {
        throw new AppError('OWNER_ONLY', 'This operation is restricted strictly to the Circle Owner', 403);
      }

      (req as any).circle = circle;
      (req as any).roleInCircle = 'OWNER';
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * 3. requireCirclePermission
 * Asserts caller is Circle Owner OR holds the specified canonical delegatable permission.
 */
export function requireCirclePermission(permissionName: CanonicalPermissionName, circleIdParam = 'circleId') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const circleId = req.params[circleIdParam] || req.body[circleIdParam];
      const userId = req.user?.id;

      if (!circleId || !userId) {
        throw new AppError('UNAUTHORIZED', 'Authentication and Circle context required', 401);
      }

      const circleRes = await pool.query(
        'SELECT id, owner_id, terminated_at FROM care_circles WHERE id = $1',
        [circleId]
      );
      const circle = circleRes.rows[0];
      if (!circle || circle.terminated_at) {
        throw new AppError('CIRCLE_NOT_FOUND', 'Active Care Circle not found', 404);
      }

      // Owner has intrinsic authority
      if (circle.owner_id === userId) {
        (req as any).circle = circle;
        (req as any).roleInCircle = 'OWNER';
        return next();
      }

      // Check delegated permission. Patients never hold delegated Circle authority.
      const permRes = await pool.query(
        `SELECT p.id FROM circle_permissions p
         JOIN care_circle_members m ON p.member_id = m.id
         JOIN users u ON u.id = m.user_id
         WHERE m.circle_id = $1 AND m.user_id = $2 AND p.permission_name = $3
           AND u.role <> 'PATIENT'`,
        [circleId, userId, permissionName]
      );

      if (permRes.rows.length === 0) {
        throw new AppError(
          'PERMISSION_DENIED',
          `You require the "${permissionName}" permission to perform this action`,
          403
        );
      }

      (req as any).circle = circle;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * 4. requireActivePatientAssignment
 * Scopes to :patientId.
 * For Caregivers: requires an ACTIVE or NOTICE_PERIOD relationship AND an active patient assignment.
 * For Family: requires membership in the Circle that coordinates the patient.
 * For Patients: requires caller === patientId.
 */
export function requireActivePatientAssignment(patientIdParam = 'patientId') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const patientId = req.params[patientIdParam] || req.body[patientIdParam];
      const user = req.user;

      if (!patientId || !user) {
        throw new AppError('UNAUTHORIZED', 'Authentication and Patient context required', 401);
      }

      // 1. Patient self-access only. A Patient must never fall through to the
      // family/Circle-member branch for another Patient.
      if (user.role === 'PATIENT') {
        if (user.id === patientId) {
          return next();
        }
        throw new AppError('NOT_AUTHORIZED_FOR_PATIENT', 'You are not authorized to access this patient', 403);
      }

      // 2. Caregiver access: requires ACTIVE/NOTICE_PERIOD relationship + active patient assignment
      if (user.role === 'CAREGIVER') {
        const assignCheck = await pool.query(
          `SELECT pa.id
           FROM patient_assignments pa
           JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
           JOIN care_circles c ON cr.circle_id = c.id
           WHERE cr.caregiver_id = $1
             AND pa.patient_id = $2
             AND pa.is_active = TRUE
             AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
             AND c.terminated_at IS NULL`,
          [user.id, patientId]
        );

        if (assignCheck.rows.length === 0) {
          throw new AppError(
            'CAREGIVER_NOT_ASSIGNED',
            'Caregiver lacks an active relationship and patient assignment for this patient',
            403
          );
        }

        return next();
      }

      // 3. Family access: requires belonging to the Circle coordinating the patient
      const assocCheck = await pool.query(
        `SELECT pca.circle_id
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
        [patientId, user.id]
      );

      if (assocCheck.rows.length > 0) {
        return next();
      }

      throw new AppError('NOT_AUTHORIZED_FOR_PATIENT', 'You are not authorized to access this patient', 403);
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Canonical routine-definition authorization policy.
 * Invariant (04-PATIENT-CARE.md §3, §14; TARGET_ARCHITECTURE.md §4.3):
 *   Professional Caregivers—regardless of whether they are a Circle member, assigned caregiver,
 *   or Circle Owner—must NOT create, edit, pause, resume, or delete routine definitions in V1.
 *   Allowed:
 *     - Capable Patient (self-managed only)
 *     - Authorized Family Member in the Circle coordinating the patient's care plan
 */
async function assertRoutineDefinitionAuthority(
  user: NonNullable<Request['user']>,
  patientId: string
): Promise<void> {
  // Invariant: Professional Caregiver is strictly forbidden from routine definition CRUD
  if (user.role === 'CAREGIVER') {
    throw new AppError(
      'CAREGIVER_ROUTINE_CRUD_FORBIDDEN',
      'Professional Caregivers cannot create, edit, pause, resume, or delete routine configurations in V1',
      403
    );
  }

  // Patient self-management check: Self-managed allowed, Assisted forbidden.
  // A Patient must never fall through to family/Circle authorization for another Patient.
  if (user.role === 'PATIENT') {
    if (user.id !== patientId) {
      throw new AppError(
        'CARE_PLAN_ADMIN_FORBIDDEN',
        'Only authorized Family Members can administer routine configurations',
        403
      );
    }

    const profileRes = await pool.query(
      `SELECT onboarding_source FROM patient_profiles WHERE user_id = $1`,
      [user.id]
    );
    const onboardingSource = profileRes.rows[0]?.onboarding_source;

    if (onboardingSource === 'FAMILY') {
      throw new AppError(
        'ASSISTED_PATIENT_ROUTINE_CRUD_FORBIDDEN',
        'Assisted patients cannot manage routine configurations. Routines must be administered by family care circle members.',
        403
      );
    }

    return;
  }

  // Authorized Family Member in patient's Circle
  const familyCheck = await pool.query(
    `SELECT c.id
     FROM patient_circle_associations pca
     JOIN care_circles c ON pca.circle_id = c.id
     WHERE pca.patient_id = $1 AND c.terminated_at IS NULL
       AND (
         c.owner_id = $2
         OR EXISTS (
           SELECT 1 FROM care_circle_members m
           WHERE m.circle_id = c.id AND m.user_id = $2 AND m.role_in_circle != 'CAREGIVER'
         )
       )`,
    [patientId, user.id]
  );

  if (familyCheck.rows.length === 0) {
    throw new AppError('CARE_PLAN_ADMIN_FORBIDDEN', 'Only authorized Family Members can administer routine configurations', 403);
  }
}

/**
 * 5. requireRoutineDefinitionCRUDAuthority
 * Patient-scoped variant of the canonical routine-definition policy.
 */
export function requireRoutineDefinitionCRUDAuthority(patientIdParam = 'patientId') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const patientId = req.params[patientIdParam] || req.body[patientIdParam];
      const user = req.user;

      if (!patientId || !user) {
        throw new AppError('UNAUTHORIZED', 'Authentication and Patient context required', 401);
      }

      await assertRoutineDefinitionAuthority(user, patientId);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * 5b. requireRoutineTemplateDefinitionAuthority
 * Resource-aware variant for the legacy routine-template compatibility routes.
 * Resolves the template's patient before applying the canonical definition policy,
 * so authorization is based on the patient's care plan—not on who created the row.
 */
export function requireRoutineTemplateDefinitionAuthority(templateIdParam = 'id') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const templateId = req.params[templateIdParam] || req.body[templateIdParam];
      const user = req.user;

      if (!templateId || !user) {
        throw new AppError('UNAUTHORIZED', 'Authentication and routine-template context required', 401);
      }

      const { rows } = await pool.query(
        'SELECT patient_id FROM routine_templates WHERE id = $1',
        [templateId]
      );
      if (!rows[0]) {
        throw new AppError('NOT_FOUND', 'Routine template not found', 404);
      }

      await assertRoutineDefinitionAuthority(user, rows[0].patient_id);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * 6. requireRoutineSignOffAuthority
 * Routine occurrence sign-off / care participation (04-PATIENT-CARE.md §3, §12, §14):
 *   - Patient themselves
 *   - Authorized Family Member coordinating care
 *   - Assigned Professional Caregiver (active relationship / notice period + active patient assignment)
 */
export function requireRoutineSignOffAuthority(patientIdParam = 'patientId') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const patientId = req.params[patientIdParam] || req.body[patientIdParam];
      const user = req.user;

      if (!patientId || !user) {
        throw new AppError('UNAUTHORIZED', 'Authentication and Patient context required', 401);
      }

      // Patient self sign-off only. A Patient cannot sign off for another Patient.
      if (user.role === 'PATIENT') {
        if (user.id === patientId) {
          return next();
        }
        throw new AppError('FORBIDDEN', 'Not authorized to sign off routine occurrences for this patient', 403);
      }

      // Caregiver sign-off requires active relationship/notice period + patient assignment
      if (user.role === 'CAREGIVER') {
        const assignCheck = await pool.query(
          `SELECT pa.id
           FROM patient_assignments pa
           JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
           JOIN care_circles c ON cr.circle_id = c.id
           WHERE cr.caregiver_id = $1
             AND pa.patient_id = $2
             AND pa.is_active = TRUE
             AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
             AND c.terminated_at IS NULL`,
          [user.id, patientId]
        );

        if (assignCheck.rows.length === 0) {
          throw new AppError(
            'CAREGIVER_NOT_ASSIGNED',
            'Caregiver must hold an active relationship and patient assignment to sign off routines',
            403
          );
        }

        return next();
      }

      // Family Member sign-off
      const familyCheck = await pool.query(
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
        [patientId, user.id]
      );

      if (familyCheck.rows.length > 0) {
        return next();
      }

      throw new AppError('FORBIDDEN', 'Not authorized to sign off routine occurrences for this patient', 403);
    } catch (err) {
      next(err);
    }
  };
}

/**
 * 6b. requireOccurrenceSignOffAuthority
 * Direct occurrence sign-off authorization guard.
 * Loads the occurrence, derives its patient, and independently authorizes the caller:
 *   - Patient self
 *   - Assigned Caregiver (ACTIVE or NOTICE_PERIOD relationship + active patient assignment)
 *   - Authorized Circle Member coordinating the patient
 */
export function requireOccurrenceSignOffAuthority(occurrenceIdParam = 'occurrenceId') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const occurrenceId = req.params[occurrenceIdParam] || req.body[occurrenceIdParam];
      const user = req.user;

      if (!occurrenceId || !user) {
        throw new AppError('UNAUTHORIZED', 'Authentication and occurrence context required', 401);
      }

      // 1. Fetch occurrence to derive patient_id
      const occRes = await pool.query(
        'SELECT id, routine_id, patient_id FROM routine_occurrences WHERE id = $1',
        [occurrenceId]
      );
      const occ = occRes.rows[0];
      if (!occ) {
        throw new AppError('NOT_FOUND', 'Routine occurrence not found', 404);
      }

      const patientId = occ.patient_id;
      req.params.patientId = patientId;
      req.params.routineId = occ.routine_id;

      // 2. Patient self sign-off only. A Patient cannot sign off for another Patient.
      if (user.role === 'PATIENT') {
        if (user.id === patientId) {
          return next();
        }
        throw new AppError('FORBIDDEN', 'Not authorized to sign off routine occurrences for this patient', 403);
      }

      // 3. Caregiver sign-off
      if (user.role === 'CAREGIVER') {
        const assignCheck = await pool.query(
          `SELECT pa.id
           FROM patient_assignments pa
           JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
           JOIN care_circles c ON cr.circle_id = c.id
           WHERE cr.caregiver_id = $1
             AND pa.patient_id = $2
             AND pa.is_active = TRUE
             AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
             AND c.terminated_at IS NULL`,
          [user.id, patientId]
        );

        if (assignCheck.rows.length === 0) {
          throw new AppError(
            'CAREGIVER_NOT_ASSIGNED',
            'Caregiver must hold an active relationship and patient assignment to sign off routines',
            403
          );
        }

        return next();
      }

      // 4. Family Member / Circle Member sign-off
      const familyCheck = await pool.query(
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
        [patientId, user.id]
      );

      if (familyCheck.rows.length > 0) {
        return next();
      }

      throw new AppError('FORBIDDEN', 'Not authorized to sign off routine occurrences for this patient', 403);
    } catch (err) {
      next(err);
    }
  };
}

/**
 * 7. requireSafeZoneManagementAuthority
 * Invariant (TARGET_ARCHITECTURE.md §3.5, §4.3):
 *   Safe Zone CRUD is strictly Circle Owner only in V1. Non-Owner members and caregivers
 *   receive 403 Forbidden. No delegatable permission exists for Safe Zone management.
 */
export function requireSafeZoneManagementAuthority(circleIdParam = 'circleId') {
  return requireCircleOwner(circleIdParam);
}

/**
 * 8. requireAlertResolutionAuthority
 * Invariant (TARGET_ARCHITECTURE.md §3.6, §4.3):
 *   Resolving a safety alert is strictly Circle Owner only in V1.
 */
export function requireAlertResolutionAuthority(circleIdParam = 'circleId') {
  return requireCircleOwner(circleIdParam);
}

/**
 * 9. requirePatientMemoryManagementAuthority
 * Invariant (09-MEMORIES-AND-ACTIVITIES.md §5; TARGET_ARCHITECTURE.md §3.7, §4.2):
 *   Memory creation, editing, and deletion are controlled strictly by Circle Owner
 *   or Circle members holding the delegated canonical permission 'Manage Patient Memories'.
 *   Caregivers (even assigned) receive 403.
 *   Arbitrary Circle members without the permission receive 403.
 */
export function requirePatientMemoryManagementAuthority(patientIdParam = 'patientId') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const patientId = req.params[patientIdParam] || req.body[patientIdParam];
      const user = req.user;

      if (!patientId || !user) {
        throw new AppError('UNAUTHORIZED', 'Authentication and Patient context required', 401);
      }

      // Memory management is delegated Circle authority; Patient accounts never hold it.
      if (user.role === 'PATIENT') {
        throw new AppError(
          'MEMORY_MANAGEMENT_FORBIDDEN',
          'Only Circle Owners or members holding "Manage Patient Memories" permission can manage memories',
          403
        );
      }

      // Check Care Circle membership and permissions
      const circleRes = await pool.query(
        `SELECT c.id, c.owner_id
         FROM patient_circle_associations pca
         JOIN care_circles c ON pca.circle_id = c.id
         WHERE pca.patient_id = $1 AND c.terminated_at IS NULL`,
        [patientId]
      );

      if (circleRes.rows.length > 0) {
        const circle = circleRes.rows[0];

        // 1. Circle Owner has intrinsic authority
        if (circle.owner_id === user.id) {
          (req as any).circle = circle;
          (req as any).roleInCircle = 'OWNER';
          return next();
        }

        // 2. Check delegated canonical permission 'Manage Patient Memories'
        const permCheck = await pool.query(
          `SELECT 1 FROM circle_permissions p
           JOIN care_circle_members m ON p.member_id = m.id
           WHERE m.circle_id = $1 AND m.user_id = $2 AND p.permission_name = 'Manage Patient Memories'`,
          [circle.id, user.id]
        );

        if (permCheck.rows.length > 0) {
          (req as any).circle = circle;
          return next();
        }

        throw new AppError(
          'MEMORY_MANAGEMENT_FORBIDDEN',
          'Only Circle Owners or members holding "Manage Patient Memories" permission can manage memories',
          403
        );
      }

      throw new AppError(
        'MEMORY_MANAGEMENT_FORBIDDEN',
        'Only Circle Owners or members holding "Manage Patient Memories" permission can manage memories',
        403
      );
    } catch (err) {
      next(err);
    }
  };
}
