import { Request, Response } from 'express';
import { ok } from '../../shared/utils/response';
import { AppError } from '../../shared/errors/AppError';
import * as svc from './users.service';
import { z } from 'zod';

const UpdateMeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  preferred_language: z.string().max(10).optional(),
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
  const data = UpdateMeSchema.parse(req.body);
  const user = await svc.updateMe(req.user!.id, data);
  ok(res, { user });
}

// ─── Patient Profile ─────────────────────────────────────────────────────────

export async function upsertPatientProfile(req: Request, res: Response) {
  if (req.user!.role !== 'PATIENT') throw new AppError('ROLE_NOT_PERMITTED', 'Only patients can update patient profiles', 403);
  const profile = await svc.upsertPatientProfile(req.user!.id, req.body);
  ok(res, { profile });
}

export async function getPatientProfile(req: Request, res: Response) {
  const profile = await svc.getPatientProfile(req.params.id);
  ok(res, { profile });
}

// ─── Caregiver Profile ───────────────────────────────────────────────────────

export async function upsertCaregiverProfile(req: Request, res: Response) {
  if (req.user!.role !== 'CAREGIVER') throw new AppError('ROLE_NOT_PERMITTED', 'Only caregivers can update caregiver profiles', 403);
  const profile = await svc.upsertCaregiverProfile(req.user!.id, req.body);
  ok(res, { profile });
}

export async function getCaregiverProfile(req: Request, res: Response) {
  const profile = await svc.getCaregiverProfile(req.params.id);
  ok(res, { profile });
}

// ─── Family Profile ──────────────────────────────────────────────────────────

export async function upsertFamilyProfile(req: Request, res: Response) {
  if (req.user!.role !== 'FAMILY') throw new AppError('ROLE_NOT_PERMITTED', 'Only family members can update family profiles', 403);
  const profile = await svc.upsertFamilyProfile(req.user!.id, req.body);
  ok(res, { profile });
}
