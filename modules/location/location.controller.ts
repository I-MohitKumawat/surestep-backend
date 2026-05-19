import { Request, Response } from 'express';
import { ok, created } from '../../shared/utils/response';
import { z } from 'zod';
import * as svc from './location.service';
import { evaluateAwareness } from '../awareness/awareness.service';

const PingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy_m: z.number().optional(),
  source: z.enum(['PHONE','WEARABLE','GLASS','MANUAL']).optional(),
  speed_kmh: z.number().optional(),
  heading: z.number().optional(),
  battery_pct: z.number().int().min(0).max(100).optional(),
  recorded_at: z.string().datetime(),
});

export async function ping(req: Request, res: Response) {
  const data = PingSchema.parse(req.body);
  const ping = await svc.recordPing(req.user!.id, data);

  // Fire awareness evaluation asynchronously (don't block the ping response)
  setImmediate(async () => {
    try {
      await evaluateAwareness(req.user!.id, data.lat, data.lng, data.speed_kmh ?? 0);
    } catch (e) {
      console.error('[Awareness eval error]', e);
    }
  });

  created(res, { ping });
}

export async function getCurrentLocation(req: Request, res: Response) {
  const location = await svc.getCurrentLocation(req.params.patientId);
  ok(res, { location });
}

export async function getTrail(req: Request, res: Response) {
  const { limit = '100', cursor } = req.query as any;
  const result = await svc.getLocationTrail(req.params.patientId, parseInt(limit), cursor);
  ok(res, result);
}

// ─── Geofence endpoints ───────────────────────────────────────────────────────

export async function listZones(req: Request, res: Response) {
  const zones = await svc.getZones(req.params.patientId);
  ok(res, { zones });
}

export async function createZone(req: Request, res: Response) {
  const zone = await svc.createZone(req.user!.id, req.params.patientId, req.body);
  created(res, { zone });
}

export async function updateZone(req: Request, res: Response) {
  const zone = await svc.updateZone(req.params.id, req.user!.id, req.body);
  ok(res, { zone });
}

export async function deleteZone(req: Request, res: Response) {
  await svc.deactivateZone(req.params.id);
  ok(res, { message: 'Zone deactivated' });
}

export async function listAlerts(req: Request, res: Response) {
  const { limit = '20', cursor } = req.query as any;
  const result = await svc.getAlerts(req.params.patientId, parseInt(limit), cursor);
  ok(res, result);
}

export async function acknowledgeAlert(req: Request, res: Response) {
  const alert = await svc.acknowledgeAlert(req.params.id, req.user!.id);
  ok(res, { alert });
}
