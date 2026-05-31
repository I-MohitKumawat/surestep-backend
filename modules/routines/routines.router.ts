/**
 * SureStep Backend — modules/routines/routines.router.ts
 * Routes for routine templates, task instances, attachments, and adherence.
 */
import { Router } from 'express';
import { authenticate, requireRoles } from '../../shared/middleware/authenticate';
import { requireRelationship } from '../../shared/middleware/requireRelationship';
import { asyncHandler } from '../../shared/utils/response';
import * as ctrl from './routines.controller';

const router = Router();
router.use(authenticate);

// ─── Routine Template Routes ──────────────────────────────────────────────────

// GET  /routines/patient/:patientId         — list all active routine templates for a patient
// POST /routines/patient/:patientId         — create a new routine template (caregiver only)
router.get('/routines/patient/:patientId',
  requireRelationship('patientId', ['CAREGIVER', 'FAMILY_CLOSE', 'GUARDIAN']),
  asyncHandler(ctrl.listRoutineTemplates),
);
router.post('/routines/patient/:patientId',
  requireRoles('CAREGIVER'),
  requireRelationship('patientId', ['CAREGIVER']),
  asyncHandler(ctrl.createRoutineTemplate),
);

// PATCH  /routines/:id  — update a routine template
// DELETE /routines/:id  — soft-delete (deactivate) a routine template
router.patch('/routines/:id',   requireRoles('CAREGIVER'), asyncHandler(ctrl.updateRoutineTemplate));
router.delete('/routines/:id',  requireRoles('CAREGIVER'), asyncHandler(ctrl.deactivateRoutineTemplate));

// ─── Attachment Routes ────────────────────────────────────────────────────────

// POST   /routines/:id/attachments                          — add an attachment record
// DELETE /routines/:id/attachments/:attachmentId            — remove an attachment
router.post('/routines/:id/attachments',
  requireRoles('CAREGIVER'),
  asyncHandler(ctrl.addAttachment),
);
router.delete('/routines/:id/attachments/:attachmentId',
  requireRoles('CAREGIVER'),
  asyncHandler(ctrl.removeAttachment),
);

// ─── Task Instance Routes ─────────────────────────────────────────────────────

// GET  /tasks/patient/:patientId/today      — fetch today's tasks
// GET  /tasks/patient/:patientId            — paginated task history
// POST /tasks/patient/:patientId            — create a standalone task instance
// PATCH  /tasks/:id                         — update task fields
// DELETE /tasks/:id                         — delete a task instance
// POST /tasks/:id/status                    — idempotent status update (done/missed/overdue/unsure/skipped)
// POST /tasks/:id/complete                  — legacy complete endpoint
// POST /tasks/:id/unsure                    — legacy unsure endpoint
// GET  /tasks/patient/:patientId/adherence  — adherence snapshot for a date
router.get('/tasks/patient/:patientId/today',
  requireRelationship('patientId', ['CAREGIVER', 'FAMILY_CLOSE', 'GUARDIAN']),
  asyncHandler(ctrl.getTodayTasks),
);
router.get('/tasks/patient/:patientId/adherence',
  requireRelationship('patientId', ['CAREGIVER', 'FAMILY_CLOSE', 'GUARDIAN']),
  asyncHandler(ctrl.getAdherenceSnapshot),
);
router.get('/tasks/patient/:patientId',
  requireRelationship('patientId'),
  asyncHandler(ctrl.getTaskHistory),
);
router.post('/tasks/patient/:patientId',
  requireRoles('CAREGIVER'),
  requireRelationship('patientId', ['CAREGIVER']),
  asyncHandler(ctrl.createTask),
);
router.patch('/tasks/:id',    requireRoles('CAREGIVER'), asyncHandler(ctrl.updateTask));
router.delete('/tasks/:id',   requireRoles('CAREGIVER'), asyncHandler(ctrl.deleteTask));

// Idempotent status update — used by mobile offline queue
router.post('/tasks/:id/status',
  asyncHandler(ctrl.updateTaskStatus),
);

// Legacy endpoints — kept for backward compat
router.post('/tasks/:id/complete', requireRoles('PATIENT'), asyncHandler(ctrl.completeTask));
router.post('/tasks/:id/unsure',   requireRoles('PATIENT'), asyncHandler(ctrl.unsureTask));

// Legacy template routes (caregiver-scoped, pre-redesign)
router.get('/routines/templates', requireRoles('CAREGIVER'), asyncHandler(ctrl.getTemplates));

export default router;
