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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
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
const careCircleGuards_1 = require("../../shared/middleware/careCircleGuards");
const AppError_1 = require("../../shared/errors/AppError");
const config_1 = __importDefault(require("../../db/config"));
// ─── Authoritative Patient Care & Routine Routes (TARGET_ARCHITECTURE.md §8.1) ─
// POST   /patients/:patientId/routines — create routine definition (care-plan admin only)
router.post('/patients/:patientId/routines', (0, careCircleGuards_1.requireRoutineDefinitionCRUDAuthority)('patientId'), (0, response_1.asyncHandler)(ctrl.createDefinition));
// GET    /patients/:patientId/routines — list routine definitions
router.get('/patients/:patientId/routines', (0, careCircleGuards_1.requireActivePatientAssignment)('patientId'), (0, response_1.asyncHandler)(ctrl.getDefinitions));
// GET    /patients/:patientId/routines/:routineId — get single routine definition
router.get('/patients/:patientId/routines/:routineId', (0, careCircleGuards_1.requireActivePatientAssignment)('patientId'), (0, response_1.asyncHandler)(ctrl.getDefinitionById));
// PATCH  /patients/:patientId/routines/:routineId — update routine definition (care-plan admin only)
router.patch('/patients/:patientId/routines/:routineId', (0, careCircleGuards_1.requireRoutineDefinitionCRUDAuthority)('patientId'), (0, response_1.asyncHandler)(ctrl.updateDefinition));
// DELETE /patients/:patientId/routines/:routineId — deactivate routine definition (care-plan admin only)
router.delete('/patients/:patientId/routines/:routineId', (0, careCircleGuards_1.requireRoutineDefinitionCRUDAuthority)('patientId'), (0, response_1.asyncHandler)(ctrl.deleteDefinition));
// GET    /patients/:patientId/routines/occurrences — list occurrences for agenda
router.get('/patients/:patientId/routines/occurrences', (0, careCircleGuards_1.requireActivePatientAssignment)('patientId'), (0, response_1.asyncHandler)(ctrl.listOccurrences));
// POST   /patients/:patientId/routines/:routineId/occurrences/:occurrenceId/sign-off
router.post('/patients/:patientId/routines/:routineId/occurrences/:occurrenceId/sign-off', (0, careCircleGuards_1.requireRoutineSignOffAuthority)('patientId'), (0, response_1.asyncHandler)(ctrl.signOffOccurrence));
// POST   /routines/occurrences/:occurrenceId/sign-off (direct occurrence route — resource-aware guarded)
router.post('/routines/occurrences/:occurrenceId/sign-off', (0, careCircleGuards_1.requireOccurrenceSignOffAuthority)('occurrenceId'), (0, response_1.asyncHandler)(ctrl.signOffOccurrence));
// ─── Routine Template Routes (Legacy Adapted) ─────────────────────────────────
// GET  /routines/patient/:patientId         — list all active routine templates for a patient
// POST /routines/patient/:patientId         — create a new routine template (care-plan admin only)
router.get('/routines/patient/:patientId', (0, careCircleGuards_1.requireActivePatientAssignment)('patientId'), (0, response_1.asyncHandler)(ctrl.listRoutineTemplates));
router.post('/routines/patient/:patientId', (0, careCircleGuards_1.requireRoutineDefinitionCRUDAuthority)('patientId'), (0, response_1.asyncHandler)(ctrl.createRoutineTemplate));
// PATCH  /routines/:id  — update a routine template (Caregivers & Assisted Patients forbidden)
// DELETE /routines/:id  — soft-delete (deactivate) a routine template (Caregivers & Assisted Patients forbidden)
router.patch('/routines/:id', async (req, _res, next) => {
    if (req.user?.role === 'CAREGIVER') {
        return next(new AppError_1.AppError('CAREGIVER_ROUTINE_CRUD_FORBIDDEN', 'Professional Caregivers cannot edit routine configurations in V1', 403));
    }
    if (req.user?.role === 'PATIENT') {
        const profileRes = await config_1.default.query(`SELECT onboarding_source FROM patient_profiles WHERE user_id = $1`, [req.user.id]);
        if (profileRes.rows[0]?.onboarding_source === 'FAMILY') {
            return next(new AppError_1.AppError('ASSISTED_PATIENT_ROUTINE_CRUD_FORBIDDEN', 'Assisted patients cannot manage routine configurations. Routines must be administered by family care circle members.', 403));
        }
    }
    next();
}, (0, response_1.asyncHandler)(ctrl.updateRoutineTemplate));
router.delete('/routines/:id', async (req, _res, next) => {
    if (req.user?.role === 'CAREGIVER') {
        return next(new AppError_1.AppError('CAREGIVER_ROUTINE_CRUD_FORBIDDEN', 'Professional Caregivers cannot delete routine configurations in V1', 403));
    }
    if (req.user?.role === 'PATIENT') {
        const profileRes = await config_1.default.query(`SELECT onboarding_source FROM patient_profiles WHERE user_id = $1`, [req.user.id]);
        if (profileRes.rows[0]?.onboarding_source === 'FAMILY') {
            return next(new AppError_1.AppError('ASSISTED_PATIENT_ROUTINE_CRUD_FORBIDDEN', 'Assisted patients cannot manage routine configurations. Routines must be administered by family care circle members.', 403));
        }
    }
    next();
}, (0, response_1.asyncHandler)(ctrl.deactivateRoutineTemplate));
// ─── Attachment Routes ────────────────────────────────────────────────────────
// POST   /routines/:id/attachments                          — add an attachment record
// DELETE /routines/:id/attachments/:attachmentId            — remove an attachment
router.post('/routines/:id/attachments', (0, authenticate_1.requireRoles)('FAMILY', 'PATIENT'), async (req, _res, next) => {
    if (req.user?.role === 'PATIENT') {
        const profileRes = await config_1.default.query(`SELECT onboarding_source FROM patient_profiles WHERE user_id = $1`, [req.user.id]);
        if (profileRes.rows[0]?.onboarding_source === 'FAMILY') {
            return next(new AppError_1.AppError('ASSISTED_PATIENT_ROUTINE_CRUD_FORBIDDEN', 'Assisted patients cannot manage routine attachments in V1', 403));
        }
    }
    next();
}, (0, response_1.asyncHandler)(ctrl.addAttachment));
router.delete('/routines/:id/attachments/:attachmentId', (0, authenticate_1.requireRoles)('FAMILY', 'PATIENT'), async (req, _res, next) => {
    if (req.user?.role === 'PATIENT') {
        const profileRes = await config_1.default.query(`SELECT onboarding_source FROM patient_profiles WHERE user_id = $1`, [req.user.id]);
        if (profileRes.rows[0]?.onboarding_source === 'FAMILY') {
            return next(new AppError_1.AppError('ASSISTED_PATIENT_ROUTINE_CRUD_FORBIDDEN', 'Assisted patients cannot delete routine attachments in V1', 403));
        }
    }
    next();
}, (0, response_1.asyncHandler)(ctrl.removeAttachment));
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
const deprecatedTaskMutationHandler = (_req, _res, next) => {
    next(new AppError_1.AppError('DEPRECATED_ENDPOINT', 'This legacy task endpoint is deprecated. Professional Caregivers are forbidden from routine CRUD in V1, and routine progress is tracked via occurrence sign-off.', 410));
};
router.post('/tasks/patient/:patientId', deprecatedTaskMutationHandler);
router.patch('/tasks/:id', deprecatedTaskMutationHandler);
router.delete('/tasks/:id', deprecatedTaskMutationHandler);
// Idempotent status update — decommissioned (non-canonical states like skipped/missed forbidden in V1)
router.post('/tasks/:id/status', deprecatedTaskMutationHandler);
// Legacy endpoints — decommissioned
router.post('/tasks/:id/complete', deprecatedTaskMutationHandler);
router.post('/tasks/:id/unsure', deprecatedTaskMutationHandler);
// Legacy template routes — decommissioned
router.get('/routines/templates', deprecatedTaskMutationHandler);
exports.default = router;
//# sourceMappingURL=routines.router.js.map