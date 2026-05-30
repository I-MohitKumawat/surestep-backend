import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate';
import { requireRoles } from '../../shared/middleware/authenticate';
import { asyncHandler } from '../../shared/utils/response';
import * as ctrl from './relationships.controller';

const router = Router();
router.use(authenticate);

router.post('/caregiver-request',    requireRoles('PATIENT'), asyncHandler(ctrl.caregiverRequest));
router.post('/family-invite',        requireRoles('FAMILY'),  asyncHandler(ctrl.familyInvite));
router.post('/accept-invite/:token', asyncHandler(ctrl.acceptInvite));
router.get('/my-patients',           requireRoles('CAREGIVER'), asyncHandler(ctrl.myPatients));
router.get('/my-caregivers',         requireRoles('PATIENT'),   asyncHandler(ctrl.myCaregivers));
router.get('/my-family',             asyncHandler(ctrl.myFamily));

// Caregiver search and integration endpoints
router.get('/caregivers/search',     asyncHandler(ctrl.searchCaregivers));
router.get('/caregiver/confirmed',   asyncHandler(ctrl.getConfirmedCaregiver));
router.post('/caregiver/confirm',    asyncHandler(ctrl.confirmCaregiver));
router.delete('/caregiver',          asyncHandler(ctrl.removeCaregiver));
router.get('/caregiver/pending',     asyncHandler(ctrl.getPendingRequests));
router.post('/caregiver/respond',    asyncHandler(ctrl.respondToRequest));

router.patch('/:id/status',          asyncHandler(ctrl.updateStatus));
router.delete('/:id',                asyncHandler(ctrl.removeRelationship));

export default router;
