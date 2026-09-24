import { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../shared/utils/response';
import { AppError } from '../../shared/errors/AppError';
import * as svc from './discovery.service';
import { DiscoveryQuerySchema } from './discovery.types';

const CaregiverIdParamSchema = z.string().uuid({ message: 'Invalid caregiverId UUID format' });

export async function searchCaregivers(req: Request, res: Response): Promise<void> {
  const queryParams = DiscoveryQuerySchema.parse(req.query);
  const result = await svc.searchCaregivers(queryParams, req.user!);
  ok(res, result);
}

export async function getCaregiverProfile(req: Request, res: Response): Promise<void> {
  const parseResult = CaregiverIdParamSchema.safeParse(req.params.caregiverId);
  if (!parseResult.success) {
    throw new AppError('VALIDATION_ERROR', parseResult.error.issues[0]?.message || 'Invalid caregiver ID', 422);
  }

  const targetPatientId = typeof req.query.targetPatientId === 'string' ? req.query.targetPatientId : undefined;
  const profile = await svc.getCaregiverProfileById(req.params.caregiverId, req.user!, targetPatientId);
  ok(res, { caregiver: profile });
}
