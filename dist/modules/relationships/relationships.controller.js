"use strict";
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
exports.caregiverRequest = caregiverRequest;
exports.familyInvite = familyInvite;
exports.acceptInvite = acceptInvite;
exports.myPatients = myPatients;
exports.myCaregivers = myCaregivers;
exports.myFamily = myFamily;
exports.updateStatus = updateStatus;
exports.removeRelationship = removeRelationship;
exports.getConfirmedCaregiver = getConfirmedCaregiver;
exports.confirmCaregiver = confirmCaregiver;
exports.removeCaregiver = removeCaregiver;
exports.getPendingRequests = getPendingRequests;
exports.respondToRequest = respondToRequest;
exports.searchCaregivers = searchCaregivers;
exports.completeMeeting = completeMeeting;
exports.getPatientRelationship = getPatientRelationship;
const response_1 = require("../../shared/utils/response");
const svc = __importStar(require("./relationships.service"));
const zod_1 = require("zod");
const CaregiverRequestSchema = zod_1.z.object({
    caregiver_phone: zod_1.z.string().min(5),
});
const FamilyInviteSchema = zod_1.z.object({
    patient_id: zod_1.z.string().uuid(),
    relationship_type: zod_1.z.enum(['FAMILY_CLOSE', 'FAMILY_EXTENDED', 'GUARDIAN']),
    notes: zod_1.z.string().optional(),
});
const StatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['CONFIRMED', 'SUSPENDED', 'ENDED']),
});
async function caregiverRequest(req, res) {
    const { caregiver_phone } = CaregiverRequestSchema.parse(req.body);
    const rel = await svc.sendCaregiverRequest(req.user.id, caregiver_phone);
    (0, response_1.created)(res, { relationship: rel });
}
async function familyInvite(req, res) {
    const body = FamilyInviteSchema.parse(req.body);
    const result = await svc.createFamilyInvite(req.user.id, body.patient_id, {
        relationship_type: body.relationship_type,
        notes: body.notes,
    });
    (0, response_1.created)(res, result);
}
async function acceptInvite(req, res) {
    const rel = await svc.acceptInvite(req.params.token, req.user.id);
    try {
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        io.to(`patient:${rel.patient_user_id}`).emit('relationship:change', { relationship: rel });
        io.to(`user:${rel.related_user_id}`).emit('relationship:change', { relationship: rel });
    }
    catch (_) { }
    (0, response_1.ok)(res, { relationship: rel });
}
async function myPatients(req, res) {
    const patients = await svc.getMyPatients(req.user.id);
    (0, response_1.ok)(res, { patients });
}
async function myCaregivers(req, res) {
    const caregivers = await svc.getMyCaregivers(req.user.id);
    (0, response_1.ok)(res, { caregivers });
}
async function myFamily(req, res) {
    const family = await svc.getMyFamily(req.user.id, req.user.role);
    (0, response_1.ok)(res, { family });
}
async function updateStatus(req, res) {
    const { status } = StatusSchema.parse(req.body);
    const rel = await svc.updateRelationshipStatus(req.params.id, req.user.id, status);
    (0, response_1.ok)(res, { relationship: rel });
}
async function removeRelationship(req, res) {
    await svc.deleteRelationship(req.params.id, req.user.id);
    (0, response_1.ok)(res, { message: 'Relationship removed' });
}
// ─── Caregiver Integration Controllers ────────────────────────────────────────
const ConfirmCaregiverSchema = zod_1.z.object({
    caregiverId: zod_1.z.string().uuid(),
});
const RespondRequestSchema = zod_1.z.object({
    patientPhone: zod_1.z.string(),
    action: zod_1.z.enum(['confirmed', 'rejected']),
});
async function getConfirmedCaregiver(req, res) {
    const caregiver = await svc.getConfirmedCaregiverForPatient(req.user.id);
    (0, response_1.ok)(res, caregiver);
}
async function confirmCaregiver(req, res) {
    const { caregiverId } = ConfirmCaregiverSchema.parse(req.body);
    const relationship = await svc.confirmCaregiverRelationship(req.user.id, caregiverId);
    try {
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        io.to(`patient:${req.user.id}`).emit('relationship:change', { relationship });
        io.to(`user:${caregiverId}`).emit('relationship:change', { relationship });
    }
    catch (_) { }
    (0, response_1.ok)(res, { relationship });
}
async function removeCaregiver(req, res) {
    const caregiverId = await svc.removeCaregiverRelationship(req.user.id);
    try {
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        io.to(`patient:${req.user.id}`).emit('relationship:change', { action: 'removed', patientId: req.user.id });
        io.to(`user:${caregiverId}`).emit('relationship:change', { action: 'removed', patientId: req.user.id });
    }
    catch (_) { }
    (0, response_1.ok)(res, { message: 'Caregiver relationship removed' });
}
async function getPendingRequests(req, res) {
    const requests = await svc.getPendingRequestsForCaregiver(req.user.id);
    (0, response_1.ok)(res, requests);
}
async function respondToRequest(req, res) {
    const { patientPhone, action } = RespondRequestSchema.parse(req.body);
    const { patientId } = await svc.respondToCaregiverRequest(req.user.id, patientPhone, action);
    try {
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        io.to(`patient:${patientId}`).emit('relationship:change', { action, patientId });
        io.to(`user:${req.user.id}`).emit('relationship:change', { action, patientId });
    }
    catch (_) { }
    (0, response_1.ok)(res, { message: 'Response registered successfully' });
}
async function searchCaregivers(req, res) {
    const query = req.query.query || '';
    const caregivers = await svc.searchCaregivers(req.user.id, query);
    (0, response_1.ok)(res, { caregivers });
}
async function completeMeeting(req, res) {
    const { patientId } = req.params;
    const rel = await svc.completeMeeting(req.user.id, patientId);
    (0, response_1.ok)(res, { relationship: rel });
}
async function getPatientRelationship(req, res) {
    const { patientId } = req.params;
    const rel = await svc.getPatientRelationship(req.user.id, patientId);
    (0, response_1.ok)(res, { relationship: rel });
}
//# sourceMappingURL=relationships.controller.js.map