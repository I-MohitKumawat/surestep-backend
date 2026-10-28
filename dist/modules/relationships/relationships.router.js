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
const AppError_1 = require("../../shared/errors/AppError");
const ctrl = __importStar(require("./relationships.controller"));
const svc = __importStar(require("./relationships.service"));
const careRelCtrl = __importStar(require("../care-relationships/care-relationships.controller"));
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
const deprecatedRelationshipHandler = (_req, _res, next) => {
    next(new AppError_1.AppError('DEPRECATED_ENDPOINT', 'This legacy relationship endpoint is deprecated. Use canonical Care Circle / Care Request workflows.', 410));
};
// ─── Legacy Caregiver Request & Linkage Endpoints (Decommissioned) ────────────
router.post('/caregiver-request', deprecatedRelationshipHandler);
router.post('/family-invite', deprecatedRelationshipHandler);
router.post('/accept-invite/:token', deprecatedRelationshipHandler);
router.get('/my-patients', (0, authenticate_2.requireRoles)('CAREGIVER'), (0, response_1.asyncHandler)(ctrl.myPatients));
// Retained for active established relationships (accessible to patient or authorized family)
router.get('/my-caregivers', (0, authenticate_2.requireRoles)('PATIENT', 'FAMILY'), (0, response_1.asyncHandler)(ctrl.myCaregivers));
router.get('/my-family', (0, response_1.asyncHandler)(ctrl.myFamily));
// Caregiver search and integration endpoints
router.get('/caregivers/search', (0, response_1.asyncHandler)(ctrl.searchCaregivers));
router.get('/caregiver/confirmed', (0, response_1.asyncHandler)(ctrl.getConfirmedCaregiver));
router.post('/caregiver/confirm', deprecatedRelationshipHandler);
router.delete('/caregiver', deprecatedRelationshipHandler);
router.get('/caregiver/pending', deprecatedRelationshipHandler);
router.post('/caregiver/respond', deprecatedRelationshipHandler);
// ─── Care Circle: Invite Code (Decommissioned in favor of circle_invitations) ──
router.post('/invite-code/generate', deprecatedRelationshipHandler);
router.get('/patient/:patientId/invite-codes', deprecatedRelationshipHandler);
router.post('/invite-code/:code/revoke', deprecatedRelationshipHandler);
// ─── Care Circle: Family Approval (Decommissioned) ─────────────────────────────
router.get('/family/pending', deprecatedRelationshipHandler);
router.post('/family/:id/approve', deprecatedRelationshipHandler);
router.post('/family/:id/reject', deprecatedRelationshipHandler);
router.delete('/family/:patientId', deprecatedRelationshipHandler);
router.get('/patient/:patientId/care-circle', (0, requireRelationship_1.requireRelationship)(), (0, response_1.asyncHandler)(async (req, res) => {
    const { patientId } = req.params;
    const result = await svc.getCareCircle(patientId);
    (0, response_1.ok)(res, { members: result });
}));
router.post('/patient/:patientId/meet', deprecatedRelationshipHandler);
router.get('/patient/:patientId/relationship', deprecatedRelationshipHandler);
router.patch('/:id/status', deprecatedRelationshipHandler);
router.delete('/:id', deprecatedRelationshipHandler);
// Canonical Phase 3A: End Care Relationship aliases
router.post('/:id/end', (0, response_1.asyncHandler)(careRelCtrl.endCareRelationship));
router.get('/caregiver/history', (0, response_1.asyncHandler)(careRelCtrl.getCareRelationshipHistory));
// Canonical Phase 3B: Caregiver Resignation aliases
router.post('/:id/resignation', (0, response_1.asyncHandler)(careRelCtrl.createResignation));
router.get('/:id/resignation', (0, response_1.asyncHandler)(careRelCtrl.getResignation));
router.post('/:id/resignation/accept', (0, response_1.asyncHandler)(careRelCtrl.acceptResignation));
router.post('/:id/resignation/decline', (0, response_1.asyncHandler)(careRelCtrl.declineResignation));
router.post('/:id/resignation/withdraw', (0, response_1.asyncHandler)(careRelCtrl.withdrawResignation));
exports.default = router;
//# sourceMappingURL=relationships.router.js.map