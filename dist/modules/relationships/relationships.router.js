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
const express_1 = require("express");
const authenticate_1 = require("../../shared/middleware/authenticate");
const authenticate_2 = require("../../shared/middleware/authenticate");
const requireRelationship_1 = require("../../shared/middleware/requireRelationship");
const response_1 = require("../../shared/utils/response");
const ctrl = __importStar(require("./relationships.controller"));
const svc = __importStar(require("./relationships.service"));
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// ─── Legacy Caregiver Request & Linkage Endpoints (Retained for Backwards Compatibility) ───
// @deprecated: Replaced by POST /care-requests (canonical Care Request lifecycle)
router.post('/caregiver-request', (0, authenticate_2.requireRoles)('PATIENT'), (0, response_1.asyncHandler)(ctrl.caregiverRequest));
router.post('/family-invite', (0, authenticate_2.requireRoles)('FAMILY'), (0, response_1.asyncHandler)(ctrl.familyInvite));
router.post('/accept-invite/:token', (0, response_1.asyncHandler)(ctrl.acceptInvite));
router.get('/my-patients', (0, authenticate_2.requireRoles)('CAREGIVER'), (0, response_1.asyncHandler)(ctrl.myPatients));
// Retained for active established relationships
router.get('/my-caregivers', (0, authenticate_2.requireRoles)('PATIENT'), (0, response_1.asyncHandler)(ctrl.myCaregivers));
router.get('/my-family', (0, response_1.asyncHandler)(ctrl.myFamily));
// Caregiver search and integration endpoints
// @deprecated: Replaced by GET /discovery/caregivers
router.get('/caregivers/search', (0, response_1.asyncHandler)(ctrl.searchCaregivers));
// @deprecated: Replaced by GET /relationships/my-caregivers
router.get('/caregiver/confirmed', (0, response_1.asyncHandler)(ctrl.getConfirmedCaregiver));
// @deprecated: Replaced by POST /care-requests
router.post('/caregiver/confirm', (0, response_1.asyncHandler)(ctrl.confirmCaregiver));
// @deprecated: Scoped caregiver deletion supported; replaced by relationship state management
router.delete('/caregiver', (0, response_1.asyncHandler)(ctrl.removeCaregiver));
// @deprecated: Replaced by GET /care-requests/incoming
router.get('/caregiver/pending', (0, response_1.asyncHandler)(ctrl.getPendingRequests));
// @deprecated: Replaced by POST /care-requests/:id/accept and POST /care-requests/:id/decline
router.post('/caregiver/respond', (0, response_1.asyncHandler)(ctrl.respondToRequest));
// ─── Care Circle: Invite Code (Caregiver-generated) ───────────────────────────
router.post('/invite-code/generate', (0, authenticate_2.requireRoles)('CAREGIVER'), (0, response_1.asyncHandler)(async (req, res) => {
    const { patient_id, relationship_type } = req.body;
    const result = await svc.generateInviteCode(req.user.id, patient_id, relationship_type);
    (0, response_1.created)(res, { invite: result });
}));
router.get('/patient/:patientId/invite-codes', (0, authenticate_2.requireRoles)('CAREGIVER'), (0, response_1.asyncHandler)(async (req, res) => {
    const { patientId } = req.params;
    const codes = await svc.getInviteCodesForPatient(req.user.id, patientId);
    (0, response_1.ok)(res, { inviteCodes: codes });
}));
router.post('/invite-code/:code/revoke', (0, authenticate_2.requireRoles)('CAREGIVER'), (0, response_1.asyncHandler)(async (req, res) => {
    const { code } = req.params;
    await svc.revokeInviteCode(req.user.id, code);
    (0, response_1.ok)(res, { revoked: true });
}));
// ─── Care Circle: Family Approval ─────────────────────────────────────────────
router.get('/family/pending', (0, authenticate_2.requireRoles)('CAREGIVER'), (0, response_1.asyncHandler)(async (req, res) => {
    const requests = await svc.getPendingFamilyRequests(req.user.id);
    (0, response_1.ok)(res, { requests });
}));
router.post('/family/:id/approve', (0, authenticate_2.requireRoles)('CAREGIVER'), (0, response_1.asyncHandler)(async (req, res) => {
    const result = await svc.respondToFamilyRequest(req.user.id, req.params.id, 'approve');
    try {
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        io.to(`patient:${result.patient_user_id}`).emit('relationship:change', { relationship: result });
        io.to(`user:${result.related_user_id}`).emit('relationship:change', { relationship: result });
    }
    catch (_) { }
    (0, response_1.ok)(res, { relationship: result });
}));
router.post('/family/:id/reject', (0, authenticate_2.requireRoles)('CAREGIVER'), (0, response_1.asyncHandler)(async (req, res) => {
    const result = await svc.respondToFamilyRequest(req.user.id, req.params.id, 'reject');
    try {
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        io.to(`patient:${result.patient_user_id}`).emit('relationship:change', { action: 'rejected', patientId: result.patient_user_id });
        io.to(`user:${result.related_user_id}`).emit('relationship:change', { action: 'rejected', patientId: result.patient_user_id });
    }
    catch (_) { }
    (0, response_1.ok)(res, { rejected: true });
}));
router.delete('/family/:patientId', (0, authenticate_2.requireRoles)('FAMILY'), (0, response_1.asyncHandler)(async (req, res) => {
    const { patientId } = req.params;
    await svc.deleteFamilyRelationshipByPatient(patientId, req.user.id);
    (0, response_1.ok)(res, { message: 'Successfully left the care circle' });
}));
router.get('/patient/:patientId/care-circle', (0, requireRelationship_1.requireRelationship)(), (0, response_1.asyncHandler)(async (req, res) => {
    const { patientId } = req.params;
    const result = await svc.getCareCircle(patientId);
    (0, response_1.ok)(res, { members: result });
}));
router.post('/patient/:patientId/meet', (0, authenticate_2.requireRoles)('CAREGIVER'), (0, response_1.asyncHandler)(ctrl.completeMeeting));
router.get('/patient/:patientId/relationship', (0, authenticate_2.requireRoles)('CAREGIVER'), (0, response_1.asyncHandler)(ctrl.getPatientRelationship));
router.patch('/:id/status', (0, response_1.asyncHandler)(ctrl.updateStatus));
router.delete('/:id', (0, response_1.asyncHandler)(ctrl.removeRelationship));
exports.default = router;
//# sourceMappingURL=relationships.router.js.map