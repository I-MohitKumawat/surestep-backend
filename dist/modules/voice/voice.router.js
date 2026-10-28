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
const careCircleGuards_1 = require("../../shared/middleware/careCircleGuards");
const response_1 = require("../../shared/utils/response");
const AppError_1 = require("../../shared/errors/AppError");
const ctrl = __importStar(require("./voice.controller"));
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// Voice samples — resource-aware guarded with Care Circle patient assignment
router.post('/samples/patient/:patientId', (0, authenticate_1.requireRoles)('FAMILY'), (0, careCircleGuards_1.requireActivePatientAssignment)('patientId'), (0, response_1.asyncHandler)(ctrl.uploadSample));
router.get('/samples/patient/:patientId', (0, careCircleGuards_1.requireActivePatientAssignment)('patientId'), (0, response_1.asyncHandler)(ctrl.listSamples));
router.delete('/samples/:id', (0, authenticate_1.requireRoles)('FAMILY'), (0, response_1.asyncHandler)(ctrl.removeSample));
// Voice messages — resource-aware guarded with Care Circle patient assignment
router.post('/messages/manual/patient/:patientId', (0, authenticate_1.requireRoles)('FAMILY'), (0, careCircleGuards_1.requireActivePatientAssignment)('patientId'), (0, response_1.asyncHandler)(ctrl.sendManualMessage));
router.get('/messages/patient/:patientId', (0, careCircleGuards_1.requireActivePatientAssignment)('patientId'), (0, response_1.asyncHandler)(ctrl.listMessages));
// ─── Legacy Familiarity Faces, Stories, and Memories (Decommissioned) ─────────
const deprecatedReminiscenceHandler = (_req, _res, next) => {
    next(new AppError_1.AppError('DEPRECATED_ENDPOINT', 'Legacy voice reminiscence endpoints are deprecated. Use canonical /api/v1/patients/:patientId/memories endpoints.', 410));
};
router.post('/faces/patient/:patientId', deprecatedReminiscenceHandler);
router.get('/faces/patient/:patientId', deprecatedReminiscenceHandler);
router.post('/stories/patient/:patientId', deprecatedReminiscenceHandler);
router.get('/stories/patient/:patientId', deprecatedReminiscenceHandler);
router.post('/stories/:id/react', deprecatedReminiscenceHandler);
router.post('/memories/patient/:patientId', deprecatedReminiscenceHandler);
router.get('/memories/patient/:patientId/daily', deprecatedReminiscenceHandler);
exports.default = router;
//# sourceMappingURL=voice.router.js.map