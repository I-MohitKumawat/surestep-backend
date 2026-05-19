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
router.patch('/:id/status',          asyncHandler(ctrl.updateStatus));
router.delete('/:id',                asyncHandler(ctrl.removeRelationship));

export default router;
