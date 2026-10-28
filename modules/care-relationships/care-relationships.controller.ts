/**
 * SureStep — modules/care-relationships/care-relationships.controller.ts
 *
 * Express controller handlers for Care Relationship termination & history.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../shared/utils/response';
import { AppError } from '../../shared/errors/AppError';
import * as svc from './care-relationships.service';
import {
  CANONICAL_END_REASONS,
  CANONICAL_RESIGNATION_REASONS,
} from './care-relationships.types';
import pool from '../../db/config';

const EndCareRelationshipSchema = z.object({
  reason: z.enum(CANONICAL_END_REASONS),
  notes: z.string().max(500, 'Notes must not exceed 500 characters').nullable().optional(),
});

const CreateResignationSchema = z.object({
  reason: z.enum(CANONICAL_RESIGNATION_REASONS),
  notes: z.string().max(500, 'Notes must not exceed 500 characters').nullable().optional(),
});

const DeclineResignationSchema = z.object({
  notes: z.string().max(500, 'Notes must not exceed 500 characters').nullable().optional(),
});

export async function endCareRelationship(req: Request, res: Response) {
  const relationshipId = req.params.relationshipId || req.params.id;
  if (!relationshipId) {
    throw new AppError('VALIDATION_ERROR', 'Relationship ID is required in URL parameters', 400);
  }

  const parseResult = EndCareRelationshipSchema.safeParse(req.body);
  if (!parseResult.success) {
    const errorMsg = parseResult.error.issues.map((e: { message: string }) => e.message).join(', ');
    throw new AppError('VALIDATION_ERROR', errorMsg, 400);
  }

  const relationship = await svc.endCareRelationship(
    relationshipId,
    parseResult.data,
    req.user!,
  );

  ok(res, { relationship });
}

export async function getCareRelationshipHistory(req: Request, res: Response) {
  let targetPatientId = (req.query.patientId as string) || '';

  if (!targetPatientId) {
    if (req.user!.role === 'PATIENT') {
      targetPatientId = req.user!.id;
    } else if (req.user!.role === 'FAMILY') {
      const rel = await pool.query(
        `SELECT pca.patient_id FROM care_circle_members ccm
         JOIN care_circles c ON ccm.circle_id = c.id
         JOIN patient_circle_associations pca ON pca.circle_id = c.id
         WHERE ccm.user_id = $1 AND c.terminated_at IS NULL
         UNION
         SELECT pca.patient_id FROM care_circles c
         JOIN patient_circle_associations pca ON pca.circle_id = c.id
         WHERE c.owner_id = $1 AND c.terminated_at IS NULL
         LIMIT 1`,
        [req.user!.id],
      );
      if (rel.rows[0]) {
        targetPatientId = rel.rows[0].patient_id;
      }
    }
  }

  if (!targetPatientId) {
    throw new AppError('VALIDATION_ERROR', 'Target patientId is required to fetch care history', 400);
  }

  const history = await svc.getCareRelationshipHistory(targetPatientId, req.user!);
  ok(res, { history });
}

import { CaregiverRelationshipsService } from '../care-circles/caregiver-relationships.service';
import { PatientAssignmentsService } from '../care-circles/patient-assignments.service';

const caregiverRelService = new CaregiverRelationshipsService();
const patientAssignmentsService = new PatientAssignmentsService();

export async function submitNotice(req: Request, res: Response) {
  const relationshipId = req.params.relationshipId || req.params.id;
  if (!relationshipId) {
    throw new AppError('VALIDATION_ERROR', 'Relationship ID is required in URL parameters', 400);
  }
  const result = await caregiverRelService.submitNotice(relationshipId, req.user!.id, req.body);
  ok(res, { relationship: result });
}

export async function terminateRelationship(req: Request, res: Response) {
  const relationshipId = req.params.relationshipId || req.params.id;
  if (!relationshipId) {
    throw new AppError('VALIDATION_ERROR', 'Relationship ID is required in URL parameters', 400);
  }
  const result = await caregiverRelService.terminateImmediate(relationshipId, req.user!.id, req.body);
  ok(res, { relationship: result });
}

export async function assignPatient(req: Request, res: Response) {
  const relationshipId = req.params.relationshipId || req.params.id;
  const { patientId } = req.body;
  if (!relationshipId || !patientId) {
    throw new AppError('VALIDATION_ERROR', 'relationshipId and patientId are required', 400);
  }
  const result = await patientAssignmentsService.assignCaregiverToPatient(relationshipId, patientId, req.user!.id);
  ok(res, { assignment: result }, 201);
}

export async function unassignPatient(req: Request, res: Response) {
  const relationshipId = req.params.relationshipId || req.params.id;
  const patientId = req.params.patientId || req.body.patientId;
  if (!relationshipId || !patientId) {
    throw new AppError('VALIDATION_ERROR', 'relationshipId and patientId are required', 400);
  }
  const result = await patientAssignmentsService.revokePatientAssignment(relationshipId, patientId, req.user!.id);
  ok(res, { assignment: result });
}

export async function getRelationshipById(req: Request, res: Response) {
  const relationshipId = req.params.relationshipId || req.params.id;
  if (!relationshipId) {
    throw new AppError('VALIDATION_ERROR', 'Relationship ID is required in URL parameters', 400);
  }
  const result = await caregiverRelService.getRelationshipWithCircle(relationshipId);
  ok(res, { relationship: result });
}

// ─── Deprecated Phase 3B Handlers (410 GONE) ─────────────────────────────────

export async function createResignation(_req: Request, _res: Response) {
  throw new AppError('INTERACTIVE_RESIGNATION_DEPRECATED', 'Interactive resignation negotiation has been replaced by the non-interactive 7-day Notice Period. Use POST /care-relationships/:id/notice.', 410);
}

export async function getResignation(_req: Request, _res: Response) {
  throw new AppError('INTERACTIVE_RESIGNATION_DEPRECATED', 'Interactive resignation negotiation has been replaced by the non-interactive 7-day Notice Period. Use POST /care-relationships/:id/notice.', 410);
}

export async function getPendingResignations(_req: Request, _res: Response) {
  throw new AppError('INTERACTIVE_RESIGNATION_DEPRECATED', 'Interactive resignation negotiation has been replaced by the non-interactive 7-day Notice Period.', 410);
}

export async function acceptResignation(_req: Request, _res: Response) {
  throw new AppError('INTERACTIVE_RESIGNATION_DEPRECATED', 'Interactive resignation negotiation has been replaced by the non-interactive 7-day Notice Period. Use POST /care-relationships/:id/terminate for immediate departure.', 410);
}

export async function declineResignation(_req: Request, _res: Response) {
  throw new AppError('INTERACTIVE_RESIGNATION_DEPRECATED', 'Interactive resignation negotiation is not supported in V1; notice periods are non-interactive.', 410);
}

export async function withdrawResignation(_req: Request, _res: Response) {
  throw new AppError('INTERACTIVE_RESIGNATION_DEPRECATED', 'Interactive resignation negotiation is not supported in V1.', 410);
}

