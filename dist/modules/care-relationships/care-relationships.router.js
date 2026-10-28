"use strict";
/**
 * SureStep — modules/care-relationships/care-relationships.router.ts
 *
 * Router for canonical Care Relationship operations (Phase 3A).
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
const express_1 = require("express");
const authenticate_1 = require("../../shared/middleware/authenticate");
const response_1 = require("../../shared/utils/response");
const ctrl = __importStar(require("./care-relationships.controller"));
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// POST /api/v1/care-relationships/:relationshipId/end
router.post('/:relationshipId/end', (0, response_1.asyncHandler)(ctrl.endCareRelationship));
// GET /api/v1/care-relationships/history
router.get('/history', (0, response_1.asyncHandler)(ctrl.getCareRelationshipHistory));
// ─── Authoritative Caregiver Relationship Endpoints ─────────────────────────
// POST /api/v1/care-relationships/:relationshipId/notice (Caregiver submits departure notice)
router.post('/:relationshipId/notice', (0, response_1.asyncHandler)(ctrl.submitNotice));
// POST /api/v1/care-relationships/:relationshipId/terminate (Circle terminates relationship)
router.post('/:relationshipId/terminate', (0, response_1.asyncHandler)(ctrl.terminateRelationship));
// POST /api/v1/care-relationships/:relationshipId/assignments (Assign patient)
router.post('/:relationshipId/assignments', (0, response_1.asyncHandler)(ctrl.assignPatient));
// DELETE /api/v1/care-relationships/:relationshipId/assignments/:patientId (Unassign patient)
router.delete('/:relationshipId/assignments/:patientId', (0, response_1.asyncHandler)(ctrl.unassignPatient));
// GET /api/v1/care-relationships/:relationshipId (Fetch relationship details)
router.get('/:relationshipId', (0, response_1.asyncHandler)(ctrl.getRelationshipById));
// ─── Phase 3B: Caregiver Resignation Workflow (Deprecated -> 410 GONE) ────────
// GET /api/v1/care-relationships/resignations/pending (must precede :relationshipId)
router.get('/resignations/pending', (0, response_1.asyncHandler)(ctrl.getPendingResignations));
// POST /api/v1/care-relationships/:relationshipId/resignation (Caregiver submits)
router.post('/:relationshipId/resignation', (0, response_1.asyncHandler)(ctrl.createResignation));
// GET /api/v1/care-relationships/:relationshipId/resignation (View latest request)
router.get('/:relationshipId/resignation', (0, response_1.asyncHandler)(ctrl.getResignation));
// POST /api/v1/care-relationships/:relationshipId/resignation/accept (Patient/family accepts)
router.post('/:relationshipId/resignation/accept', (0, response_1.asyncHandler)(ctrl.acceptResignation));
// POST /api/v1/care-relationships/:relationshipId/resignation/decline (Patient/family declines)
router.post('/:relationshipId/resignation/decline', (0, response_1.asyncHandler)(ctrl.declineResignation));
// POST /api/v1/care-relationships/:relationshipId/resignation/withdraw (Caregiver withdraws)
router.post('/:relationshipId/resignation/withdraw', (0, response_1.asyncHandler)(ctrl.withdrawResignation));
exports.default = router;
//# sourceMappingURL=care-relationships.router.js.map