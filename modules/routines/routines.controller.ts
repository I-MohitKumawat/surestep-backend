import { Request, Response } from 'express';
import { ok, created } from '../../shared/utils/response';
import * as svc from './routines.service';

export async function getTemplates(req: Request, res: Response) {
  const templates = await svc.getTemplates(req.user!.id);
  ok(res, { templates });
}

export async function createTemplate(req: Request, res: Response) {
  const template = await svc.createTemplate(req.user!.id, req.body);
  created(res, { template });
}

export async function assignTemplate(req: Request, res: Response) {
  const task = await svc.assignTemplate(req.params.id, req.user!.id, req.body);
  created(res, { task });
}

export async function getTodayTasks(req: Request, res: Response) {
  const tasks = await svc.getTodayTasks(req.params.patientId);
  ok(res, { tasks });
}

export async function getTaskHistory(req: Request, res: Response) {
  const { from = '', to = '', limit = '20', cursor } = req.query as any;
  const today = new Date().toISOString().split('T')[0];
  const result = await svc.getTaskHistory(
    req.params.patientId,
    from || '2020-01-01',
    to || today,
    parseInt(limit),
    cursor,
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

export async function completeTask(req: Request, res: Response) {
  const task = await svc.markTaskComplete(req.params.id, req.user!.id);
  ok(res, { task });
}

export async function unsureTask(req: Request, res: Response) {
  const task = await svc.markTaskUnsure(req.params.id, req.user!.id);
  ok(res, { task });
}
