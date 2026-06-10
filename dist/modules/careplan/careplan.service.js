"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCarePlanByPatientId = getCarePlanByPatientId;
const config_1 = __importDefault(require("../../db/config"));
async function getCarePlanByPatientId(patientId) {
    const result = await config_1.default.query(`SELECT cp.*, ca.version as assessment_version, ca.updated_at as assessment_completed_at
     FROM care_plans cp
     JOIN care_assessments ca ON ca.id = cp.assessment_id
     WHERE cp.patient_id = $1`, [patientId]);
    return result.rows[0] ?? null;
}
//# sourceMappingURL=careplan.service.js.map