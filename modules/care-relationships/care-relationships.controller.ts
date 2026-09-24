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
        `SELECT patient_user_id FROM patient_relationships
         WHERE related_user_id = $1 AND status = 'CONFIRMED'
         LIMIT 1`,
        [req.user!.id],
      );
      if (rel.rows[0]) {
        targetPatientId = rel.rows[0].patient_user_id;
      }
    }
  }

  if (!targetPatientId) {
    throw new AppError('VALIDATION_ERROR', 'Target patientId is required to fetch care history', 400);
  }

  const history = await svc.getCareRelationshipHistory(targetPatientId, req.user!);
  ok(res, { history });
}

// ─── Phase 3B Handlers ────────────────────────────────────────────────────────

export async function createResignation(req: Request, res: Response) {
  const relationshipId = req.params.relationshipId || req.params.id;
  if (!relationshipId) {
    throw new AppError('VALIDATION_ERROR', 'Relationship ID is required', 400);
  }

  const parseResult = CreateResignationSchema.safeParse(req.body);
  if (!parseResult.success) {
    const errorMsg = parseResult.error.issues.map((e: { message: string }) => e.message).join(', ');
    throw new AppError('VALIDATION_ERROR', errorMsg, 400);
  }

  const resignation = await svc.createResignationRequest(
    relationshipId,
    parseResult.data,
    req.user!,
  );

  ok(res, { resignation }, 201);
}

export async function getResignation(req: Request, res: Response) {
  const relationshipId = req.params.relationshipId || req.params.id;
  if (!relationshipId) {
    throw new AppError('VALIDATION_ERROR', 'Relationship ID is required', 400);
  }

  const resignation = await svc.getResignationRequest(relationshipId, req.user!);
  ok(res, { resignation });
}

export async function getPendingResignations(req: Request, res: Response) {
  let targetPatientId = (req.query.patientId as string) || '';

  if (!targetPatientId) {
    if (req.user!.role === 'PATIENT') {
      targetPatientId = req.user!.id;
    } else if (req.user!.role === 'FAMILY') {
      const rel = await pool.query(
        `SELECT patient_user_id FROM patient_relationships
         WHERE related_user_id = $1 AND status = 'CONFIRMED'
         LIMIT 1`,
        [req.user!.id],
      );
      if (rel.rows[0]) {
        targetPatientId = rel.rows[0].patient_user_id;
      }
    }
  }

  if (!targetPatientId) {
    throw new AppError('VALIDATION_ERROR', 'Target patientId is required to fetch pending resignations', 400);
  }

  const resignations = await svc.getPendingResignationsForPatient(targetPatientId, req.user!);
  ok(res, { resignations });
}

export async function acceptResignation(req: Request, res: Response) {
  const relationshipId = req.params.relationshipId || req.params.id;
  if (!relationshipId) {
    throw new AppError('VALIDATION_ERROR', 'Relationship ID is required', 400);
  }

  const result = await svc.acceptResignationRequest(relationshipId, req.user!);
  ok(res, result);
}

export async function declineResignation(req: Request, res: Response) {
  const relationshipId = req.params.relationshipId || req.params.id;
  if (!relationshipId) {
    throw new AppError('VALIDATION_ERROR', 'Relationship ID is required', 400);
  }

  const parseResult = DeclineResignationSchema.safeParse(req.body);
  if (!parseResult.success) {
    const errorMsg = parseResult.error.issues.map((e: { message: string }) => e.message).join(', ');
    throw new AppError('VALIDATION_ERROR', errorMsg, 400);
  }

  const resignation = await svc.declineResignationRequest(
    relationshipId,
    parseResult.data,
    req.user!,
  );

  ok(res, { resignation });
}

export async function withdrawResignation(req: Request, res: Response) {
  const relationshipId = req.params.relationshipId || req.params.id;
  if (!relationshipId) {
    throw new AppError('VALIDATION_ERROR', 'Relationship ID is required', 400);
  }

  const resignation = await svc.withdrawResignationRequest(relationshipId, req.user!);
  ok(res, { resignation });
}

