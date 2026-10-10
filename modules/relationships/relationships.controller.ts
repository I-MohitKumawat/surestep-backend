import { Request, Response } from 'express';
import { ok, created } from '../../shared/utils/response';
import { AppError } from '../../shared/errors/AppError';
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
  try {
    const { io } = await import('../../server');
    io.to(`patient:${rel.patient_user_id}`).emit('relationship:change', { relationship: rel });
    io.to(`user:${rel.related_user_id}`).emit('relationship:change', { relationship: rel });
  } catch (_) {}
  ok(res, { relationship: rel });
}

export async function myPatients(req: Request, res: Response) {
  const patients = await svc.getMyPatients(req.user!.id);
  ok(res, { patients });
}

export async function myCaregivers(req: Request, res: Response) {
  let patientId = req.user!.id;
  if (req.user!.role === 'FAMILY') {
    const qPatientId = req.query.patientId as string | undefined;
    const { default: pool } = await import('../../db/config');
    if (qPatientId) {
      const famCheck = await pool.query(
        `SELECT id FROM patient_relationships
         WHERE patient_user_id = $1 AND related_user_id = $2
           AND status = 'CONFIRMED'
           AND relationship_type IN ('GUARDIAN', 'FAMILY_CLOSE', 'FAMILY_EXTENDED')`,
        [qPatientId, req.user!.id],
      );
      if (!famCheck.rows[0]) {
        throw new AppError('UNAUTHORIZED', 'You do not have confirmed family authority over this patient', 403);
      }
      patientId = qPatientId;
    } else {
      const defaultRel = await pool.query(
        `SELECT patient_user_id FROM patient_relationships
         WHERE related_user_id = $1 AND status = 'CONFIRMED' LIMIT 1`,
        [req.user!.id],
      );
      if (defaultRel.rows[0]) patientId = defaultRel.rows[0].patient_user_id;
    }
  }
  const caregivers = await svc.getMyCaregivers(patientId);
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

// ─── Caregiver Integration Controllers ────────────────────────────────────────

const ConfirmCaregiverSchema = z.object({
  caregiverId: z.string().uuid(),
});

const RespondRequestSchema = z.object({
  patientPhone: z.string(),
  action: z.enum(['confirmed', 'rejected']),
});

export async function getConfirmedCaregiver(req: Request, res: Response) {
  const caregiver = await svc.getConfirmedCaregiverForPatient(req.user!.id);
  ok(res, caregiver);
}

export async function confirmCaregiver(req: Request, res: Response) {
  const { caregiverId } = ConfirmCaregiverSchema.parse(req.body);
  const relationship = await svc.confirmCaregiverRelationship(req.user!.id, caregiverId);
  try {
    const { io } = await import('../../server');
    io.to(`patient:${req.user!.id}`).emit('relationship:change', { relationship });
    io.to(`user:${caregiverId}`).emit('relationship:change', { relationship });
  } catch (_) {}
  ok(res, { relationship });
}

export async function removeCaregiver(req: Request, res: Response) {
  const targetCaregiverId = (req.body?.caregiverId || req.query?.caregiverId) as string | undefined;
  if (!targetCaregiverId || typeof targetCaregiverId !== 'string' || targetCaregiverId.trim() === '') {
    throw new AppError('VALIDATION_ERROR', 'caregiverId is required to remove a caregiver relationship', 400);
  }
  const removedCaregiverId = await svc.removeCaregiverRelationship(req.user!.id, targetCaregiverId.trim());
  try {
    const { io } = await import('../../server');
    io.to(`patient:${req.user!.id}`).emit('relationship:change', { action: 'removed', patientId: req.user!.id, caregiverId: removedCaregiverId });
    io.to(`user:${removedCaregiverId}`).emit('relationship:change', { action: 'removed', patientId: req.user!.id, caregiverId: removedCaregiverId });
  } catch (_) {}
  ok(res, { message: 'Caregiver relationship removed', removedCaregiverId });
}

export async function getPendingRequests(req: Request, res: Response) {
  const requests = await svc.getPendingRequestsForCaregiver(req.user!.id);
  ok(res, requests);
}

export async function respondToRequest(req: Request, res: Response) {
  const { patientPhone, action } = RespondRequestSchema.parse(req.body);
  const { patientId } = await svc.respondToCaregiverRequest(req.user!.id, patientPhone, action);
  try {
    const { io } = await import('../../server');
    io.to(`patient:${patientId}`).emit('relationship:change', { action, patientId });
    io.to(`user:${req.user!.id}`).emit('relationship:change', { action, patientId });
  } catch (_) {}
  ok(res, { message: 'Response registered successfully' });
}

export async function searchCaregivers(req: Request, res: Response) {
  const query = (req.query.query as string) || '';
  const caregivers = await svc.searchCaregivers(req.user!.id, query);
  ok(res, { caregivers });
}

export async function completeMeeting(req: Request, res: Response) {
  const { patientId } = req.params;
  const rel = await svc.completeMeeting(req.user!.id, patientId);
  ok(res, { relationship: rel });
}

export async function getPatientRelationship(req: Request, res: Response) {
  const { patientId } = req.params;
  const rel = await svc.getPatientRelationship(req.user!.id, patientId);
  ok(res, { relationship: rel });
}

