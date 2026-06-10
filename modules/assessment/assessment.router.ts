import { Router } from 'express';
import { authenticate, requireRoles } from '../../shared/middleware/authenticate';
import { requireRelationship } from '../../shared/middleware/requireRelationship';
import { asyncHandler } from '../../shared/utils/response';
import * as ctrl from './assessment.controller';

const router = Router();
router.use(authenticate);

// Save progress or submit final assessment
router.post('/patient/:patientId',
  requireRoles('CAREGIVER'),
  requireRelationship(),
  asyncHandler(ctrl.save),
);

// Get latest assessment
router.get('/patient/:patientId',
  requireRelationship(),
  asyncHandler(ctrl.getLatest),
);

// Get historical versions
router.get('/patient/:patientId/history',
  requireRelationship(),
  asyncHandler(ctrl.getHistory),
);

// Get specific assessment version by ID
router.get('/:id',
  asyncHandler(ctrl.getById),
);

export default router;
