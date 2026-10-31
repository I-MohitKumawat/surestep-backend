import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRoles } from '../../shared/middleware/authenticate';
import { requireRelationship } from '../../shared/middleware/requireRelationship';
import { requireActivePatientAssignment } from '../../shared/middleware/careCircleGuards';
import { asyncHandler } from '../../shared/utils/response';
import { AppError } from '../../shared/errors/AppError';
import pool from '../../db/config';
import * as ctrl from './assessment.controller';

const router = Router();
router.use(authenticate);

/**
 * Resolve the assessment's Patient before applying the canonical
 * resource-aware patient authorization policy. Assessment UUIDs are never
 * treated as authorization.
 */
async function requireAssessmentPatientAccess(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { rows } = await pool.query(
      'SELECT patient_id FROM care_assessments WHERE id = $1',
      [req.params.id],
    );
    if (!rows[0]) {
      throw new AppError('NOT_FOUND', 'Assessment not found', 404);
    }

    req.params.patientId = rows[0].patient_id;
    next();
  } catch (err) {
    next(err);
  }
}

// Save progress or submit final assessment
router.post('/patient/:patientId',
  requireRoles('CAREGIVER'),
  requireRelationship(),
  asyncHandler(ctrl.save),
);

// Get latest assessment
router.get('/patient/:patientId',
  requireRelationship(),
  asyncHandler(ctrl.getLatest),
);

// Get historical versions
router.get('/patient/:patientId/history',
  requireRelationship(),
  asyncHandler(ctrl.getHistory),
);

// Get specific assessment version by ID (resource-aware authorization)
router.get('/:id',
  requireAssessmentPatientAccess,
  requireActivePatientAssignment('patientId'),
  asyncHandler(ctrl.getById),
);

export default router;
