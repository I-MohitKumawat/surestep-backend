/**
 * SureStep — modules/care-relationships/care-relationships.router.ts
 *
 * Router for canonical Care Relationship operations (Phase 3A).
 */

import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate';
import { asyncHandler } from '../../shared/utils/response';
import * as ctrl from './care-relationships.controller';

const router = Router();
router.use(authenticate);

// POST /api/v1/care-relationships/:relationshipId/end
router.post('/:relationshipId/end', asyncHandler(ctrl.endCareRelationship));

// GET /api/v1/care-relationships/history
router.get('/history', asyncHandler(ctrl.getCareRelationshipHistory));

// ─── Phase 3B: Caregiver Resignation Workflow ─────────────────────────────────

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

