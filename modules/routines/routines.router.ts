/**
 * SureStep Backend — modules/routines/routines.router.ts
 *
 * Canonical routine surface only:
 *   - Routine definitions scoped to a Patient.
 *   - Materialized routine occurrences.
 *   - Occurrence sign-off.
 *
 * Legacy routine-template, task-instance, attachment, and adherence endpoints
 * are retired and fail closed with 410 Gone.
 */
import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate';
import { asyncHandler } from '../../shared/utils/response';
import * as ctrl from './routines.controller';

import {
  requireRoutineDefinitionCRUDAuthority,
  requireRoutineSignOffAuthority,
  requireOccurrenceSignOffAuthority,
  requireActivePatientAssignment,
} from '../../shared/middleware/careCircleGuards';
import { AppError } from '../../shared/errors/AppError';

const router = Router();
router.use(authenticate);

const deprecatedRoutineHandler = (_req: any, _res: any, next: any) => {
  next(new AppError(
    'ENDPOINT_DEPRECATED',
    'This legacy routine/task endpoint is retired. Use /patients/:patientId/routines and /patients/:patientId/routines/occurrences; sign off with /routines/occurrences/:occurrenceId/sign-off.',
    410,
  ));
};

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

// ─── Retired routine/task surfaces (410 GONE) ────────────────────────────────
router.all('/routines/patient/:patientId', deprecatedRoutineHandler);
router.all('/routines/templates', deprecatedRoutineHandler);
router.all('/routines/:id', deprecatedRoutineHandler);
router.all('/routines/:id/attachments', deprecatedRoutineHandler);
router.all('/routines/:id/attachments/:attachmentId', deprecatedRoutineHandler);
router.all('/tasks/patient/:patientId', deprecatedRoutineHandler);
router.all('/tasks/patient/:patientId/today', deprecatedRoutineHandler);
router.all('/tasks/patient/:patientId/adherence', deprecatedRoutineHandler);
router.all('/tasks/:id', deprecatedRoutineHandler);
router.all('/tasks/:id/status', deprecatedRoutineHandler);
router.all('/tasks/:id/complete', deprecatedRoutineHandler);
router.all('/tasks/:id/unsure', deprecatedRoutineHandler);

export default router;
