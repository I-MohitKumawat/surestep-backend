"use strict";
/**
 * SureStep — modules/care-circles/care-circles.router.ts
 *
 * Express routes for the Care Circle domain foundation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../../shared/middleware/authenticate");
const careCircleGuards_1 = require("../../shared/middleware/careCircleGuards");
const care_circles_controller_1 = require("./care-circles.controller");
const router = (0, express_1.Router)();
// ─── 1. Circle Lifecycle ──────────────────────────────────────────────────────
router.post('/', authenticate_1.authenticate, care_circles_controller_1.careCirclesController.createCircle);
router.get('/', authenticate_1.authenticate, care_circles_controller_1.careCirclesController.getMyCircle);
router.get('/my', authenticate_1.authenticate, care_circles_controller_1.careCirclesController.getMyCircle);
// ─── 2. Invitations Lookups & Submissions (before :circleId parameterized routes) ──
router.get('/invitations/:code', authenticate_1.authenticate, care_circles_controller_1.careCirclesController.getInvitation);
router.post('/invitations/:code/join', authenticate_1.authenticate, care_circles_controller_1.careCirclesController.submitJoinRequest);
router.post('/invitations/redeem', authenticate_1.authenticate, care_circles_controller_1.careCirclesController.redeemInvitation);
// ─── 3. Specific Circle Operations ────────────────────────────────────────────
router.get('/:circleId', authenticate_1.authenticate, (0, careCircleGuards_1.requireCircleMembership)('circleId'), care_circles_controller_1.careCirclesController.getCircle);
router.patch('/:circleId', authenticate_1.authenticate, (0, careCircleGuards_1.requireCircleOwner)('circleId'), care_circles_controller_1.careCirclesController.updateCircleName);
router.delete('/:circleId', authenticate_1.authenticate, (0, careCircleGuards_1.requireCircleOwner)('circleId'), care_circles_controller_1.careCirclesController.terminateCircle);
router.post('/:circleId/transfer-ownership', authenticate_1.authenticate, (0, careCircleGuards_1.requireCircleOwner)('circleId'), care_circles_controller_1.careCirclesController.transferOwnership);
router.post('/:circleId/leave', authenticate_1.authenticate, (0, careCircleGuards_1.requireCircleMembership)('circleId'), care_circles_controller_1.careCirclesController.leaveCircle);
// ─── 4. Members & Patients ────────────────────────────────────────────────────
router.get('/:circleId/members', authenticate_1.authenticate, (0, careCircleGuards_1.requireCircleMembership)('circleId'), care_circles_controller_1.careCirclesController.getMembers);
router.delete('/:circleId/members/:memberId', authenticate_1.authenticate, (0, careCircleGuards_1.requireCirclePermission)('Manage Member Permissions', 'circleId'), care_circles_controller_1.careCirclesController.removeMember);
router.get('/:circleId/patients', authenticate_1.authenticate, (0, careCircleGuards_1.requireCircleMembership)('circleId'), care_circles_controller_1.careCirclesController.getPatients);
// ─── 5. Circle Invitations & Join Requests Management ─────────────────────────
router.post('/:circleId/invitations', authenticate_1.authenticate, (0, careCircleGuards_1.requireCirclePermission)('Manage Member Permissions', 'circleId'), care_circles_controller_1.careCirclesController.createInvitation);
router.get('/:circleId/invitations', authenticate_1.authenticate, (0, careCircleGuards_1.requireCirclePermission)('Manage Member Permissions', 'circleId'), care_circles_controller_1.careCirclesController.getActiveInvitation);
router.post('/:circleId/invitations/revoke', authenticate_1.authenticate, (0, careCircleGuards_1.requireCirclePermission)('Manage Member Permissions', 'circleId'), care_circles_controller_1.careCirclesController.revokeActiveInvitation);
router.get('/:circleId/join-requests', authenticate_1.authenticate, (0, careCircleGuards_1.requireCirclePermission)('Manage Member Permissions', 'circleId'), care_circles_controller_1.careCirclesController.listJoinRequests);
router.post('/:circleId/join-requests/:requestId/review', authenticate_1.authenticate, (0, careCircleGuards_1.requireCirclePermission)('Manage Member Permissions', 'circleId'), care_circles_controller_1.careCirclesController.reviewJoinRequest);
// ─── 6. Canonical Delegated Permissions ───────────────────────────────────────
router.post('/:circleId/members/:memberId/permissions', authenticate_1.authenticate, (0, careCircleGuards_1.requireCirclePermission)('Manage Member Permissions', 'circleId'), care_circles_controller_1.careCirclesController.grantPermission);
router.put('/:circleId/members/:memberId/permissions', authenticate_1.authenticate, (0, careCircleGuards_1.requireCirclePermission)('Manage Member Permissions', 'circleId'), care_circles_controller_1.careCirclesController.setMemberPermissions);
router.patch('/:circleId/members/:memberId/permissions', authenticate_1.authenticate, (0, careCircleGuards_1.requireCirclePermission)('Manage Member Permissions', 'circleId'), care_circles_controller_1.careCirclesController.setMemberPermissions);
router.delete('/:circleId/members/:memberId/permissions/:permissionName', authenticate_1.authenticate, (0, careCircleGuards_1.requireCirclePermission)('Manage Member Permissions', 'circleId'), care_circles_controller_1.careCirclesController.revokePermission);
router.delete('/:circleId/members/:memberId/permissions', authenticate_1.authenticate, (0, careCircleGuards_1.requireCirclePermission)('Manage Member Permissions', 'circleId'), care_circles_controller_1.careCirclesController.revokePermission);
// ─── 7. Caregiver Contractual Relationships ───────────────────────────────────
router.get('/:circleId/caregivers', authenticate_1.authenticate, (0, careCircleGuards_1.requireCircleMembership)('circleId'), care_circles_controller_1.careCirclesController.listCaregivers);
router.post('/:circleId/caregivers', authenticate_1.authenticate, (0, careCircleGuards_1.requireCirclePermission)('Manage Caregiver Relationships', 'circleId'), care_circles_controller_1.careCirclesController.establishCaregiverRelationship);
router.post('/:circleId/caregivers/:relationshipId/suspend', authenticate_1.authenticate, (0, careCircleGuards_1.requireCirclePermission)('Manage Caregiver Relationships', 'circleId'), care_circles_controller_1.careCirclesController.suspendCaregiverRelationship);
router.post('/:circleId/caregivers/:relationshipId/restore', authenticate_1.authenticate, (0, careCircleGuards_1.requireCirclePermission)('Manage Caregiver Relationships', 'circleId'), care_circles_controller_1.careCirclesController.restoreCaregiverRelationship);
router.post('/:circleId/caregivers/:relationshipId/notice', authenticate_1.authenticate, care_circles_controller_1.careCirclesController.submitCaregiverNotice);
router.post('/:circleId/caregivers/:relationshipId/terminate', authenticate_1.authenticate, (0, careCircleGuards_1.requireCirclePermission)('Manage Caregiver Relationships', 'circleId'), care_circles_controller_1.careCirclesController.terminateCaregiverRelationship);
// ─── 8. Patient Assignments ───────────────────────────────────────────────────
router.post('/:circleId/caregivers/:relationshipId/assignments', authenticate_1.authenticate, (0, careCircleGuards_1.requireCirclePermission)('Manage Caregiver Relationships', 'circleId'), care_circles_controller_1.careCirclesController.assignCaregiverToPatient);
router.delete('/:circleId/caregivers/:relationshipId/assignments/:patientId', authenticate_1.authenticate, (0, careCircleGuards_1.requireCirclePermission)('Manage Caregiver Relationships', 'circleId'), care_circles_controller_1.careCirclesController.revokeCaregiverAssignment);
// ─── 9. Safe Zones (Circle Owner only CRUD - TARGET_ARCHITECTURE.md §3.5) ─────
router.post('/:circleId/safe-zones', authenticate_1.authenticate, (0, careCircleGuards_1.requireCircleOwner)('circleId'), care_circles_controller_1.careCirclesController.createSafeZone);
router.get('/:circleId/safe-zones', authenticate_1.authenticate, (0, careCircleGuards_1.requireCircleMembership)('circleId'), care_circles_controller_1.careCirclesController.listSafeZones);
router.patch('/:circleId/safe-zones/:zoneId', authenticate_1.authenticate, (0, careCircleGuards_1.requireCircleOwner)('circleId'), care_circles_controller_1.careCirclesController.updateSafeZone);
router.delete('/:circleId/safe-zones/:zoneId', authenticate_1.authenticate, (0, careCircleGuards_1.requireCircleOwner)('circleId'), care_circles_controller_1.careCirclesController.deleteSafeZone);
router.post('/:circleId/safe-zones/:zoneId/patients/:patientId', authenticate_1.authenticate, (0, careCircleGuards_1.requireCircleOwner)('circleId'), care_circles_controller_1.careCirclesController.attachPatientToSafeZone);
router.delete('/:circleId/safe-zones/:zoneId/patients/:patientId', authenticate_1.authenticate, (0, careCircleGuards_1.requireCircleOwner)('circleId'), care_circles_controller_1.careCirclesController.detachPatientFromSafeZone);
// ─── 10. Safety Alerts (Decoupled Responder & Owner-Only Resolution) ──────────
router.get('/:circleId/alerts', authenticate_1.authenticate, (0, careCircleGuards_1.requireCircleMembership)('circleId'), care_circles_controller_1.careCirclesController.listAlerts);
router.post('/:circleId/alerts/:alertId/respond', authenticate_1.authenticate, care_circles_controller_1.careCirclesController.respondToAlert);
router.post('/:circleId/alerts/:alertId/resolve', authenticate_1.authenticate, (0, careCircleGuards_1.requireCircleOwner)('circleId'), care_circles_controller_1.careCirclesController.resolveAlert);
exports.default = router;
//# sourceMappingURL=care-circles.router.js.map