import { Request, Response } from 'express';
import { ok } from '../../shared/utils/response';
import { AppError } from '../../shared/errors/AppError';
import { PreferredLanguageSchema } from '../../shared/constants/languages';
import * as svc from './users.service';
import { z } from 'zod';

const UpdateMeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  preferred_language: PreferredLanguageSchema.optional(),
  city: z.string().max(100).optional(),
  date_of_birth: z.string().optional(),
  gender: z.string().max(20).optional(),
  photo_url: z.string().optional(),
});

export async function getMe(req: Request, res: Response) {
  const result = await svc.getMe(req.user!.id);
  ok(res, result);
}

export async function updateMe(req: Request, res: Response) {
  const parsed = UpdateMeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join(', ') || 'Validation failed';
    throw new AppError('VALIDATION_ERROR', message, 422);
  }
  const user = await svc.updateMe(req.user!.id, parsed.data);
  ok(res, { user });
}

// ─── Patient Profile ─────────────────────────────────────────────────────────

const PatientMedicationItemSchema = z.object({
  id: z.string().trim().min(1, 'Medication id cannot be empty').max(100).optional(),
  name: z.string().trim().min(1, 'Medication name is required').max(150),
  dosage: z.string().trim().max(100).optional(),
  times_of_day: z.array(z.string().trim().min(1, 'Medication timing cannot be empty').max(50)).optional(),
  timing: z.string().trim().min(1).max(50).optional(),
  frequency: z.string().trim().min(1).max(50).optional(),
  instructions: z.string().trim().max(500).nullable().optional(),
});

export const UpsertPatientProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    date_of_birth: z.string().nullable().optional(),
    gender: z.string().max(20).nullable().optional(),
    preferred_language: PreferredLanguageSchema.optional(),
    city: z.string().max(100).nullable().optional(),
    location: z.string().max(100).nullable().optional(),
    emergency_contact_name: z.string().max(100).nullable().optional(),
    emergency_contact_phone: z.string().max(20).nullable().optional(),
    emergency_contact_relation: z.string().max(50).nullable().optional(),
    diagnosis: z.string().max(100).nullable().optional(),
    diagnosis_date: z.string().nullable().optional(),
    severity_level: z.string().max(30).nullable().optional(),
    living_arrangement: z.string().max(50).nullable().optional(),
    care_needs: z.array(z.string()).optional(),
    safety_concerns: z.array(z.string()).optional(),
    communication_preferences: z.array(z.string()).optional(),
    other_conditions: z.array(z.string()).optional(),
    onboarding_source: z.string().max(30).optional(),
    takes_medication: z.boolean().nullable().optional(),
    medications: z.array(PatientMedicationItemSchema).optional(),
    known_triggers: z.array(z.string()).optional(),
    comfort_items: z.array(z.string()).optional(),
    favourite_songs: z.array(z.any()).optional(),
    cognitive_baseline_date: z.string().nullable().optional(),
    nimhans_patient_id: z.string().max(50).nullable().optional(),
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

export async function upsertPatientProfile(req: Request, res: Response) {
  if (req.user!.role !== 'PATIENT') throw new AppError('ROLE_NOT_PERMITTED', 'Only patients can update patient profiles', 403);
  const parsed = UpsertPatientProfileSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join(', ') || 'Invalid patient profile payload';
    throw new AppError('VALIDATION_ERROR', message, 422);
  }
  const profile = await svc.upsertPatientProfile(req.user!.id, parsed.data);
  ok(res, { profile });
}

export async function getPatientProfile(req: Request, res: Response) {
  const profile = await svc.getPatientProfile(req.params.id);
  ok(res, { profile });
}

// ─── Caregiver Profile ───────────────────────────────────────────────────────

export async function upsertCaregiverProfile(req: Request, res: Response) {
  if (req.user!.role !== 'CAREGIVER') throw new AppError('ROLE_NOT_PERMITTED', 'Only caregivers can update caregiver profiles', 403);

  const body = req.body || {};
  const yearsExp = body.years_of_experience ?? body.yearsExperience;
  if (yearsExp !== undefined && yearsExp !== null && (typeof yearsExp !== 'number' || yearsExp < 0)) {
    throw new AppError('VALIDATION_ERROR', 'Years of experience must be a non-negative number', 400);
  }

  const dementiaExp = body.dementia_experience_years ?? body.dementiaExperienceYears;
  if (dementiaExp !== undefined && dementiaExp !== null && (typeof dementiaExp !== 'number' || dementiaExp < 0)) {
    throw new AppError('VALIDATION_ERROR', 'Dementia experience years must be a non-negative number', 400);
  }

  if (yearsExp !== undefined && dementiaExp !== undefined && dementiaExp > yearsExp) {
    throw new AppError('VALIDATION_ERROR', 'Dementia experience cannot exceed total experience', 400);
  }

  const hourlyRate = body.hourly_rate ?? body.hourlyRate;
  if (hourlyRate !== undefined && hourlyRate !== null && (typeof hourlyRate !== 'number' || hourlyRate < 0)) {
    throw new AppError('VALIDATION_ERROR', 'Hourly rate must be a non-negative number', 400);
  }

  const dailyRate = body.daily_rate ?? body.dailyRate;
  if (dailyRate !== undefined && dailyRate !== null && (typeof dailyRate !== 'number' || dailyRate < 0)) {
    throw new AppError('VALIDATION_ERROR', 'Daily rate must be a non-negative number', 400);
  }

  const profile = await svc.upsertCaregiverProfile(req.user!.id, req.body);
  ok(res, { profile });
}

export async function getCaregiverProfile(req: Request, res: Response) {
  const profile = await svc.getCaregiverProfile(req.params.id, req.user?.id);
  ok(res, { profile });
}

// ─── Family Profile ──────────────────────────────────────────────────────────

export async function upsertFamilyProfile(req: Request, res: Response) {
  if (req.user!.role !== 'FAMILY') throw new AppError('ROLE_NOT_PERMITTED', 'Only family members can update family profiles', 403);
  const profile = await svc.upsertFamilyProfile(req.user!.id, req.body);
  ok(res, { profile });
}

// ─── Account Deletion & Phone Change ─────────────────────────────────────────

export async function deleteMe(req: Request, res: Response) {
  const result = await svc.deleteAccount(req.user!.id);
  ok(res, result);
}

export async function changePhone(req: Request, res: Response) {
  const { newPhone, newPhoneToken } = req.body;
  const user = await svc.changePhoneNumber(req.user!.id, newPhone, newPhoneToken);
  ok(res, { success: true, user });
}
