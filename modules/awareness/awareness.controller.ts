import { Request, Response } from 'express';
import { ok } from '../../shared/utils/response';
import * as svc from './awareness.service';

export async function getPatientState(req: Request, res: Response) {
  const state = await svc.getPatientState(req.params.patientId);
  ok(res, { state });
}

export async function getAllStates(req: Request, res: Response) {
  const states = await svc.getAllPatientStates(req.user!.id);
  ok(res, { states });
}

export async function sos(req: Request, res: Response) {
  await svc.triggerSOS(req.user!.id);
  ok(res, { message: 'SOS triggered. Emergency services notified.' });
}

export async function updateEngagement(req: Request, res: Response) {
  const { state } = req.body;
  await svc.updateEngagement(req.user!.id, state ?? 'ACTIVE');
  ok(res, { message: 'Engagement updated' });
}
