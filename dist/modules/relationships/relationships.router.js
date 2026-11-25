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
const response_1 = require("../../shared/utils/response");
const AppError_1 = require("../../shared/errors/AppError");
const ctrl = __importStar(require("./relationships.controller"));
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
const deprecatedRelationshipHandler = (_req, _res, next) => {
    next(new AppError_1.AppError('DEPRECATED_ENDPOINT', 'This legacy relationship endpoint is deprecated. Use canonical Care Circle / Care Request workflows.', 410));
};
// ─── Canonical read models ───────────────────────────────────────────────────
router.get('/my-patients', (0, authenticate_1.requireRoles)('CAREGIVER'), (0, response_1.asyncHandler)(ctrl.myPatients));
router.get('/my-caregivers', (0, authenticate_1.requireRoles)('PATIENT', 'FAMILY'), (0, response_1.asyncHandler)(ctrl.myCaregivers));
router.get('/my-family', (0, response_1.asyncHandler)(ctrl.myFamily));
// Caregiver discovery remains the canonical discovery read surface.
router.get('/caregivers/search', (0, response_1.asyncHandler)(ctrl.searchCaregivers));
// ─── Retired relationship, invitation, and resignation surfaces (410 GONE) ──
router.all('/caregiver-request', deprecatedRelationshipHandler);
router.all('/family-invite', deprecatedRelationshipHandler);
router.all('/accept-invite/*', deprecatedRelationshipHandler);
router.all('/caregiver/confirmed', deprecatedRelationshipHandler);
router.all('/caregiver/confirm', deprecatedRelationshipHandler);
router.all('/caregiver', deprecatedRelationshipHandler);
router.all('/caregiver/pending', deprecatedRelationshipHandler);
router.all('/caregiver/respond', deprecatedRelationshipHandler);
router.all('/invite-code/*', deprecatedRelationshipHandler);
router.all('/patient/:patientId/invite-codes', deprecatedRelationshipHandler);
router.all('/family/*', deprecatedRelationshipHandler);
router.all('/patient/:patientId/care-circle', deprecatedRelationshipHandler);
router.all('/patient/:patientId/meet', deprecatedRelationshipHandler);
router.all('/patient/:patientId/relationship', deprecatedRelationshipHandler);
router.all('/:id/status', deprecatedRelationshipHandler);
router.all('/:id/end', deprecatedRelationshipHandler);
router.all('/caregiver/history', deprecatedRelationshipHandler);
router.all('/:id/resignation', deprecatedRelationshipHandler);
router.all('/:id/resignation/*', deprecatedRelationshipHandler);
exports.default = router;
//# sourceMappingURL=relationships.router.js.map