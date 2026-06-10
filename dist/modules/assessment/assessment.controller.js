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
exports.getLatest = getLatest;
exports.getHistory = getHistory;
exports.getById = getById;
exports.save = save;
const response_1 = require("../../shared/utils/response");
const svc = __importStar(require("./assessment.service"));
const zod_1 = require("zod");
const AssessmentSaveSchema = zod_1.z.object({
    status: zod_1.z.enum(['DRAFT', 'COMPLETED']),
    patient_basics: zod_1.z.object({
        preferred_name: zod_1.z.string(),
        address: zod_1.z.string(),
        living_arrangement: zod_1.z.string(),
        primary_language: zod_1.z.string(),
    }).default({ preferred_name: '', address: '', living_arrangement: '', primary_language: '' }),
    emergency_contacts: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string(),
        relationship: zod_1.z.string(),
        phone: zod_1.z.string(),
        priority: zod_1.z.number(),
    })).default([]),
    cognitive: zod_1.z.object({
        memory_concerns: zod_1.z.string(),
        orientation_concerns: zod_1.z.string(),
        wandering_risk: zod_1.z.string(),
        confusion_frequency: zod_1.z.string(),
    }).default({ memory_concerns: '', orientation_concerns: '', wandering_risk: '', confusion_frequency: '' }),
    risk: zod_1.z.object({
        fall_risk: zod_1.z.enum(['Low', 'Medium', 'High']),
        wandering_risk: zod_1.z.enum(['Low', 'Medium', 'High']),
        medication_adherence_risk: zod_1.z.enum(['Low', 'Medium', 'High']),
        emergency_risk: zod_1.z.enum(['Low', 'Medium', 'High']),
    }).default({ fall_risk: 'Low', wandering_risk: 'Low', medication_adherence_risk: 'Low', emergency_risk: 'Low' }),
    mobility: zod_1.z.string(),
    support_needs: zod_1.z.object({
        medication_reminders: zod_1.z.boolean(),
        meal_reminders: zod_1.z.boolean(),
        hydration_reminders: zod_1.z.boolean(),
        exercise_reminders: zod_1.z.boolean(),
        appointment_reminders: zod_1.z.boolean(),
        safety_monitoring: zod_1.z.boolean(),
    }).default({
        medication_reminders: false,
        meal_reminders: false,
        hydration_reminders: false,
        exercise_reminders: false,
        appointment_reminders: false,
        safety_monitoring: false,
    }),
    tech_comfort: zod_1.z.string(),
    notes: zod_1.z.object({
        observations: zod_1.z.string(),
        meeting_summary: zod_1.z.string(),
        recommendations: zod_1.z.string(),
    }).default({ observations: '', meeting_summary: '', recommendations: '' }),
});
async function getLatest(req, res) {
    const { patientId } = req.params;
    const assessment = await svc.getLatestAssessment(patientId);
    (0, response_1.ok)(res, { assessment });
}
async function getHistory(req, res) {
    const { patientId } = req.params;
    const history = await svc.getAssessmentHistory(patientId);
    (0, response_1.ok)(res, { history });
}
async function getById(req, res) {
    const { id } = req.params;
    const assessment = await svc.getAssessmentById(id);
    (0, response_1.ok)(res, { assessment });
}
async function save(req, res) {
    const { patientId } = req.params;
    const payload = AssessmentSaveSchema.parse(req.body);
    const result = await svc.saveAssessment(req.user.id, patientId, payload);
    (0, response_1.ok)(res, result);
}
//# sourceMappingURL=assessment.controller.js.map