import { Request, Response } from 'express';
import { ok, created } from '../../shared/utils/response';
import * as svc from './voice.service';

// Voice Samples
export async function uploadSample(req: Request, res: Response) {
  const sample = await svc.uploadSample(req.user!.id, req.params.patientId, req.body);
  created(res, { sample });
}
export async function listSamples(req: Request, res: Response) {
  const samples = await svc.getSamples(req.params.patientId);
  ok(res, { samples });
}
export async function removeSample(req: Request, res: Response) {
  await svc.deleteSample(req.params.id, req.user!.id);
  ok(res, { message: 'Sample removed. Consent record retained.' });
}

// Voice Messages
export async function sendManualMessage(req: Request, res: Response) {
  const msg = await svc.sendManualMessage(req.user!.id, req.params.patientId, req.body);
  created(res, { message: msg });
}
export async function listMessages(req: Request, res: Response) {
  const { limit = '20', cursor } = req.query as any;
  const result = await svc.getMessages(req.params.patientId, parseInt(limit), cursor);
  ok(res, result);
}

// Faces
export async function addFace(req: Request, res: Response) {
  const face = await svc.addFace(req.user!.id, req.params.patientId, req.body);
  created(res, { face });
}
export async function listFaces(req: Request, res: Response) {
  const faces = await svc.getFaces(req.params.patientId);
  ok(res, { faces });
}

// Stories
export async function postStory(req: Request, res: Response) {
  const story = await svc.postStory(req.user!.id, req.params.patientId, req.body);
  created(res, { story });
}
export async function listStories(req: Request, res: Response) {
  const { limit = '10', cursor } = req.query as any;
  const result = await svc.getStories(req.params.patientId, parseInt(limit), cursor);
  ok(res, result);
}
export async function reactStory(req: Request, res: Response) {
  const story = await svc.reactToStory(req.params.id, req.user!.id);
  ok(res, { story });
}

// Memories
export async function addMemory(req: Request, res: Response) {
  const mem = await svc.addMemory(req.user!.id, req.params.patientId, req.body);
  created(res, { memory: mem });
}
export async function getDailyMemory(req: Request, res: Response) {
  const memory = await svc.getDailyMemory(req.params.patientId);
  ok(res, { memory });
}
