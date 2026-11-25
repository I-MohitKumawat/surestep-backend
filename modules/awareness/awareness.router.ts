import { Router } from 'express';
import { authenticate, requireRoles } from '../../shared/middleware/authenticate';
import { requireRelationship } from '../../shared/middleware/requireRelationship';
import { asyncHandler } from '../../shared/utils/response';
import { AppError } from '../../shared/errors/AppError';
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
const deprecatedAwarenessSos = (_req: any, _res: any, next: any) => {
  next(new AppError(
    'ENDPOINT_DEPRECATED',
    'SOS is a top-level safety action. Use POST /api/v1/alerts/sos/patient/:patientId.',
    410,
  ));
};
router.all('/sos', deprecatedAwarenessSos);
router.post('/engagement', requireRoles('PATIENT'), asyncHandler(ctrl.updateEngagement));

export default router;
