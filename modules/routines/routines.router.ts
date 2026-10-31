/**
 * SureStep Backend — modules/routines/routines.router.ts
 * Routes for routine templates, task instances, attachments, and adherence.
 */
import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate';
import { requireRelationship } from '../../shared/middleware/requireRelationship';
import { asyncHandler } from '../../shared/utils/response';
import * as ctrl from './routines.controller';

const router = Router();
router.use(authenticate);

import {
  requireRoutineDefinitionCRUDAuthority,
  requireRoutineTemplateDefinitionAuthority,
  requireRoutineSignOffAuthority,
  requireOccurrenceSignOffAuthority,
  requireActivePatientAssignment,
} from '../../shared/middleware/careCircleGuards';
import { AppError } from '../../shared/errors/AppError';

// ─── Authoritative Patient Care & Routine Routes (TARGET_ARCHITECTURE.md §8.1) ─

// POST   /patients/:patientId/routines — create routine definition (care-plan admin only)
router.post('/patients/:patientId/routines',
  requireRoutineDefinitionCRUDAuthority('patientId'),
  asyncHandler(ctrl.createDefinition),
);

// GET    /patients/:patientId/routines — list routine definitions
router.get('/patients/:patientId/routines',
  requireActivePatientAssignment('patientId'),
  asyncHandler(ctrl.getDefinitions),
);

// GET    /patients/:patientId/routines/occurrences — list occurrences for agenda
// Must be declared before /:routineId so the literal "occurrences" segment is
// not captured as a routine definition id.
router.get('/patients/:patientId/routines/occurrences',
  requireActivePatientAssignment('patientId'),
  asyncHandler(ctrl.listOccurrences),
);

// GET    /patients/:patientId/routines/:routineId — get single routine definition
router.get('/patients/:patientId/routines/:routineId',
  requireActivePatientAssignment('patientId'),
  asyncHandler(ctrl.getDefinitionById),
);

// PATCH  /patients/:patientId/routines/:routineId — update routine definition (care-plan admin only)
router.patch('/patients/:patientId/routines/:routineId',
  requireRoutineDefinitionCRUDAuthority('patientId'),
  asyncHandler(ctrl.updateDefinition),
);

// DELETE /patients/:patientId/routines/:routineId — deactivate routine definition (care-plan admin only)
router.delete('/patients/:patientId/routines/:routineId',
  requireRoutineDefinitionCRUDAuthority('patientId'),
  asyncHandler(ctrl.deleteDefinition),
);

// POST   /patients/:patientId/routines/:routineId/occurrences/:occurrenceId/sign-off
router.post('/patients/:patientId/routines/:routineId/occurrences/:occurrenceId/sign-off',
  requireRoutineSignOffAuthority('patientId'),
  asyncHandler(ctrl.signOffOccurrence),
);

// POST   /routines/occurrences/:occurrenceId/sign-off (direct occurrence route — resource-aware guarded)
router.post('/routines/occurrences/:occurrenceId/sign-off',
  requireOccurrenceSignOffAuthority('occurrenceId'),
  asyncHandler(ctrl.signOffOccurrence),
);

// ─── Routine Template Compatibility Routes ───────────────────────────────────
// These routes back the existing patient/family routine-manager UI. Definition
// mutations enforce the same canonical policy as /patients/:patientId/routines;
// creation provenance is never used as authorization.

// GET  /routines/patient/:patientId         — list all active routine templates for a patient
// POST /routines/patient/:patientId         — create a new routine template (care-plan admin only)
router.get('/routines/patient/:patientId',
  requireActivePatientAssignment('patientId'),
  asyncHandler(ctrl.listRoutineTemplates),
);
router.post('/routines/patient/:patientId',
  requireRoutineDefinitionCRUDAuthority('patientId'),
  asyncHandler(ctrl.createRoutineTemplate),
);

// PATCH  /routines/:id  — update a routine template (care-plan admin only)
// DELETE /routines/:id  — soft-delete (deactivate) a routine template (care-plan admin only)
router.patch('/routines/:id',
  requireRoutineTemplateDefinitionAuthority('id'),
  asyncHandler(ctrl.updateRoutineTemplate),
);
router.delete('/routines/:id',
  requireRoutineTemplateDefinitionAuthority('id'),
  asyncHandler(ctrl.deactivateRoutineTemplate),
);

// ─── Attachment Routes ────────────────────────────────────────────────────────

// POST   /routines/:id/attachments                          — add an attachment record
// DELETE /routines/:id/attachments/:attachmentId            — remove an attachment
router.post('/routines/:id/attachments',
  requireRoutineTemplateDefinitionAuthority('id'),
  asyncHandler(ctrl.addAttachment),
);
router.delete('/routines/:id/attachments/:attachmentId',
  requireRoutineTemplateDefinitionAuthority('id'),
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
const deprecatedTaskMutationHandler = (_req: any, _res: any, next: any) => {
  next(new AppError('DEPRECATED_ENDPOINT', 'This legacy task endpoint is deprecated. Professional Caregivers are forbidden from routine CRUD in V1, and routine progress is tracked via occurrence sign-off.', 410));
};

router.post('/tasks/patient/:patientId', deprecatedTaskMutationHandler);
router.patch('/tasks/:id', deprecatedTaskMutationHandler);
router.delete('/tasks/:id', deprecatedTaskMutationHandler);

// Idempotent status update — decommissioned (non-canonical states like skipped/missed forbidden in V1)
router.post('/tasks/:id/status', deprecatedTaskMutationHandler);

// Legacy endpoints — decommissioned
router.post('/tasks/:id/complete', deprecatedTaskMutationHandler);
router.post('/tasks/:id/unsure', deprecatedTaskMutationHandler);

// Legacy template routes — decommissioned
router.get('/routines/templates', deprecatedTaskMutationHandler);

export default router;
