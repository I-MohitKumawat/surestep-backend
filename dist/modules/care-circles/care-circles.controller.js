"use strict";
/**
 * SureStep — modules/care-circles/care-circles.controller.ts
 *
 * Controller handlers for the Care Circle domain foundation.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.careCirclesController = exports.CareCirclesController = void 0;
require("../../shared/types");
const care_circles_service_1 = require("./care-circles.service");
const invitations_service_1 = require("./invitations.service");
const permissions_service_1 = require("./permissions.service");
const caregiver_relationships_service_1 = require("./caregiver-relationships.service");
const patient_assignments_service_1 = require("./patient-assignments.service");
class CareCirclesController {
    async createCircle(req, res, next) {
        try {
            const ownerId = req.user.id;
            const { name } = req.body;
            const circle = await care_circles_service_1.careCirclesService.createCareCircle(ownerId, name);
            res.status(201).json({ success: true, data: circle });
        }
        catch (err) {
            next(err);
        }
    }
    async getMyCircle(req, res, next) {
        try {
            const userId = req.user.id;
            const circle = await care_circles_service_1.careCirclesService.getUserActiveCircle(userId);
            res.json({
                success: true,
                data: circle,
                circle,
                circles: circle ? [circle] : [],
            });
        }
        catch (err) {
            next(err);
        }
    }
    async getCircle(req, res, next) {
        try {
            const circleId = req.params.circleId;
            const userId = req.user.id;
            const circle = await care_circles_service_1.careCirclesService.getCareCircle(circleId, userId);
            res.json({ success: true, data: circle });
        }
        catch (err) {
            next(err);
        }
    }
    async updateCircleName(req, res, next) {
        try {
            const circleId = req.params.circleId;
            const userId = req.user.id;
            const { name } = req.body;
            const updated = await care_circles_service_1.careCirclesService.updateCareCircleName(circleId, userId, name);
            res.json({ success: true, data: updated });
        }
        catch (err) {
            next(err);
        }
    }
    async terminateCircle(req, res, next) {
        try {
            const circleId = req.params.circleId;
            const userId = req.user.id;
            const terminated = await care_circles_service_1.careCirclesService.terminateCareCircle(circleId, userId);
            res.json({ success: true, data: terminated });
        }
        catch (err) {
            next(err);
        }
    }
    async getMembers(req, res, next) {
        try {
            const circleId = req.params.circleId;
            const members = await care_circles_service_1.careCirclesService.getCircleMembers(circleId);
            res.json({ success: true, data: members });
        }
        catch (err) {
            next(err);
        }
    }
    async removeMember(req, res, next) {
        try {
            const { circleId, memberId } = req.params;
            const actorId = req.user.id;
            const result = await care_circles_service_1.careCirclesService.removeCircleMember(circleId, actorId, memberId);
            res.json({ success: true, data: result });
        }
        catch (err) {
            next(err);
        }
    }
    async getPatients(req, res, next) {
        try {
            const circleId = req.params.circleId;
            const patients = await care_circles_service_1.careCirclesService.getCirclePatients(circleId);
            res.json({ success: true, data: patients });
        }
        catch (err) {
            next(err);
        }
    }
    async createInvitation(req, res, next) {
        try {
            const circleId = req.params.circleId;
            const actorId = req.user.id;
            const invitation = await invitations_service_1.invitationsService.generateInvitation(circleId, actorId);
            res.status(201).json({ success: true, data: { invitation }, invitation });
        }
        catch (err) {
            next(err);
        }
    }
    async getActiveInvitation(req, res, next) {
        try {
            const circleId = req.params.circleId;
            const actorId = req.user.id;
            const invitation = await invitations_service_1.invitationsService.getActiveInvitation(circleId, actorId);
            res.json({ success: true, data: { invitation }, invitation });
        }
        catch (err) {
            next(err);
        }
    }
    async revokeActiveInvitation(req, res, next) {
        try {
            const circleId = req.params.circleId;
            const actorId = req.user.id;
            const result = await invitations_service_1.invitationsService.revokeActiveInvitation(circleId, actorId);
            res.json({ success: true, data: result });
        }
        catch (err) {
            next(err);
        }
    }
    async getInvitation(req, res, next) {
        try {
            const code = req.params.code;
            const invitation = await invitations_service_1.invitationsService.getInvitationByCode(code);
            res.json({ success: true, data: invitation });
        }
        catch (err) {
            next(err);
        }
    }
    async submitJoinRequest(req, res, next) {
        try {
            const code = req.params.code;
            const applicantId = req.user.id;
            const joinRequest = await invitations_service_1.invitationsService.submitJoinRequest(code, applicantId);
            res.status(201).json({ success: true, data: joinRequest });
        }
        catch (err) {
            next(err);
        }
    }
    async listJoinRequests(req, res, next) {
        try {
            const circleId = req.params.circleId;
            const actorId = req.user.id;
            const requests = await invitations_service_1.invitationsService.listPendingJoinRequests(circleId, actorId);
            res.json({ success: true, data: requests });
        }
        catch (err) {
            next(err);
        }
    }
    async reviewJoinRequest(req, res, next) {
        try {
            const { circleId, requestId } = req.params;
            const reviewerId = req.user.id;
            const { decision } = req.body;
            const result = await invitations_service_1.invitationsService.reviewJoinRequest(requestId, reviewerId, { decision }, circleId);
            res.json({ success: true, data: result });
        }
        catch (err) {
            next(err);
        }
    }
    async grantPermission(req, res, next) {
        try {
            const { circleId, memberId } = req.params;
            const actorId = req.user.id;
            const { permissionName } = req.body;
            const granted = await permissions_service_1.permissionsService.grantPermission(circleId, actorId, memberId, permissionName);
            res.status(201).json({ success: true, data: granted });
        }
        catch (err) {
            next(err);
        }
    }
    async revokePermission(req, res, next) {
        try {
            const { circleId, memberId } = req.params;
            const actorId = req.user.id;
            const permissionName = (req.query.permissionName ||
                req.body?.permissionName ||
                req.params.permissionName);
            const result = await permissions_service_1.permissionsService.revokePermission(circleId, actorId, memberId, permissionName);
            res.json({ success: true, data: result });
        }
        catch (err) {
            next(err);
        }
    }
    async setMemberPermissions(req, res, next) {
        try {
            const { circleId, memberId } = req.params;
            const actorId = req.user.id;
            const { permissions } = req.body;
            const updated = await permissions_service_1.permissionsService.setMemberPermissions(circleId, actorId, memberId, permissions || []);
            res.json({ success: true, data: updated });
        }
        catch (err) {
            next(err);
        }
    }
    async redeemInvitation(req, res, next) {
        try {
            const code = req.body?.code || req.params?.code;
            const applicantId = req.user.id;
            const joinRequest = await invitations_service_1.invitationsService.submitJoinRequest(code, applicantId);
            res.status(201).json({ success: true, data: joinRequest });
        }
        catch (err) {
            next(err);
        }
    }
    async listCaregivers(req, res, next) {
        try {
            const circleId = req.params.circleId;
            const caregivers = await caregiver_relationships_service_1.caregiverRelationshipsService.listCircleCaregivers(circleId);
            res.json({ success: true, data: caregivers });
        }
        catch (err) {
            next(err);
        }
    }
    async establishCaregiverRelationship(req, res, next) {
        try {
            const circleId = req.params.circleId;
            const actorId = req.user.id;
            const { caregiverId } = req.body;
            const rel = await caregiver_relationships_service_1.caregiverRelationshipsService.establishRelationship(circleId, actorId, caregiverId);
            res.status(201).json({ success: true, data: rel });
        }
        catch (err) {
            next(err);
        }
    }
    async suspendCaregiverRelationship(req, res, next) {
        try {
            const { relationshipId } = req.params;
            const actorId = req.user.id;
            const rel = await caregiver_relationships_service_1.caregiverRelationshipsService.suspendRelationship(relationshipId, actorId);
            res.json({ success: true, data: rel });
        }
        catch (err) {
            next(err);
        }
    }
    async restoreCaregiverRelationship(req, res, next) {
        try {
            const { relationshipId } = req.params;
            const actorId = req.user.id;
            const rel = await caregiver_relationships_service_1.caregiverRelationshipsService.restoreRelationship(relationshipId, actorId);
            res.json({ success: true, data: rel });
        }
        catch (err) {
            next(err);
        }
    }
    async submitCaregiverNotice(req, res, next) {
        try {
            const { relationshipId } = req.params;
            const caregiverUserId = req.user.id;
            const { reason, isSafetyException } = req.body;
            const rel = await caregiver_relationships_service_1.caregiverRelationshipsService.submitNotice(relationshipId, caregiverUserId, {
                reason,
                isSafetyException,
            });
            res.json({ success: true, data: rel });
        }
        catch (err) {
            next(err);
        }
    }
    async terminateCaregiverRelationship(req, res, next) {
        try {
            const { relationshipId } = req.params;
            const actorId = req.user.id;
            const { reason, notes } = req.body;
            const rel = await caregiver_relationships_service_1.caregiverRelationshipsService.terminateImmediate(relationshipId, actorId, {
                reason,
                notes,
            });
            res.json({ success: true, data: rel });
        }
        catch (err) {
            next(err);
        }
    }
    async assignCaregiverToPatient(req, res, next) {
        try {
            const { relationshipId } = req.params;
            const actorId = req.user.id;
            const { patientId } = req.body;
            const assignment = await patient_assignments_service_1.patientAssignmentsService.assignCaregiverToPatient(relationshipId, patientId, actorId);
            res.status(201).json({ success: true, data: assignment });
        }
        catch (err) {
            next(err);
        }
    }
    async revokeCaregiverAssignment(req, res, next) {
        try {
            const { relationshipId, patientId } = req.params;
            const actorId = req.user.id;
            const assignment = await patient_assignments_service_1.patientAssignmentsService.revokePatientAssignment(relationshipId, patientId, actorId);
            res.json({ success: true, data: assignment });
        }
        catch (err) {
            next(err);
        }
    }
    // ─── 9. Safe Zones (Circle Owner only CRUD) ───────────────────────────────────
    async createSafeZone(req, res, next) {
        try {
            const { circleId } = req.params;
            const actorId = req.user.id;
            const { authoritativeSafeZonesService } = await Promise.resolve().then(() => __importStar(require('../location/authoritative-safe-zones.service')));
            const zone = await authoritativeSafeZonesService.createSafeZone(circleId, actorId, req.body);
            res.status(201).json({ success: true, data: zone });
        }
        catch (err) {
            next(err);
        }
    }
    async updateSafeZone(req, res, next) {
        try {
            const { circleId, zoneId } = req.params;
            const actorId = req.user.id;
            const { authoritativeSafeZonesService } = await Promise.resolve().then(() => __importStar(require('../location/authoritative-safe-zones.service')));
            const zone = await authoritativeSafeZonesService.updateSafeZone(circleId, zoneId, actorId, req.body);
            res.json({ success: true, data: zone });
        }
        catch (err) {
            next(err);
        }
    }
    async deleteSafeZone(req, res, next) {
        try {
            const { circleId, zoneId } = req.params;
            const actorId = req.user.id;
            const { authoritativeSafeZonesService } = await Promise.resolve().then(() => __importStar(require('../location/authoritative-safe-zones.service')));
            const result = await authoritativeSafeZonesService.deleteSafeZone(circleId, zoneId, actorId);
            res.json({ success: true, data: result });
        }
        catch (err) {
            next(err);
        }
    }
    async listSafeZones(req, res, next) {
        try {
            const { circleId } = req.params;
            const { authoritativeSafeZonesService } = await Promise.resolve().then(() => __importStar(require('../location/authoritative-safe-zones.service')));
            const zones = await authoritativeSafeZonesService.listCircleSafeZones(circleId);
            res.json({ success: true, data: zones });
        }
        catch (err) {
            next(err);
        }
    }
    async attachPatientToSafeZone(req, res, next) {
        try {
            const { circleId, zoneId, patientId } = req.params;
            const actorId = req.user.id;
            const { authoritativeSafeZonesService } = await Promise.resolve().then(() => __importStar(require('../location/authoritative-safe-zones.service')));
            const result = await authoritativeSafeZonesService.attachPatient(circleId, zoneId, patientId, actorId);
            res.status(201).json({ success: true, data: result });
        }
        catch (err) {
            next(err);
        }
    }
    async detachPatientFromSafeZone(req, res, next) {
        try {
            const { circleId, zoneId, patientId } = req.params;
            const actorId = req.user.id;
            const { authoritativeSafeZonesService } = await Promise.resolve().then(() => __importStar(require('../location/authoritative-safe-zones.service')));
            const result = await authoritativeSafeZonesService.detachPatient(circleId, zoneId, patientId, actorId);
            res.json({ success: true, data: result });
        }
        catch (err) {
            next(err);
        }
    }
    // ─── 10. Safety Alerts ────────────────────────────────────────────────────────
    async listAlerts(req, res, next) {
        try {
            const { circleId } = req.params;
            const { authoritativeSafetyService } = await Promise.resolve().then(() => __importStar(require('../alerts/authoritative-safety.service')));
            const alerts = await authoritativeSafetyService.listCircleAlerts(circleId, req.query.status);
            res.json({ success: true, data: alerts });
        }
        catch (err) {
            next(err);
        }
    }
    async respondToAlert(req, res, next) {
        try {
            const { alertId } = req.params;
            const { authoritativeSafetyService } = await Promise.resolve().then(() => __importStar(require('../alerts/authoritative-safety.service')));
            const result = await authoritativeSafetyService.respondToAlert(alertId, req.user, req.body.notes);
            res.json({ success: true, data: result });
        }
        catch (err) {
            next(err);
        }
    }
    async resolveAlert(req, res, next) {
        try {
            const { alertId } = req.params;
            const { authoritativeSafetyService } = await Promise.resolve().then(() => __importStar(require('../alerts/authoritative-safety.service')));
            const result = await authoritativeSafetyService.resolveAlert(alertId, req.user, req.body.notes);
            res.json({ success: true, data: result });
        }
        catch (err) {
            next(err);
        }
    }
    async transferOwnership(req, res, next) {
        try {
            const circleId = req.params.circleId;
            const currentOwnerId = req.user.id;
            const { newOwnerId } = req.body;
            const result = await care_circles_service_1.careCirclesService.transferOwnership(circleId, currentOwnerId, newOwnerId);
            res.json({ success: true, data: result });
        }
        catch (err) {
            next(err);
        }
    }
    async leaveCircle(req, res, next) {
        try {
            const circleId = req.params.circleId;
            const userId = req.user.id;
            const result = await care_circles_service_1.careCirclesService.leaveCircle(circleId, userId);
            res.json({ success: true, data: result });
        }
        catch (err) {
            next(err);
        }
    }
}
exports.CareCirclesController = CareCirclesController;
exports.careCirclesController = new CareCirclesController();
//# sourceMappingURL=care-circles.controller.js.map