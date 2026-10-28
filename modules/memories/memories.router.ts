/**
 * SureStep — modules/memories/memories.router.ts
 *
 * Mounts:
 *   - /patients/:patientId/memories
 *   - /patients/:patientId/activities
 *
 * Baselines:
 *   - docs/workflows/09-MEMORIES-AND-ACTIVITIES.md
 *   - docs/architecture/TARGET_ARCHITECTURE.md (§3.7, §4.2, §4.3)
 */

import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate';
import {
  requireActivePatientAssignment,
  requirePatientMemoryManagementAuthority,
} from '../../shared/middleware/careCircleGuards';
import { asyncHandler } from '../../shared/utils/response';
import * as ctrl from './memories.controller';

const router = Router();
router.use(authenticate);

// ─── Memories ────────────────────────────────────────────────────────────────
router.post(
  '/patients/:patientId/memories',
  requirePatientMemoryManagementAuthority('patientId'),
  asyncHandler(ctrl.createMemory)
);

router.get(
  '/patients/:patientId/memories',
  requireActivePatientAssignment('patientId'),
  asyncHandler(ctrl.listMemories)
);

router.get(
  '/patients/:patientId/memories/:memoryId',
  requireActivePatientAssignment('patientId'),
  asyncHandler(ctrl.getMemoryById)
);

router.patch(
  '/patients/:patientId/memories/:memoryId',
  requirePatientMemoryManagementAuthority('patientId'),
  asyncHandler(ctrl.updateMemory)
);

router.delete(
  '/patients/:patientId/memories/:memoryId',
  asyncHandler(ctrl.deleteMemory)
);

// ─── Activities (Voluntary Engagement / Observational Only) ───────────────────
router.post(
  '/patients/:patientId/activities',
  requireActivePatientAssignment('patientId'),
  asyncHandler(ctrl.recordActivity)
);

router.get(
  '/patients/:patientId/activities',
  requireActivePatientAssignment('patientId'),
  asyncHandler(ctrl.listActivities)
);

export default router;

