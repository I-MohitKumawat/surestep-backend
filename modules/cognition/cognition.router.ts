import { Router } from 'express';
import { authenticate, requireRoles } from '../../shared/middleware/authenticate';
import { requireRelationship } from '../../shared/middleware/requireRelationship';
import { asyncHandler, ok, created } from '../../shared/utils/response';
import * as svc from './cognition.service';
import { Request, Response } from 'express';

const router = Router();
router.use(authenticate);

router.post('/sessions', requireRoles('PATIENT'), asyncHandler(async (req: Request, res: Response) => {
  const session = await svc.recordSession(req.user!.id, req.body);
  created(res, { session });
}));

router.get('/sessions/patient/:patientId',
  requireRoles('CAREGIVER'),
  requireRelationship('patientId', ['CAREGIVER']),
  asyncHandler(async (req: Request, res: Response) => {
    const { limit = '20', cursor } = req.query as any;
    const result = await svc.getSessions(req.params.patientId, parseInt(limit), cursor);
    ok(res, result);
  }),
);

router.get('/assessments/patient/:patientId',
  requireRelationship('patientId', ['CAREGIVER','GUARDIAN','DOCTOR']),
  asyncHandler(async (req: Request, res: Response) => {
    const assessments = await svc.getAssessments(req.params.patientId);
    ok(res, { assessments });
  }),
);

export default router;
