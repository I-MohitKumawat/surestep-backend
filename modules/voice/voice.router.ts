import { Router } from 'express';
import { authenticate, requireRoles } from '../../shared/middleware/authenticate';
import { requireActivePatientAssignment } from '../../shared/middleware/careCircleGuards';
import { asyncHandler } from '../../shared/utils/response';
import { AppError } from '../../shared/errors/AppError';
import * as ctrl from './voice.controller';

const router = Router();
router.use(authenticate);

// Voice samples — resource-aware guarded with Care Circle patient assignment
router.post('/samples/patient/:patientId',
  requireRoles('FAMILY'),
  requireActivePatientAssignment('patientId'),
  asyncHandler(ctrl.uploadSample),
);
router.get('/samples/patient/:patientId',
  requireActivePatientAssignment('patientId'),
  asyncHandler(ctrl.listSamples),
);
router.delete('/samples/:id', requireRoles('FAMILY'), asyncHandler(ctrl.removeSample));

// Voice messages — resource-aware guarded with Care Circle patient assignment
router.post('/messages/manual/patient/:patientId',
  requireRoles('FAMILY'),
  requireActivePatientAssignment('patientId'),
  asyncHandler(ctrl.sendManualMessage),
);
router.get('/messages/patient/:patientId',
  requireActivePatientAssignment('patientId'),
  asyncHandler(ctrl.listMessages),
);

// ─── Legacy Familiarity Faces, Stories, and Memories (Decommissioned) ─────────
const deprecatedReminiscenceHandler = (_req: any, _res: any, next: any) => {
  next(new AppError('DEPRECATED_ENDPOINT', 'Legacy voice reminiscence endpoints are deprecated. Use canonical /api/v1/patients/:patientId/memories endpoints.', 410));
};

router.post('/faces/patient/:patientId', deprecatedReminiscenceHandler);
router.get('/faces/patient/:patientId',  deprecatedReminiscenceHandler);

router.post('/stories/patient/:patientId', deprecatedReminiscenceHandler);
router.get('/stories/patient/:patientId',  deprecatedReminiscenceHandler);
router.post('/stories/:id/react',          deprecatedReminiscenceHandler);

router.post('/memories/patient/:patientId',      deprecatedReminiscenceHandler);
router.get('/memories/patient/:patientId/daily', deprecatedReminiscenceHandler);

export default router;
