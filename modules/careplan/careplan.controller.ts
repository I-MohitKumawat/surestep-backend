import { Request, Response } from 'express';
import { ok } from '../../shared/utils/response';
import * as svc from './careplan.service';

export async function getByPatient(req: Request, res: Response) {
  const { patientId } = req.params;
  const carePlan = await svc.getCarePlanByPatientId(patientId);
  ok(res, { carePlan });
}
