/**
 * SureStep Backend — modules/routines/routines.controller.ts
 * HTTP handlers for canonical routine definitions, occurrences, and sign-off.
 */
import { Request, Response } from 'express';
import { ok, created } from '../../shared/utils/response';
import { authoritativeRoutinesService } from './authoritative-routines.service';
import { AppError } from '../../shared/errors/AppError';
import pool from '../../db/config';

// ─── Authoritative Routine Handlers ──────────────────────────────────────────

export async function createDefinition(req: Request, res: Response) {
  const definition = await authoritativeRoutinesService.createDefinition(
    req.params.patientId,
    req.user!.id,
    req.body,
  );
  created(res, { routine: definition });
}

export async function updateDefinition(req: Request, res: Response) {
  const definition = await authoritativeRoutinesService.updateDefinition(
    req.params.patientId,
    req.params.routineId,
    req.body,
  );
  ok(res, { routine: definition });
}

export async function getDefinitions(req: Request, res: Response) {
  const routines = await authoritativeRoutinesService.getDefinitions(req.params.patientId);
  ok(res, { routines });
}

export async function getDefinitionById(req: Request, res: Response) {
  const routine = await authoritativeRoutinesService.getDefinitionById(
    req.params.patientId,
    req.params.routineId,
  );
  ok(res, { routine });
}

export async function deleteDefinition(req: Request, res: Response) {
  const routine = await authoritativeRoutinesService.deleteDefinition(
    req.params.patientId,
    req.params.routineId,
  );
  ok(res, { message: 'Routine definition deactivated', routine });
}

export async function listOccurrences(req: Request, res: Response) {
  const occurrences = await authoritativeRoutinesService.listOccurrences(
    req.params.patientId,
    req.query.date as string | undefined,
  );
  ok(res, { occurrences });
}

export async function signOffOccurrence(req: Request, res: Response) {
  let { patientId, routineId, occurrenceId } = req.params;

  // Unscoped route fallback: lookup occurrence to get patientId and routineId
  if (!patientId || !routineId) {
    occurrenceId = occurrenceId || req.params.id;
    const occCheck = await pool.query(
      `SELECT routine_id, patient_id FROM routine_occurrences WHERE id = $1`,
      [occurrenceId],
    );
    if (!occCheck.rows[0]) {
      throw new AppError('NOT_FOUND', 'Routine occurrence not found', 404);
    }
    patientId = occCheck.rows[0].patient_id;
    routineId = occCheck.rows[0].routine_id;
  }

  const result = await authoritativeRoutinesService.signOffOccurrence(
    patientId,
    routineId,
    occurrenceId,
    req.user!,
    req.body.notes,
  );
  ok(res, result);
}
