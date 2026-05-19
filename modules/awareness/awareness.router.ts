import { Router } from 'express';
import { authenticate, requireRoles } from '../../shared/middleware/authenticate';
import { requireRelationship } from '../../shared/middleware/requireRelationship';
import { asyncHandler } from '../../shared/utils/response';
import * as ctrl from './awareness.controller';

const router = Router();
router.use(authenticate);

router.get('/patient/:patientId/state',
  requireRelationship('patientId'),
  asyncHandler(ctrl.getPatientState),
);
router.get('/my-patients/states',
  requireRoles('CAREGIVER'),
  asyncHandler(ctrl.getAllStates),
);

// Patient-only actions
router.post('/sos', requireRoles('PATIENT'), asyncHandler(ctrl.sos));
router.post('/engagement', requireRoles('PATIENT'), asyncHandler(ctrl.updateEngagement));

export default router;
