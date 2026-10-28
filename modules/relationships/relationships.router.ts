import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate';
import { requireRoles } from '../../shared/middleware/authenticate';
import { requireRelationship } from '../../shared/middleware/requireRelationship';
import { asyncHandler, ok, created } from '../../shared/utils/response';
import { AppError } from '../../shared/errors/AppError';
import * as ctrl from './relationships.controller';
import * as svc from './relationships.service';
import * as careRelCtrl from '../care-relationships/care-relationships.controller';

const router = Router();
router.use(authenticate);

const deprecatedRelationshipHandler = (_req: any, _res: any, next: any) => {
  next(new AppError('DEPRECATED_ENDPOINT', 'This legacy relationship endpoint is deprecated. Use canonical Care Circle / Care Request workflows.', 410));
};

// ─── Legacy Caregiver Request & Linkage Endpoints (Decommissioned) ────────────
router.post('/caregiver-request',    deprecatedRelationshipHandler);
router.post('/family-invite',        deprecatedRelationshipHandler);
router.post('/accept-invite/:token', deprecatedRelationshipHandler);
router.get('/my-patients',           requireRoles('CAREGIVER'), asyncHandler(ctrl.myPatients));
// Retained for active established relationships (accessible to patient or authorized family)
router.get('/my-caregivers',         requireRoles('PATIENT', 'FAMILY'), asyncHandler(ctrl.myCaregivers));
router.get('/my-family',             asyncHandler(ctrl.myFamily));

// Caregiver search and integration endpoints
router.get('/caregivers/search',     asyncHandler(ctrl.searchCaregivers));
router.get('/caregiver/confirmed',   asyncHandler(ctrl.getConfirmedCaregiver));
router.post('/caregiver/confirm',    deprecatedRelationshipHandler);
router.delete('/caregiver',          deprecatedRelationshipHandler);
router.get('/caregiver/pending',     deprecatedRelationshipHandler);
router.post('/caregiver/respond',    deprecatedRelationshipHandler);

// ─── Care Circle: Invite Code (Decommissioned in favor of circle_invitations) ──
router.post('/invite-code/generate', deprecatedRelationshipHandler);
router.get('/patient/:patientId/invite-codes', deprecatedRelationshipHandler);
router.post('/invite-code/:code/revoke', deprecatedRelationshipHandler);

// ─── Care Circle: Family Approval (Decommissioned) ─────────────────────────────
router.get('/family/pending',        deprecatedRelationshipHandler);
router.post('/family/:id/approve',   deprecatedRelationshipHandler);
router.post('/family/:id/reject',    deprecatedRelationshipHandler);
router.delete('/family/:patientId',  deprecatedRelationshipHandler);

router.get('/patient/:patientId/care-circle',
  requireRelationship(),
  asyncHandler(async (req, res) => {
    const { patientId } = req.params;
    const result = await svc.getCareCircle(patientId);
    ok(res, { members: result });
  }),
);

router.post('/patient/:patientId/meet', deprecatedRelationshipHandler);
router.get('/patient/:patientId/relationship', deprecatedRelationshipHandler);

router.patch('/:id/status',          deprecatedRelationshipHandler);
router.delete('/:id',                deprecatedRelationshipHandler);

// Canonical Phase 3A: End Care Relationship aliases
router.post('/:id/end',              asyncHandler(careRelCtrl.endCareRelationship));
router.get('/caregiver/history',     asyncHandler(careRelCtrl.getCareRelationshipHistory));

// Canonical Phase 3B: Caregiver Resignation aliases
router.post('/:id/resignation',          asyncHandler(careRelCtrl.createResignation));
router.get('/:id/resignation',           asyncHandler(careRelCtrl.getResignation));
router.post('/:id/resignation/accept',   asyncHandler(careRelCtrl.acceptResignation));
router.post('/:id/resignation/decline',  asyncHandler(careRelCtrl.declineResignation));
router.post('/:id/resignation/withdraw', asyncHandler(careRelCtrl.withdrawResignation));

export default router;

