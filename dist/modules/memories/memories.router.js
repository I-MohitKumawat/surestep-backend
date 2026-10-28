"use strict";
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
const ctrl = __importStar(require("./memories.controller"));
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// ─── Memories ────────────────────────────────────────────────────────────────
router.post('/patients/:patientId/memories', (0, careCircleGuards_1.requirePatientMemoryManagementAuthority)('patientId'), (0, response_1.asyncHandler)(ctrl.createMemory));
router.get('/patients/:patientId/memories', (0, careCircleGuards_1.requireActivePatientAssignment)('patientId'), (0, response_1.asyncHandler)(ctrl.listMemories));
router.get('/patients/:patientId/memories/:memoryId', (0, careCircleGuards_1.requireActivePatientAssignment)('patientId'), (0, response_1.asyncHandler)(ctrl.getMemoryById));
router.patch('/patients/:patientId/memories/:memoryId', (0, careCircleGuards_1.requirePatientMemoryManagementAuthority)('patientId'), (0, response_1.asyncHandler)(ctrl.updateMemory));
router.delete('/patients/:patientId/memories/:memoryId', (0, response_1.asyncHandler)(ctrl.deleteMemory));
// ─── Activities (Voluntary Engagement / Observational Only) ───────────────────
router.post('/patients/:patientId/activities', (0, careCircleGuards_1.requireActivePatientAssignment)('patientId'), (0, response_1.asyncHandler)(ctrl.recordActivity));
router.get('/patients/:patientId/activities', (0, careCircleGuards_1.requireActivePatientAssignment)('patientId'), (0, response_1.asyncHandler)(ctrl.listActivities));
exports.default = router;
//# sourceMappingURL=memories.router.js.map