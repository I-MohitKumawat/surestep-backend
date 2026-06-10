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
/**
 * SureStep Backend — modules/routines/routines.router.ts
 * Routes for routine templates, task instances, attachments, and adherence.
 */
const express_1 = require("express");
const authenticate_1 = require("../../shared/middleware/authenticate");
const requireRelationship_1 = require("../../shared/middleware/requireRelationship");
const response_1 = require("../../shared/utils/response");
const ctrl = __importStar(require("./routines.controller"));
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// ─── Routine Template Routes ──────────────────────────────────────────────────
// GET  /routines/patient/:patientId         — list all active routine templates for a patient
// POST /routines/patient/:patientId         — create a new routine template (caregiver only)
router.get('/routines/patient/:patientId', (0, requireRelationship_1.requireRelationship)('patientId', ['CAREGIVER', 'FAMILY_CLOSE', 'GUARDIAN']), (0, response_1.asyncHandler)(ctrl.listRoutineTemplates));
router.post('/routines/patient/:patientId', (0, authenticate_1.requireRoles)('CAREGIVER'), (0, requireRelationship_1.requireRelationship)('patientId', ['CAREGIVER']), (0, response_1.asyncHandler)(ctrl.createRoutineTemplate));
// PATCH  /routines/:id  — update a routine template
// DELETE /routines/:id  — soft-delete (deactivate) a routine template
router.patch('/routines/:id', (0, authenticate_1.requireRoles)('CAREGIVER'), (0, response_1.asyncHandler)(ctrl.updateRoutineTemplate));
router.delete('/routines/:id', (0, authenticate_1.requireRoles)('CAREGIVER'), (0, response_1.asyncHandler)(ctrl.deactivateRoutineTemplate));
// ─── Attachment Routes ────────────────────────────────────────────────────────
// POST   /routines/:id/attachments                          — add an attachment record
// DELETE /routines/:id/attachments/:attachmentId            — remove an attachment
router.post('/routines/:id/attachments', (0, authenticate_1.requireRoles)('CAREGIVER'), (0, response_1.asyncHandler)(ctrl.addAttachment));
router.delete('/routines/:id/attachments/:attachmentId', (0, authenticate_1.requireRoles)('CAREGIVER'), (0, response_1.asyncHandler)(ctrl.removeAttachment));
// ─── Task Instance Routes ─────────────────────────────────────────────────────
// GET  /tasks/patient/:patientId/today      — fetch today's tasks
// GET  /tasks/patient/:patientId            — paginated task history
// POST /tasks/patient/:patientId            — create a standalone task instance
// PATCH  /tasks/:id                         — update task fields
// DELETE /tasks/:id                         — delete a task instance
// POST /tasks/:id/status                    — idempotent status update (done/missed/overdue/unsure/skipped)
// POST /tasks/:id/complete                  — legacy complete endpoint
// POST /tasks/:id/unsure                    — legacy unsure endpoint
// GET  /tasks/patient/:patientId/adherence  — adherence snapshot for a date
router.get('/tasks/patient/:patientId/today', (0, requireRelationship_1.requireRelationship)('patientId', ['CAREGIVER', 'FAMILY_CLOSE', 'GUARDIAN']), (0, response_1.asyncHandler)(ctrl.getTodayTasks));
router.get('/tasks/patient/:patientId/adherence', (0, requireRelationship_1.requireRelationship)('patientId', ['CAREGIVER', 'FAMILY_CLOSE', 'GUARDIAN']), (0, response_1.asyncHandler)(ctrl.getAdherenceSnapshot));
router.get('/tasks/patient/:patientId', (0, requireRelationship_1.requireRelationship)('patientId'), (0, response_1.asyncHandler)(ctrl.getTaskHistory));
router.post('/tasks/patient/:patientId', (0, authenticate_1.requireRoles)('CAREGIVER'), (0, requireRelationship_1.requireRelationship)('patientId', ['CAREGIVER']), (0, response_1.asyncHandler)(ctrl.createTask));
router.patch('/tasks/:id', (0, authenticate_1.requireRoles)('CAREGIVER'), (0, response_1.asyncHandler)(ctrl.updateTask));
router.delete('/tasks/:id', (0, authenticate_1.requireRoles)('CAREGIVER'), (0, response_1.asyncHandler)(ctrl.deleteTask));
// Idempotent status update — used by mobile offline queue
router.post('/tasks/:id/status', (0, response_1.asyncHandler)(ctrl.updateTaskStatus));
// Legacy endpoints — kept for backward compat
router.post('/tasks/:id/complete', (0, authenticate_1.requireRoles)('PATIENT'), (0, response_1.asyncHandler)(ctrl.completeTask));
router.post('/tasks/:id/unsure', (0, authenticate_1.requireRoles)('PATIENT'), (0, response_1.asyncHandler)(ctrl.unsureTask));
// Legacy template routes (caregiver-scoped, pre-redesign)
router.get('/routines/templates', (0, authenticate_1.requireRoles)('CAREGIVER'), (0, response_1.asyncHandler)(ctrl.getTemplates));
exports.default = router;
//# sourceMappingURL=routines.router.js.map