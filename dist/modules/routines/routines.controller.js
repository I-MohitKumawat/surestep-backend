"use strict";
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
const response_1 = require("../../shared/utils/response");
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
//# sourceMappingURL=routines.controller.js.map