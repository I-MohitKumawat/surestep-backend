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
exports.createDefinition = createDefinition;
exports.updateDefinition = updateDefinition;
exports.getDefinitions = getDefinitions;
exports.getDefinitionById = getDefinitionById;
exports.deleteDefinition = deleteDefinition;
exports.listOccurrences = listOccurrences;
exports.signOffOccurrence = signOffOccurrence;
exports.listRoutineTemplates = listRoutineTemplates;
exports.createRoutineTemplate = createRoutineTemplate;
exports.updateRoutineTemplate = updateRoutineTemplate;
exports.deactivateRoutineTemplate = deactivateRoutineTemplate;
exports.addAttachment = addAttachment;
exports.removeAttachment = removeAttachment;
exports.getTodayTasks = getTodayTasks;
exports.getTaskHistory = getTaskHistory;
exports.createTask = createTask;
exports.updateTask = updateTask;
exports.deleteTask = deleteTask;
exports.updateTaskStatus = updateTaskStatus;
exports.completeTask = completeTask;
exports.unsureTask = unsureTask;
exports.getAdherenceSnapshot = getAdherenceSnapshot;
exports.getTemplates = getTemplates;
const response_1 = require("../../shared/utils/response");
const svc = __importStar(require("./routines.service"));
const authoritative_routines_service_1 = require("./authoritative-routines.service");
const AppError_1 = require("../../shared/errors/AppError");
const config_1 = __importDefault(require("../../db/config"));
// ─── Authoritative Routine Handlers ──────────────────────────────────────────
async function createDefinition(req, res) {
    const definition = await authoritative_routines_service_1.authoritativeRoutinesService.createDefinition(req.params.patientId, req.user.id, req.body);
    (0, response_1.created)(res, { routine: definition });
}
async function updateDefinition(req, res) {
    const definition = await authoritative_routines_service_1.authoritativeRoutinesService.updateDefinition(req.params.patientId, req.params.routineId, req.body);
    (0, response_1.ok)(res, { routine: definition });
}
async function getDefinitions(req, res) {
    const routines = await authoritative_routines_service_1.authoritativeRoutinesService.getDefinitions(req.params.patientId);
    (0, response_1.ok)(res, { routines });
}
async function getDefinitionById(req, res) {
    const routine = await authoritative_routines_service_1.authoritativeRoutinesService.getDefinitionById(req.params.patientId, req.params.routineId);
    (0, response_1.ok)(res, { routine });
}
async function deleteDefinition(req, res) {
    const routine = await authoritative_routines_service_1.authoritativeRoutinesService.deleteDefinition(req.params.patientId, req.params.routineId);
    (0, response_1.ok)(res, { message: 'Routine definition deactivated', routine });
}
async function listOccurrences(req, res) {
    const occurrences = await authoritative_routines_service_1.authoritativeRoutinesService.listOccurrences(req.params.patientId, req.query.date);
    (0, response_1.ok)(res, { occurrences });
}
async function signOffOccurrence(req, res) {
    let { patientId, routineId, occurrenceId } = req.params;
    // Unscoped route fallback: lookup occurrence to get patientId and routineId
    if (!patientId || !routineId) {
        occurrenceId = occurrenceId || req.params.id;
        const occCheck = await config_1.default.query(`SELECT routine_id, patient_id FROM routine_occurrences WHERE id = $1`, [occurrenceId]);
        if (!occCheck.rows[0]) {
            throw new AppError_1.AppError('NOT_FOUND', 'Routine occurrence not found', 404);
        }
        patientId = occCheck.rows[0].patient_id;
        routineId = occCheck.rows[0].routine_id;
    }
    const result = await authoritative_routines_service_1.authoritativeRoutinesService.signOffOccurrence(patientId, routineId, occurrenceId, req.user, req.body.notes);
    (0, response_1.ok)(res, result);
}
// ─── Routine Template Handlers (Legacy) ───────────────────────────────────────
async function listRoutineTemplates(req, res) {
    const templates = await svc.getRoutineTemplates(req.params.patientId);
    (0, response_1.ok)(res, { templates });
}
async function createRoutineTemplate(req, res) {
    const template = await svc.createRoutineTemplate(req.user.id, req.params.patientId, req.body);
    (0, response_1.created)(res, { template });
}
async function updateRoutineTemplate(req, res) {
    const template = await svc.updateRoutineTemplate(req.params.id, req.body);
    (0, response_1.ok)(res, { template });
}
async function deactivateRoutineTemplate(req, res) {
    await svc.deactivateRoutineTemplate(req.params.id);
    (0, response_1.ok)(res, { message: 'Routine deactivated' });
}
// ─── Attachment Handlers ──────────────────────────────────────────────────────
async function addAttachment(req, res) {
    const attachment = await svc.addAttachment(req.params.id, req.body);
    (0, response_1.created)(res, { attachment });
}
async function removeAttachment(req, res) {
    await svc.removeAttachment(req.params.id, req.params.attachmentId);
    (0, response_1.ok)(res, { message: 'Attachment removed' });
}
// ─── Task Instance Handlers ───────────────────────────────────────────────────
async function getTodayTasks(req, res) {
    const tasks = await svc.getTodayTasks(req.params.patientId);
    (0, response_1.ok)(res, { tasks });
}
async function getTaskHistory(req, res) {
    const { from = '', to = '', limit = '50', cursor } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const result = await svc.getTaskHistory(req.params.patientId, from || '2020-01-01', to || today, parseInt(limit), cursor);
    (0, response_1.ok)(res, result);
}
async function createTask(req, res) {
    const task = await svc.createTask(req.user.id, req.params.patientId, req.body);
    (0, response_1.created)(res, { task });
}
async function updateTask(req, res) {
    const task = await svc.updateTask(req.params.id, req.user.id, req.body);
    (0, response_1.ok)(res, { task });
}
async function deleteTask(req, res) {
    await svc.deleteTask(req.params.id, req.user.id);
    (0, response_1.ok)(res, { message: 'Task deleted' });
}
async function updateTaskStatus(req, res) {
    const { status, client_action_id } = req.body;
    if (!status) {
        res.status(422).json({ error: 'VALIDATION_ERROR', message: 'status is required' });
        return;
    }
    const task = await svc.updateTaskStatus(req.params.id, req.user.id, status, client_action_id);
    (0, response_1.ok)(res, { task });
}
async function completeTask(req, res) {
    const task = await svc.markTaskComplete(req.params.id, req.user.id);
    (0, response_1.ok)(res, { task });
}
async function unsureTask(req, res) {
    const task = await svc.markTaskUnsure(req.params.id, req.user.id);
    (0, response_1.ok)(res, { task });
}
// ─── Adherence Handler ────────────────────────────────────────────────────────
async function getAdherenceSnapshot(req, res) {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const snapshot = await svc.getAdherenceSnapshot(req.params.patientId, date);
    (0, response_1.ok)(res, { snapshot });
}
// ─── Legacy template handler ──────────────────────────────────────────────────
async function getTemplates(req, res) {
    const templates = await svc.getTemplates(req.user.id);
    (0, response_1.ok)(res, { templates });
}
//# sourceMappingURL=routines.controller.js.map