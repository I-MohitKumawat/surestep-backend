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
 *
 * Canonical routine surface only:
 *   - Routine definitions scoped to a Patient.
 *   - Materialized routine occurrences.
 *   - Occurrence sign-off.
 *
 * Legacy routine-template, task-instance, attachment, and adherence endpoints
 * are retired and fail closed with 410 Gone.
 */
const express_1 = require("express");
const authenticate_1 = require("../../shared/middleware/authenticate");
const response_1 = require("../../shared/utils/response");
const ctrl = __importStar(require("./routines.controller"));
const careCircleGuards_1 = require("../../shared/middleware/careCircleGuards");
const AppError_1 = require("../../shared/errors/AppError");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
const deprecatedRoutineHandler = (_req, _res, next) => {
    next(new AppError_1.AppError('ENDPOINT_DEPRECATED', 'This legacy routine/task endpoint is retired. Use /patients/:patientId/routines and /patients/:patientId/routines/occurrences; sign off with /routines/occurrences/:occurrenceId/sign-off.', 410));
};
// ─── Authoritative Patient Care & Routine Routes (TARGET_ARCHITECTURE.md §8.1) ─
// POST   /patients/:patientId/routines — create routine definition (care-plan admin only)
router.post('/patients/:patientId/routines', (0, careCircleGuards_1.requireRoutineDefinitionCRUDAuthority)('patientId'), (0, response_1.asyncHandler)(ctrl.createDefinition));
// GET    /patients/:patientId/routines — list routine definitions
router.get('/patients/:patientId/routines', (0, careCircleGuards_1.requireActivePatientAssignment)('patientId'), (0, response_1.asyncHandler)(ctrl.getDefinitions));
// GET    /patients/:patientId/routines/occurrences — list occurrences for agenda
// Must be declared before /:routineId so the literal "occurrences" segment is
// not captured as a routine definition id.
router.get('/patients/:patientId/routines/occurrences', (0, careCircleGuards_1.requireActivePatientAssignment)('patientId'), (0, response_1.asyncHandler)(ctrl.listOccurrences));
// GET    /patients/:patientId/routines/:routineId — get single routine definition
router.get('/patients/:patientId/routines/:routineId', (0, careCircleGuards_1.requireActivePatientAssignment)('patientId'), (0, response_1.asyncHandler)(ctrl.getDefinitionById));
// PATCH  /patients/:patientId/routines/:routineId — update routine definition (care-plan admin only)
router.patch('/patients/:patientId/routines/:routineId', (0, careCircleGuards_1.requireRoutineDefinitionCRUDAuthority)('patientId'), (0, response_1.asyncHandler)(ctrl.updateDefinition));
// DELETE /patients/:patientId/routines/:routineId — deactivate routine definition (care-plan admin only)
router.delete('/patients/:patientId/routines/:routineId', (0, careCircleGuards_1.requireRoutineDefinitionCRUDAuthority)('patientId'), (0, response_1.asyncHandler)(ctrl.deleteDefinition));
// POST   /patients/:patientId/routines/:routineId/occurrences/:occurrenceId/sign-off
router.post('/patients/:patientId/routines/:routineId/occurrences/:occurrenceId/sign-off', (0, careCircleGuards_1.requireRoutineSignOffAuthority)('patientId'), (0, response_1.asyncHandler)(ctrl.signOffOccurrence));
// POST   /routines/occurrences/:occurrenceId/sign-off (direct occurrence route — resource-aware guarded)
router.post('/routines/occurrences/:occurrenceId/sign-off', (0, careCircleGuards_1.requireOccurrenceSignOffAuthority)('occurrenceId'), (0, response_1.asyncHandler)(ctrl.signOffOccurrence));
// ─── Retired routine/task surfaces (410 GONE) ────────────────────────────────
router.all('/routines/patient/:patientId', deprecatedRoutineHandler);
router.all('/routines/templates', deprecatedRoutineHandler);
router.all('/routines/:id', deprecatedRoutineHandler);
router.all('/routines/:id/attachments', deprecatedRoutineHandler);
router.all('/routines/:id/attachments/:attachmentId', deprecatedRoutineHandler);
router.all('/tasks/patient/:patientId', deprecatedRoutineHandler);
router.all('/tasks/patient/:patientId/today', deprecatedRoutineHandler);
router.all('/tasks/patient/:patientId/adherence', deprecatedRoutineHandler);
router.all('/tasks/:id', deprecatedRoutineHandler);
router.all('/tasks/:id/status', deprecatedRoutineHandler);
router.all('/tasks/:id/complete', deprecatedRoutineHandler);
router.all('/tasks/:id/unsure', deprecatedRoutineHandler);
exports.default = router;
//# sourceMappingURL=routines.router.js.map