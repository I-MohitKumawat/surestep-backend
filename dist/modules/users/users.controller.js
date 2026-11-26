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
exports.UpsertPatientProfileSchema = void 0;
exports.getMe = getMe;
exports.updateMe = updateMe;
exports.upsertPatientProfile = upsertPatientProfile;
exports.getPatientProfile = getPatientProfile;
exports.upsertCaregiverProfile = upsertCaregiverProfile;
exports.getCaregiverProfile = getCaregiverProfile;
exports.upsertFamilyProfile = upsertFamilyProfile;
exports.deleteMe = deleteMe;
exports.changePhone = changePhone;
const response_1 = require("../../shared/utils/response");
const AppError_1 = require("../../shared/errors/AppError");
const languages_1 = require("../../shared/constants/languages");
const svc = __importStar(require("./users.service"));
const zod_1 = require("zod");
const UpdateMeSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100).optional(),
    preferred_language: languages_1.PreferredLanguageSchema.optional(),
    city: zod_1.z.string().max(100).optional(),
    date_of_birth: zod_1.z.string().optional(),
    gender: zod_1.z.string().max(20).optional(),
    photo_url: zod_1.z.string().optional(),
});
async function getMe(req, res) {
    const result = await svc.getMe(req.user.id);
    (0, response_1.ok)(res, result);
}
async function updateMe(req, res) {
    const parsed = UpdateMeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        const message = parsed.error.issues.map((issue) => issue.message).join(', ') || 'Validation failed';
        throw new AppError_1.AppError('VALIDATION_ERROR', message, 422);
    }
    const user = await svc.updateMe(req.user.id, parsed.data);
    (0, response_1.ok)(res, { user });
}
// ─── Patient Profile ─────────────────────────────────────────────────────────
const PatientMedicationItemSchema = zod_1.z.object({
    id: zod_1.z.string().trim().min(1, 'Medication id cannot be empty').max(100).optional(),
    name: zod_1.z.string().trim().min(1, 'Medication name is required').max(150),
    dosage: zod_1.z.string().trim().max(100).optional(),
    times_of_day: zod_1.z.array(zod_1.z.string().trim().min(1, 'Medication timing cannot be empty').max(50)).optional(),
    timing: zod_1.z.string().trim().min(1).max(50).optional(),
    frequency: zod_1.z.string().trim().min(1).max(50).optional(),
    instructions: zod_1.z.string().trim().max(500).nullable().optional(),
});
exports.UpsertPatientProfileSchema = zod_1.z
    .object({
    name: zod_1.z.string().trim().min(1).max(100).optional(),
    date_of_birth: zod_1.z.string().nullable().optional(),
    gender: zod_1.z.string().max(20).nullable().optional(),
    preferred_language: languages_1.PreferredLanguageSchema.optional(),
    city: zod_1.z.string().max(100).nullable().optional(),
    location: zod_1.z.string().max(100).nullable().optional(),
    emergency_contact_name: zod_1.z.string().max(100).nullable().optional(),
    emergency_contact_phone: zod_1.z.string().max(20).nullable().optional(),
    emergency_contact_relation: zod_1.z.string().max(50).nullable().optional(),
    diagnosis: zod_1.z.string().max(100).nullable().optional(),
    diagnosis_date: zod_1.z.string().nullable().optional(),
    severity_level: zod_1.z.string().max(30).nullable().optional(),
    living_arrangement: zod_1.z.string().max(50).nullable().optional(),
    care_needs: zod_1.z.array(zod_1.z.string()).optional(),
    safety_concerns: zod_1.z.array(zod_1.z.string()).optional(),
    communication_preferences: zod_1.z.array(zod_1.z.string()).optional(),
    other_conditions: zod_1.z.array(zod_1.z.string()).optional(),
    onboarding_source: zod_1.z.string().max(30).optional(),
    takes_medication: zod_1.z.boolean().nullable().optional(),
    medications: zod_1.z.array(PatientMedicationItemSchema).optional(),
    known_triggers: zod_1.z.array(zod_1.z.string()).optional(),
    comfort_items: zod_1.z.array(zod_1.z.string()).optional(),
    favourite_songs: zod_1.z.array(zod_1.z.any()).optional(),
    cognitive_baseline_date: zod_1.z.string().nullable().optional(),
    nimhans_patient_id: zod_1.z.string().max(50).nullable().optional(),
})
    .passthrough()
    .superRefine((data, ctx) => {
    if (data.takes_medication === false && data.medications !== undefined && data.medications.length > 0) {
        ctx.addIssue({
            code: 'custom',
            path: ['medications'],
            message: 'medications must be empty when takes_medication is false',
        });
    }
});
async function upsertPatientProfile(req, res) {
    if (req.user.role !== 'PATIENT')
        throw new AppError_1.AppError('ROLE_NOT_PERMITTED', 'Only patients can update patient profiles', 403);
    const parsed = exports.UpsertPatientProfileSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        const message = parsed.error.issues.map((issue) => issue.message).join(', ') || 'Invalid patient profile payload';
        throw new AppError_1.AppError('VALIDATION_ERROR', message, 422);
    }
    const profile = await svc.upsertPatientProfile(req.user.id, parsed.data);
    (0, response_1.ok)(res, { profile });
}
async function getPatientProfile(req, res) {
    const profile = await svc.getPatientProfile(req.params.id);
    (0, response_1.ok)(res, { profile });
}
// ─── Caregiver Profile ───────────────────────────────────────────────────────
async function upsertCaregiverProfile(req, res) {
    if (req.user.role !== 'CAREGIVER')
        throw new AppError_1.AppError('ROLE_NOT_PERMITTED', 'Only caregivers can update caregiver profiles', 403);
    const body = req.body || {};
    const yearsExp = body.years_of_experience ?? body.yearsExperience;
    if (yearsExp !== undefined && yearsExp !== null && (typeof yearsExp !== 'number' || yearsExp < 0)) {
        throw new AppError_1.AppError('VALIDATION_ERROR', 'Years of experience must be a non-negative number', 400);
    }
    const dementiaExp = body.dementia_experience_years ?? body.dementiaExperienceYears;
    if (dementiaExp !== undefined && dementiaExp !== null && (typeof dementiaExp !== 'number' || dementiaExp < 0)) {
        throw new AppError_1.AppError('VALIDATION_ERROR', 'Dementia experience years must be a non-negative number', 400);
    }
    if (yearsExp !== undefined && dementiaExp !== undefined && dementiaExp > yearsExp) {
        throw new AppError_1.AppError('VALIDATION_ERROR', 'Dementia experience cannot exceed total experience', 400);
    }
    const hourlyRate = body.hourly_rate ?? body.hourlyRate;
    if (hourlyRate !== undefined && hourlyRate !== null && (typeof hourlyRate !== 'number' || hourlyRate < 0)) {
        throw new AppError_1.AppError('VALIDATION_ERROR', 'Hourly rate must be a non-negative number', 400);
    }
    const dailyRate = body.daily_rate ?? body.dailyRate;
    if (dailyRate !== undefined && dailyRate !== null && (typeof dailyRate !== 'number' || dailyRate < 0)) {
        throw new AppError_1.AppError('VALIDATION_ERROR', 'Daily rate must be a non-negative number', 400);
    }
    const profile = await svc.upsertCaregiverProfile(req.user.id, req.body);
    (0, response_1.ok)(res, { profile });
}
async function getCaregiverProfile(req, res) {
    const profile = await svc.getCaregiverProfile(req.params.id, req.user?.id);
    (0, response_1.ok)(res, { profile });
}
// ─── Family Profile ──────────────────────────────────────────────────────────
async function upsertFamilyProfile(req, res) {
    if (req.user.role !== 'FAMILY')
        throw new AppError_1.AppError('ROLE_NOT_PERMITTED', 'Only family members can update family profiles', 403);
    const profile = await svc.upsertFamilyProfile(req.user.id, req.body);
    (0, response_1.ok)(res, { profile });
}
// ─── Account Deletion & Phone Change ─────────────────────────────────────────
async function deleteMe(req, res) {
    const result = await svc.deleteAccount(req.user.id);
    (0, response_1.ok)(res, result);
}
async function changePhone(req, res) {
    const { newPhone, newPhoneToken } = req.body;
    const user = await svc.changePhoneNumber(req.user.id, newPhone, newPhoneToken);
    (0, response_1.ok)(res, { success: true, user });
}
//# sourceMappingURL=users.controller.js.map