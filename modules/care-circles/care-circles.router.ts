/**
 * SureStep — modules/care-circles/care-circles.router.ts
 *
 * Express routes for the Care Circle domain foundation.
 */

import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate';
import {
  requireCircleMembership,
  requireCircleOwner,
  requireCirclePermission,
} from '../../shared/middleware/careCircleGuards';
import { careCirclesController } from './care-circles.controller';

const router = Router();

// ─── 1. Circle Lifecycle ──────────────────────────────────────────────────────
router.post(
  '/',
  authenticate,
  careCirclesController.createCircle
);

router.get(
  '/',
  authenticate,
  careCirclesController.getMyCircle
);

router.get(
  '/my',
  authenticate,
  careCirclesController.getMyCircle
);

// ─── 2. Invitations Lookups & Submissions (before :circleId parameterized routes) ──
router.get(
  '/invitations/:code',
  authenticate,
  careCirclesController.getInvitation
);

router.post(
  '/invitations/:code/join',
  authenticate,
  careCirclesController.submitJoinRequest
);

router.post(
  '/invitations/redeem',
  authenticate,
  careCirclesController.redeemInvitation
);

// ─── 3. Specific Circle Operations ────────────────────────────────────────────
router.get(
  '/:circleId',
  authenticate,
  requireCircleMembership('circleId'),
  careCirclesController.getCircle
);

router.patch(
  '/:circleId',
  authenticate,
  requireCircleOwner('circleId'),
  careCirclesController.updateCircleName
);

router.delete(
  '/:circleId',
  authenticate,
  requireCircleOwner('circleId'),
  careCirclesController.terminateCircle
);

router.post(
  '/:circleId/transfer-ownership',
  authenticate,
  requireCircleOwner('circleId'),
  careCirclesController.transferOwnership
);

router.post(
  '/:circleId/leave',
  authenticate,
  requireCircleMembership('circleId'),
  careCirclesController.leaveCircle
);

// ─── 4. Members & Patients ────────────────────────────────────────────────────
router.get(
  '/:circleId/members',
  authenticate,
  requireCircleMembership('circleId'),
  careCirclesController.getMembers
);

router.delete(
  '/:circleId/members/:memberId',
  authenticate,
  requireCirclePermission('Manage Member Permissions', 'circleId'),
  careCirclesController.removeMember
);

router.get(
  '/:circleId/patients',
  authenticate,
  requireCircleMembership('circleId'),
  careCirclesController.getPatients
);

// ─── 5. Circle Invitations & Join Requests Management ─────────────────────────
router.post(
  '/:circleId/invitations',
  authenticate,
  requireCirclePermission('Manage Member Permissions', 'circleId'),
  careCirclesController.createInvitation
);

router.get(
  '/:circleId/invitations',
  authenticate,
  requireCirclePermission('Manage Member Permissions', 'circleId'),
  careCirclesController.getActiveInvitation
);

router.post(
  '/:circleId/invitations/revoke',
  authenticate,
  requireCirclePermission('Manage Member Permissions', 'circleId'),
  careCirclesController.revokeActiveInvitation
);

router.get(
  '/:circleId/join-requests',
  authenticate,
  requireCirclePermission('Manage Member Permissions', 'circleId'),
  careCirclesController.listJoinRequests
);

router.post(
  '/:circleId/join-requests/:requestId/review',
  authenticate,
  requireCirclePermission('Manage Member Permissions', 'circleId'),
  careCirclesController.reviewJoinRequest
);

// ─── 6. Canonical Delegated Permissions ───────────────────────────────────────
router.post(
  '/:circleId/members/:memberId/permissions',
  authenticate,
  requireCirclePermission('Manage Member Permissions', 'circleId'),
  careCirclesController.grantPermission
);

router.put(
  '/:circleId/members/:memberId/permissions',
  authenticate,
  requireCirclePermission('Manage Member Permissions', 'circleId'),
  careCirclesController.setMemberPermissions
);

router.patch(
  '/:circleId/members/:memberId/permissions',
  authenticate,
  requireCirclePermission('Manage Member Permissions', 'circleId'),
  careCirclesController.setMemberPermissions
);

router.delete(
  '/:circleId/members/:memberId/permissions/:permissionName',
  authenticate,
  requireCirclePermission('Manage Member Permissions', 'circleId'),
  careCirclesController.revokePermission
);

router.delete(
  '/:circleId/members/:memberId/permissions',
  authenticate,
  requireCirclePermission('Manage Member Permissions', 'circleId'),
  careCirclesController.revokePermission
);

// ─── 7. Caregiver Contractual Relationships ───────────────────────────────────
router.get(
  '/:circleId/caregivers',
  authenticate,
  requireCircleMembership('circleId'),
  careCirclesController.listCaregivers
);

router.post(
  '/:circleId/caregivers',
  authenticate,
  requireCirclePermission('Manage Caregiver Relationships', 'circleId'),
  careCirclesController.establishCaregiverRelationship
);

router.post(
  '/:circleId/caregivers/:relationshipId/suspend',
  authenticate,
  requireCirclePermission('Manage Caregiver Relationships', 'circleId'),
  careCirclesController.suspendCaregiverRelationship
);

router.post(
  '/:circleId/caregivers/:relationshipId/restore',
  authenticate,
  requireCirclePermission('Manage Caregiver Relationships', 'circleId'),
  careCirclesController.restoreCaregiverRelationship
);

router.post(
  '/:circleId/caregivers/:relationshipId/notice',
  authenticate,
  careCirclesController.submitCaregiverNotice
);

router.post(
  '/:circleId/caregivers/:relationshipId/terminate',
  authenticate,
  requireCirclePermission('Manage Caregiver Relationships', 'circleId'),
  careCirclesController.terminateCaregiverRelationship
);

// ─── 8. Patient Assignments ───────────────────────────────────────────────────
router.post(
  '/:circleId/caregivers/:relationshipId/assignments',
  authenticate,
  requireCirclePermission('Manage Caregiver Relationships', 'circleId'),
  careCirclesController.assignCaregiverToPatient
);

router.delete(
  '/:circleId/caregivers/:relationshipId/assignments/:patientId',
  authenticate,
  requireCirclePermission('Manage Caregiver Relationships', 'circleId'),
  careCirclesController.revokeCaregiverAssignment
);

// ─── 9. Safe Zones (Circle Owner only CRUD - TARGET_ARCHITECTURE.md §3.5) ─────
router.post(
  '/:circleId/safe-zones',
  authenticate,
  requireCircleOwner('circleId'),
  careCirclesController.createSafeZone
);

router.get(
  '/:circleId/safe-zones',
  authenticate,
  requireCircleMembership('circleId'),
  careCirclesController.listSafeZones
);

router.patch(
  '/:circleId/safe-zones/:zoneId',
  authenticate,
  requireCircleOwner('circleId'),
  careCirclesController.updateSafeZone
);

router.delete(
  '/:circleId/safe-zones/:zoneId',
  authenticate,
  requireCircleOwner('circleId'),
  careCirclesController.deleteSafeZone
);

router.post(
  '/:circleId/safe-zones/:zoneId/patients/:patientId',
  authenticate,
  requireCircleOwner('circleId'),
  careCirclesController.attachPatientToSafeZone
);

router.delete(
  '/:circleId/safe-zones/:zoneId/patients/:patientId',
  authenticate,
  requireCircleOwner('circleId'),
  careCirclesController.detachPatientFromSafeZone
);

// ─── 10. Safety Alerts (Decoupled Responder & Owner-Only Resolution) ──────────
router.get(
  '/:circleId/alerts',
  authenticate,
  requireCircleMembership('circleId'),
  careCirclesController.listAlerts
);

router.post(
  '/:circleId/alerts/:alertId/respond',
  authenticate,
  careCirclesController.respondToAlert
);

router.post(
  '/:circleId/alerts/:alertId/resolve',
  authenticate,
  requireCircleOwner('circleId'),
  careCirclesController.resolveAlert
);

export default router;

