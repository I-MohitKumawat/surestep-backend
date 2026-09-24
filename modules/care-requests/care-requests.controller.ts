import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created } from '../../shared/utils/response';
import * as svc from './care-requests.service';
import {
  CreateCareRequestSchema,
  DeclineCareRequestSchema,
  WithdrawCareRequestSchema,
  IncomingCareRequestQuerySchema,
  OutgoingCareRequestQuerySchema,
} from './care-requests.types';

const RequestIdParamSchema = z.string().uuid({ message: 'Invalid care request ID format' });

export async function createCareRequest(req: Request, res: Response): Promise<void> {
  const input = CreateCareRequestSchema.parse(req.body);
  const result = await svc.createCareRequest(req.user!, input);
  created(res, { request: result });
}

export async function getIncomingCareRequests(req: Request, res: Response): Promise<void> {
  const query = IncomingCareRequestQuerySchema.parse(req.query);
  const result = await svc.getIncomingCareRequests(req.user!, query.status);
  ok(res, { requests: result });
}

export async function getOutgoingCareRequests(req: Request, res: Response): Promise<void> {
  const query = OutgoingCareRequestQuerySchema.parse(req.query);
  const result = await svc.getOutgoingCareRequests(req.user!, query.patientId, query.status);
  ok(res, { requests: result });
}

export async function getCareRequestById(req: Request, res: Response): Promise<void> {
  const requestId = RequestIdParamSchema.parse(req.params.id);
  const result = await svc.getCareRequestById(req.user!, requestId);
  ok(res, { request: result });
}

export async function acceptCareRequest(req: Request, res: Response): Promise<void> {
  const requestId = RequestIdParamSchema.parse(req.params.id);
  const result = await svc.acceptCareRequest(req.user!, requestId);
  ok(res, result);
}

export async function declineCareRequest(req: Request, res: Response): Promise<void> {
  const requestId = RequestIdParamSchema.parse(req.params.id);
  const input = DeclineCareRequestSchema.parse(req.body);
  const result = await svc.declineCareRequest(req.user!, requestId, input);
  ok(res, result);
}

export async function withdrawCareRequest(req: Request, res: Response): Promise<void> {
  const requestId = RequestIdParamSchema.parse(req.params.id);
  const input = WithdrawCareRequestSchema.parse(req.body);
  const result = await svc.withdrawCareRequest(req.user!, requestId, input);
  ok(res, result);
}
