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
exports.getMe = getMe;
exports.updateMe = updateMe;
exports.upsertPatientProfile = upsertPatientProfile;
exports.getPatientProfile = getPatientProfile;
exports.upsertCaregiverProfile = upsertCaregiverProfile;
exports.getCaregiverProfile = getCaregiverProfile;
exports.upsertFamilyProfile = upsertFamilyProfile;
const response_1 = require("../../shared/utils/response");
const AppError_1 = require("../../shared/errors/AppError");
const svc = __importStar(require("./users.service"));
const zod_1 = require("zod");
const UpdateMeSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100).optional(),
    preferred_language: zod_1.z.string().max(10).optional(),
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
    const data = UpdateMeSchema.parse(req.body);
    const user = await svc.updateMe(req.user.id, data);
    (0, response_1.ok)(res, { user });
}
// ─── Patient Profile ─────────────────────────────────────────────────────────
async function upsertPatientProfile(req, res) {
    if (req.user.role !== 'PATIENT')
        throw new AppError_1.AppError('ROLE_NOT_PERMITTED', 'Only patients can update patient profiles', 403);
    const profile = await svc.upsertPatientProfile(req.user.id, req.body);
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
//# sourceMappingURL=users.controller.js.map