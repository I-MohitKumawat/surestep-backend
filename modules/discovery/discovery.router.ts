import { Router } from 'express';
import { authenticate, requireRoles } from '../../shared/middleware/authenticate';
import { asyncHandler } from '../../shared/utils/response';
import * as ctrl from './discovery.controller';

const router = Router();

// Discovery is an authenticated, patient/family-facing feature
router.use(authenticate);
router.use(requireRoles('PATIENT', 'FAMILY'));

router.get('/caregivers', asyncHandler(ctrl.searchCaregivers));
router.get('/caregivers/:caregiverId', asyncHandler(ctrl.getCaregiverProfile));

export default router;
