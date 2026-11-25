import { Router } from 'express';
import { authenticate, requireRoles } from '../../shared/middleware/authenticate';
import { asyncHandler } from '../../shared/utils/response';
import { AppError } from '../../shared/errors/AppError';
import * as ctrl from './relationships.controller';

const router = Router();
router.use(authenticate);

const deprecatedRelationshipHandler = (_req: any, _res: any, next: any) => {
  next(new AppError('DEPRECATED_ENDPOINT', 'This legacy relationship endpoint is deprecated. Use canonical Care Circle / Care Request workflows.', 410));
};

// ─── Canonical read models ───────────────────────────────────────────────────
router.get('/my-patients', requireRoles('CAREGIVER'), asyncHandler(ctrl.myPatients));
router.get('/my-caregivers', requireRoles('PATIENT', 'FAMILY'), asyncHandler(ctrl.myCaregivers));
router.get('/my-family', asyncHandler(ctrl.myFamily));

// Caregiver discovery remains the canonical discovery read surface.
router.get('/caregivers/search', asyncHandler(ctrl.searchCaregivers));

// ─── Retired relationship, invitation, and resignation surfaces (410 GONE) ──
router.all('/caregiver-request', deprecatedRelationshipHandler);
router.all('/family-invite', deprecatedRelationshipHandler);
router.all('/accept-invite/*', deprecatedRelationshipHandler);
router.all('/caregiver/confirmed', deprecatedRelationshipHandler);
router.all('/caregiver/confirm', deprecatedRelationshipHandler);
router.all('/caregiver', deprecatedRelationshipHandler);
router.all('/caregiver/pending', deprecatedRelationshipHandler);
router.all('/caregiver/respond', deprecatedRelationshipHandler);
router.all('/invite-code/*', deprecatedRelationshipHandler);
router.all('/patient/:patientId/invite-codes', deprecatedRelationshipHandler);
router.all('/family/*', deprecatedRelationshipHandler);
router.all('/patient/:patientId/care-circle', deprecatedRelationshipHandler);
router.all('/patient/:patientId/meet', deprecatedRelationshipHandler);
router.all('/patient/:patientId/relationship', deprecatedRelationshipHandler);
router.all('/:id/status', deprecatedRelationshipHandler);
router.all('/:id/end', deprecatedRelationshipHandler);
router.all('/caregiver/history', deprecatedRelationshipHandler);
router.all('/:id/resignation', deprecatedRelationshipHandler);
router.all('/:id/resignation/*', deprecatedRelationshipHandler);

export default router;
