import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate';
import { requireRoles } from '../../shared/middleware/authenticate';
import { requireRelationship } from '../../shared/middleware/requireRelationship';
import { asyncHandler, ok, created } from '../../shared/utils/response';
import * as ctrl from './relationships.controller';
import * as svc from './relationships.service';
import * as careRelCtrl from '../care-relationships/care-relationships.controller';

const router = Router();
router.use(authenticate);

// ─── Legacy Caregiver Request & Linkage Endpoints (Retained for Backwards Compatibility) ───
// @deprecated: Replaced by POST /care-requests (canonical Care Request lifecycle)
router.post('/caregiver-request',    requireRoles('PATIENT'),   asyncHandler(ctrl.caregiverRequest));
router.post('/family-invite',        requireRoles('FAMILY'),    asyncHandler(ctrl.familyInvite));
router.post('/accept-invite/:token', asyncHandler(ctrl.acceptInvite));
router.get('/my-patients',           requireRoles('CAREGIVER'), asyncHandler(ctrl.myPatients));
// Retained for active established relationships (accessible to patient or authorized family)
router.get('/my-caregivers',         requireRoles('PATIENT', 'FAMILY'), asyncHandler(ctrl.myCaregivers));
router.get('/my-family',             asyncHandler(ctrl.myFamily));

// Caregiver search and integration endpoints
// @deprecated: Replaced by GET /discovery/caregivers
router.get('/caregivers/search',     asyncHandler(ctrl.searchCaregivers));
// @deprecated: Replaced by GET /relationships/my-caregivers
router.get('/caregiver/confirmed',   asyncHandler(ctrl.getConfirmedCaregiver));
// @deprecated: Replaced by POST /care-requests
router.post('/caregiver/confirm',    asyncHandler(ctrl.confirmCaregiver));
// @deprecated: Scoped caregiver deletion supported; replaced by relationship state management
router.delete('/caregiver',          asyncHandler(ctrl.removeCaregiver));
// @deprecated: Replaced by GET /care-requests/incoming
router.get('/caregiver/pending',     asyncHandler(ctrl.getPendingRequests));
// @deprecated: Replaced by POST /care-requests/:id/accept and POST /care-requests/:id/decline
router.post('/caregiver/respond',    asyncHandler(ctrl.respondToRequest));

// ─── Care Circle: Invite Code (Caregiver-generated) ───────────────────────────
router.post('/invite-code/generate',
  requireRoles('CAREGIVER'),
  asyncHandler(async (req, res) => {
    const { patient_id, relationship_type } = req.body;
    const result = await svc.generateInviteCode(req.user!.id, patient_id, relationship_type);
    created(res, { invite: result });
  }),
);

router.get('/patient/:patientId/invite-codes',
  requireRoles('CAREGIVER'),
  asyncHandler(async (req, res) => {
    const { patientId } = req.params;
    const codes = await svc.getInviteCodesForPatient(req.user!.id, patientId);
    ok(res, { inviteCodes: codes });
  }),
);

router.post('/invite-code/:code/revoke',
  requireRoles('CAREGIVER'),
  asyncHandler(async (req, res) => {
    const { code } = req.params;
    await svc.revokeInviteCode(req.user!.id, code);
    ok(res, { revoked: true });
  }),
);

// ─── Care Circle: Family Approval ─────────────────────────────────────────────
router.get('/family/pending',
  requireRoles('CAREGIVER'),
  asyncHandler(async (req, res) => {
    const requests = await svc.getPendingFamilyRequests(req.user!.id);
    ok(res, { requests });
  }),
);

router.post('/family/:id/approve',
  requireRoles('CAREGIVER'),
  asyncHandler(async (req, res) => {
    const result = await svc.respondToFamilyRequest(req.user!.id, req.params.id, 'approve');
    try {
      const { io } = await import('../../server');
      io.to(`patient:${result.patient_user_id}`).emit('relationship:change', { relationship: result });
      io.to(`user:${result.related_user_id}`).emit('relationship:change', { relationship: result });
    } catch (_) {}
    ok(res, { relationship: result });
  }),
);

router.post('/family/:id/reject',
  requireRoles('CAREGIVER'),
  asyncHandler(async (req, res) => {
    const result = await svc.respondToFamilyRequest(req.user!.id, req.params.id, 'reject');
    try {
      const { io } = await import('../../server');
      io.to(`patient:${result.patient_user_id}`).emit('relationship:change', { action: 'rejected', patientId: result.patient_user_id });
      io.to(`user:${result.related_user_id}`).emit('relationship:change', { action: 'rejected', patientId: result.patient_user_id });
    } catch (_) {}
    ok(res, { rejected: true });
  }),
);

router.delete('/family/:patientId',
  requireRoles('FAMILY'),
  asyncHandler(async (req, res) => {
    const { patientId } = req.params;
    await svc.deleteFamilyRelationshipByPatient(patientId, req.user!.id);
    ok(res, { message: 'Successfully left the care circle' });
  }),
);

router.get('/patient/:patientId/care-circle',
  requireRelationship(),
  asyncHandler(async (req, res) => {
    const { patientId } = req.params;
    const result = await svc.getCareCircle(patientId);
    ok(res, { members: result });
  }),
);


router.post('/patient/:patientId/meet',
  requireRoles('CAREGIVER'),
  asyncHandler(ctrl.completeMeeting),
);

router.get('/patient/:patientId/relationship',
  requireRoles('CAREGIVER'),
  asyncHandler(ctrl.getPatientRelationship),
);

router.patch('/:id/status',          asyncHandler(ctrl.updateStatus));
router.delete('/:id',                asyncHandler(ctrl.removeRelationship));

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

