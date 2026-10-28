/**
 * SureStep Backend — modules/routines/routines.controller.ts
 * HTTP handlers for routine templates, attachments, tasks, and adherence.
 */
import { Request, Response } from 'express';
import { ok, created } from '../../shared/utils/response';
import * as svc from './routines.service';

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
    req.query.date as string,
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
      [occurrenceId]
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

// ─── Routine Template Handlers (Legacy) ───────────────────────────────────────

export async function listRoutineTemplates(req: Request, res: Response) {
  const templates = await svc.getRoutineTemplates(req.params.patientId);
  ok(res, { templates });
}

export async function createRoutineTemplate(req: Request, res: Response) {
  const template = await svc.createRoutineTemplate(
    req.user!.id, req.params.patientId, req.body,
  );
  created(res, { template });
}

export async function updateRoutineTemplate(req: Request, res: Response) {
  const template = await svc.updateRoutineTemplate(req.params.id, req.user!.id, req.body);
  ok(res, { template });
}

export async function deactivateRoutineTemplate(req: Request, res: Response) {
  await svc.deactivateRoutineTemplate(req.params.id, req.user!.id);
  ok(res, { message: 'Routine deactivated' });
}

// ─── Attachment Handlers ──────────────────────────────────────────────────────

export async function addAttachment(req: Request, res: Response) {
  const attachment = await svc.addAttachment(req.params.id, req.user!.id, req.body);
  created(res, { attachment });
}

export async function removeAttachment(req: Request, res: Response) {
  await svc.removeAttachment(req.params.id, req.params.attachmentId, req.user!.id);
  ok(res, { message: 'Attachment removed' });
}

// ─── Task Instance Handlers ───────────────────────────────────────────────────

export async function getTodayTasks(req: Request, res: Response) {
  const tasks = await svc.getTodayTasks(req.params.patientId);
  ok(res, { tasks });
}

export async function getTaskHistory(req: Request, res: Response) {
  const { from = '', to = '', limit = '50', cursor } = req.query as any;
  const today = new Date().toISOString().split('T')[0];
  const result = await svc.getTaskHistory(
    req.params.patientId, from || '2020-01-01', to || today,
    parseInt(limit), cursor,
  );
  ok(res, result);
}

export async function createTask(req: Request, res: Response) {
  const task = await svc.createTask(req.user!.id, req.params.patientId, req.body);
  created(res, { task });
}

export async function updateTask(req: Request, res: Response) {
  const task = await svc.updateTask(req.params.id, req.user!.id, req.body);
  ok(res, { task });
}

export async function deleteTask(req: Request, res: Response) {
  await svc.deleteTask(req.params.id, req.user!.id);
  ok(res, { message: 'Task deleted' });
}

export async function updateTaskStatus(req: Request, res: Response) {
  const { status, client_action_id } = req.body;
  if (!status) {
    res.status(422).json({ error: 'VALIDATION_ERROR', message: 'status is required' });
    return;
  }
  const task = await svc.updateTaskStatus(
    req.params.id, req.user!.id, status, client_action_id,
  );
  ok(res, { task });
}

export async function completeTask(req: Request, res: Response) {
  const task = await svc.markTaskComplete(req.params.id, req.user!.id);
  ok(res, { task });
}

export async function unsureTask(req: Request, res: Response) {
  const task = await svc.markTaskUnsure(req.params.id, req.user!.id);
  ok(res, { task });
}

// ─── Adherence Handler ────────────────────────────────────────────────────────

export async function getAdherenceSnapshot(req: Request, res: Response) {
  const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
  const snapshot = await svc.getAdherenceSnapshot(req.params.patientId, date);
  ok(res, { snapshot });
}

// ─── Legacy template handler ──────────────────────────────────────────────────

export async function getTemplates(req: Request, res: Response) {
  const templates = await svc.getTemplates(req.user!.id);
  ok(res, { templates });
}
