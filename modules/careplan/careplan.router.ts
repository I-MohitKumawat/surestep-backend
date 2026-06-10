import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate';
import { requireRelationship } from '../../shared/middleware/requireRelationship';
import { asyncHandler } from '../../shared/utils/response';
import * as ctrl from './careplan.controller';

const router = Router();
router.use(authenticate);

router.get('/patient/:patientId',
  requireRelationship(),
  asyncHandler(ctrl.getByPatient),
);

export default router;
