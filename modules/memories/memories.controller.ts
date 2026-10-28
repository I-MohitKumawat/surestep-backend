/**
 * SureStep — modules/memories/memories.controller.ts
 */

import { Request, Response } from 'express';
import { authoritativeMemoriesService } from './authoritative-memories.service';
import { ok, created } from '../../shared/utils/response';

export async function createMemory(req: Request, res: Response) {
  const { patientId } = req.params;
  const memory = await authoritativeMemoriesService.createMemory(
    patientId,
    req.user!.id,
    req.body
  );
  created(res, { memory });
}

export async function listMemories(req: Request, res: Response) {
  const { patientId } = req.params;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
  const cursor = req.query.cursor as string | undefined;

  const result = await authoritativeMemoriesService.getMemories(patientId, limit, cursor);
  ok(res, result);
}

export async function getMemoryById(req: Request, res: Response) {
  const { patientId, memoryId } = req.params;
  const memory = await authoritativeMemoriesService.getMemoryById(patientId, memoryId);
  ok(res, { memory });
}

export async function updateMemory(req: Request, res: Response) {
  const { patientId, memoryId } = req.params;
  const memory = await authoritativeMemoriesService.updateMemory(patientId, memoryId, req.body);
  ok(res, { memory });
}

export async function deleteMemory(req: Request, res: Response) {
  const { patientId, memoryId } = req.params;
  const result = await authoritativeMemoriesService.deleteMemory(
    patientId,
    memoryId,
    req.user!.id
  );
  ok(res, result);
}

export async function recordActivity(req: Request, res: Response) {
  const { patientId } = req.params;
  const activity = await authoritativeMemoriesService.recordActivityAttempt(
    patientId,
    req.body
  );
  created(res, { activity });
}

export async function listActivities(req: Request, res: Response) {
  const { patientId } = req.params;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
  const cursor = req.query.cursor as string | undefined;

  const result = await authoritativeMemoriesService.getActivityAttempts(patientId, limit, cursor);
  ok(res, result);
}

