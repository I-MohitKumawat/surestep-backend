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
// ─── Routine Template Handlers ────────────────────────────────────────────────
async function listRoutineTemplates(req, res) {
    const templates = await svc.getRoutineTemplates(req.params.patientId);
    (0, response_1.ok)(res, { templates });
}
async function createRoutineTemplate(req, res) {
    const template = await svc.createRoutineTemplate(req.user.id, req.params.patientId, req.body);
    (0, response_1.created)(res, { template });
}
async function updateRoutineTemplate(req, res) {
    const template = await svc.updateRoutineTemplate(req.params.id, req.user.id, req.body);
    (0, response_1.ok)(res, { template });
}
async function deactivateRoutineTemplate(req, res) {
    await svc.deactivateRoutineTemplate(req.params.id, req.user.id);
    (0, response_1.ok)(res, { message: 'Routine deactivated' });
}
// ─── Attachment Handlers ──────────────────────────────────────────────────────
async function addAttachment(req, res) {
    const attachment = await svc.addAttachment(req.params.id, req.user.id, req.body);
    (0, response_1.created)(res, { attachment });
}
async function removeAttachment(req, res) {
    await svc.removeAttachment(req.params.id, req.params.attachmentId, req.user.id);
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