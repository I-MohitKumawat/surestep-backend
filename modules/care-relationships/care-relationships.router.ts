/**
 * SureStep — modules/care-relationships/care-relationships.router.ts
 *
 * Router for canonical Care Relationship operations (Phase 3A).
 */

import { Request, Response } from 'express';
import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate';
import { asyncHandler } from '../../shared/utils/response';
import { AppError } from '../../shared/errors/AppError';
import * as ctrl from './care-relationships.controller';

const router = Router();
router.use(authenticate);

/**
 * Retired compatibility endpoints that duplicated the canonical Care Circle
 * caregiver-relationship routes. They intentionally fail closed.
 */
const deprecated = (replacement: string) => (_req: Request, _res: Response) => {
  throw new AppError(
    'ENDPOINT_DEPRECATED',
    `This endpoint has been retired. Use ${replacement}.`,
    410
  );
};

// POST /api/v1/care-relationships/:relationshipId/end
router.post('/:relationshipId/end', asyncHandler(ctrl.endCareRelationship));

// GET /api/v1/care-relationships/history
router.get('/history', asyncHandler(ctrl.getCareRelationshipHistory));

// ─── Retired Duplicate Caregiver Relationship Endpoints (410 GONE) ───────────
// Canonical routes live under /care-circles/:circleId/caregivers/:relationshipId.

router.post(
  '/:relationshipId/notice',
  deprecated('POST /care-circles/:circleId/caregivers/:relationshipId/notice')
);
router.post(
  '/:relationshipId/terminate',
  deprecated('POST /care-circles/:circleId/caregivers/:relationshipId/terminate')
);
router.post(
  '/:relationshipId/assignments',
  deprecated('POST /care-circles/:circleId/caregivers/:relationshipId/assignments')
);
router.delete(
  '/:relationshipId/assignments/:patientId',
  deprecated('DELETE /care-circles/:circleId/caregivers/:relationshipId/assignments/:patientId')
);
router.get(
  '/:relationshipId',
  deprecated('GET /care-circles/:circleId/caregivers')
);

// ─── Phase 3B: Caregiver Resignation Workflow (Deprecated -> 410 GONE) ────────

// GET /api/v1/care-relationships/resignations/pending (must precede :relationshipId)
router.get('/resignations/pending', asyncHandler(ctrl.getPendingResignations));

// POST /api/v1/care-relationships/:relationshipId/resignation (Caregiver submits)
router.post('/:relationshipId/resignation', asyncHandler(ctrl.createResignation));

// GET /api/v1/care-relationships/:relationshipId/resignation (View latest request)
router.get('/:relationshipId/resignation', asyncHandler(ctrl.getResignation));

// POST /api/v1/care-relationships/:relationshipId/resignation/accept (Patient/family accepts)
router.post('/:relationshipId/resignation/accept', asyncHandler(ctrl.acceptResignation));

// POST /api/v1/care-relationships/:relationshipId/resignation/decline (Patient/family declines)
router.post('/:relationshipId/resignation/decline', asyncHandler(ctrl.declineResignation));

// POST /api/v1/care-relationships/:relationshipId/resignation/withdraw (Caregiver withdraws)
router.post('/:relationshipId/resignation/withdraw', asyncHandler(ctrl.withdrawResignation));

export default router;

