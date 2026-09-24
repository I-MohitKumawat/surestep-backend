import { Router } from 'express';
import { authenticate, requireRoles } from '../../shared/middleware/authenticate';
import { asyncHandler } from '../../shared/utils/response';
import * as ctrl from './care-requests.controller';

const router = Router();

// All care request endpoints require authentication
router.use(authenticate);

// Lifecycle endpoints
router.post('/', requireRoles('PATIENT', 'FAMILY'), asyncHandler(ctrl.createCareRequest));
router.get('/incoming', requireRoles('CAREGIVER'), asyncHandler(ctrl.getIncomingCareRequests));
router.get('/outgoing', requireRoles('PATIENT', 'FAMILY'), asyncHandler(ctrl.getOutgoingCareRequests));
router.get('/:id', asyncHandler(ctrl.getCareRequestById));
router.post('/:id/accept', requireRoles('CAREGIVER'), asyncHandler(ctrl.acceptCareRequest));
router.post('/:id/decline', requireRoles('CAREGIVER'), asyncHandler(ctrl.declineCareRequest));
router.post('/:id/withdraw', requireRoles('PATIENT', 'FAMILY'), asyncHandler(ctrl.withdrawCareRequest));

export default router;
