import { Request, Response } from 'express';
import { ok } from '../../shared/utils/response';
import { AppError } from '../../shared/errors/AppError';
import * as svc from './relationships.service';
import pool from '../../db/config';

export async function myPatients(req: Request, res: Response) {
  const patients = await svc.getMyPatients(req.user!.id);
  ok(res, { patients });
}

export async function myCaregivers(req: Request, res: Response) {
  let patientId = req.user!.id;

  if (req.user!.role === 'FAMILY') {
    const qPatientId = req.query.patientId as string | undefined;

    if (qPatientId) {
      const membership = await pool.query(
        `SELECT pca.patient_id
         FROM patient_circle_associations pca
         JOIN care_circles c ON c.id = pca.circle_id AND c.terminated_at IS NULL
         LEFT JOIN care_circle_members m ON m.circle_id = c.id AND m.user_id = $2
         WHERE pca.patient_id = $1
           AND (c.owner_id = $2 OR m.id IS NOT NULL)
         LIMIT 1`,
        [qPatientId, req.user!.id],
      );
      if (!membership.rows[0]) {
        throw new AppError(
          'UNAUTHORIZED',
          'You are not a member of the Circle associated with this Patient',
          403,
        );
      }
      patientId = qPatientId;
    } else {
      const defaultCircle = await pool.query(
        `SELECT pca.patient_id
         FROM patient_circle_associations pca
         JOIN care_circles c ON c.id = pca.circle_id AND c.terminated_at IS NULL
         LEFT JOIN care_circle_members m ON m.circle_id = c.id AND m.user_id = $1
         WHERE c.owner_id = $1 OR m.user_id = $1
         ORDER BY pca.associated_at DESC
         LIMIT 1`,
        [req.user!.id],
      );
      if (defaultCircle.rows[0]) patientId = defaultCircle.rows[0].patient_id;
    }
  }

  const caregivers = await svc.getMyCaregivers(patientId);
  ok(res, { caregivers });
}

export async function myFamily(req: Request, res: Response) {
  const family = await svc.getMyFamily(req.user!.id, req.user!.role);
  ok(res, { family });
}

export async function searchCaregivers(req: Request, res: Response) {
  const query = (req.query.query as string) || '';
  const caregivers = await svc.searchCaregivers(req.user!.id, query);
  ok(res, { caregivers });
}
