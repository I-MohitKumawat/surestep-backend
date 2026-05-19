import { Router } from 'express';
import { authenticate, requireRoles } from '../../shared/middleware/authenticate';
import { requireRelationship } from '../../shared/middleware/requireRelationship';
import { asyncHandler } from '../../shared/utils/response';
import * as ctrl from './routines.controller';

const router = Router();
router.use(authenticate);

// Template routes
router.get('/templates',                requireRoles('CAREGIVER'), asyncHandler(ctrl.getTemplates));
router.post('/templates',               requireRoles('CAREGIVER'), asyncHandler(ctrl.createTemplate));
router.post('/templates/:id/assign',    requireRoles('CAREGIVER'), asyncHandler(ctrl.assignTemplate));

// Task routes
router.get('/patient/:patientId/today',
  requireRelationship('patientId', ['CAREGIVER','FAMILY_CLOSE','GUARDIAN']),
  asyncHandler(ctrl.getTodayTasks),
);
router.get('/patient/:patientId',
  requireRelationship('patientId'),
  asyncHandler(ctrl.getTaskHistory),
);
router.post('/patient/:patientId',
  requireRoles('CAREGIVER'),
  requireRelationship('patientId', ['CAREGIVER']),
  asyncHandler(ctrl.createTask),
);
router.patch('/:id',      requireRoles('CAREGIVER'), asyncHandler(ctrl.updateTask));
router.delete('/:id',     requireRoles('CAREGIVER'), asyncHandler(ctrl.deleteTask));
router.post('/:id/complete', requireRoles('PATIENT'), asyncHandler(ctrl.completeTask));
router.post('/:id/unsure',   requireRoles('PATIENT'), asyncHandler(ctrl.unsureTask));

export default router;
