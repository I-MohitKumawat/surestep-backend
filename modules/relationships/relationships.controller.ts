import { Request, Response } from 'express';
import { ok, created } from '../../shared/utils/response';
import * as svc from './relationships.service';
import { z } from 'zod';

const CaregiverRequestSchema = z.object({
  caregiver_phone: z.string().min(5),
});

const FamilyInviteSchema = z.object({
  patient_id: z.string().uuid(),
  relationship_type: z.enum(['FAMILY_CLOSE', 'FAMILY_EXTENDED', 'GUARDIAN']),
  notes: z.string().optional(),
});

const StatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'SUSPENDED', 'ENDED']),
});

export async function caregiverRequest(req: Request, res: Response) {
  const { caregiver_phone } = CaregiverRequestSchema.parse(req.body);
  const rel = await svc.sendCaregiverRequest(req.user!.id, caregiver_phone);
  created(res, { relationship: rel });
}

export async function familyInvite(req: Request, res: Response) {
  const body = FamilyInviteSchema.parse(req.body);
  const result = await svc.createFamilyInvite(req.user!.id, body.patient_id, {
    relationship_type: body.relationship_type,
    notes: body.notes,
  });
  created(res, result);
}

export async function acceptInvite(req: Request, res: Response) {
  const rel = await svc.acceptInvite(req.params.token, req.user!.id);
  ok(res, { relationship: rel });
}

export async function myPatients(req: Request, res: Response) {
  const patients = await svc.getMyPatients(req.user!.id);
  ok(res, { patients });
}

export async function myCaregivers(req: Request, res: Response) {
  const caregivers = await svc.getMyCaregivers(req.user!.id);
  ok(res, { caregivers });
}

export async function myFamily(req: Request, res: Response) {
  const family = await svc.getMyFamily(req.user!.id, req.user!.role);
  ok(res, { family });
}

export async function updateStatus(req: Request, res: Response) {
  const { status } = StatusSchema.parse(req.body);
  const rel = await svc.updateRelationshipStatus(req.params.id, req.user!.id, status);
  ok(res, { relationship: rel });
}

export async function removeRelationship(req: Request, res: Response) {
  await svc.deleteRelationship(req.params.id, req.user!.id);
  ok(res, { message: 'Relationship removed' });
}
