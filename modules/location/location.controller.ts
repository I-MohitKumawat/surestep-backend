import { Request, Response } from 'express';
import { ok, created } from '../../shared/utils/response';
import { z } from 'zod';
import * as svc from './location.service';
import { evaluateAwareness } from '../awareness/awareness.service';
import { sendSilentLocationRequest } from '../notifications/fcm.service';
import pool from '../../db/config';

const PingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy_m: z.number().optional(),
  source: z.enum(['PHONE','WEARABLE','GLASS','MANUAL']).optional(),
  speed_kmh: z.number().optional(),
  heading: z.number().optional(),
  battery_pct: z.number().int().min(0).max(100).optional(),
  network_status: z.string().optional(),
  recorded_at: z.string().datetime(),
});

export async function ping(req: Request, res: Response) {
  const data = PingSchema.parse(req.body);

  if (req.user!.role === 'PATIENT') {
    const ping = await svc.recordPing(req.user!.id, data);

    // Fire awareness evaluation asynchronously (don't block the ping response)
    setImmediate(async () => {
      try {
        await evaluateAwareness(
          req.user!.id,
          data.lat,
          data.lng,
          data.speed_kmh ?? 0,
          data.accuracy_m,   // GPS confidence filter
          data.battery_pct,
          data.network_status,
        );
      } catch (e) {
        console.error('[Awareness eval error]', e);
      }
    });

    created(res, { ping });
  } else {
    // Caregiver or Family
    await svc.upsertUserLocation(req.user!.id, data);

    // Broadcast to confirmed patients' rooms
    const rels = await pool.query(
      `SELECT patient_user_id FROM patient_relationships
       WHERE related_user_id = $1 AND status = 'CONFIRMED'`,
      [req.user!.id]
    );

    try {
      const { io } = await import('../../server');
      for (const rel of rels.rows) {
        io.to(`patient:${rel.patient_user_id}`).emit('care-circle:location-update', {
          patient_id: rel.patient_user_id,
          member: {
            id: req.user!.id,
            role: req.user!.role,
            photo_url: req.user!.photo_url ?? null,
            name: req.user!.name,
            lat: data.lat,
            lng: data.lng,
            recorded_at: data.recorded_at,
          }
        });
      }
    } catch (_) {}

    created(res, { success: true });
  }
}

// Batch offline sync — processes queued offline pings in chronological order
export async function batchSync(req: Request, res: Response) {
  const pings = z.array(PingSchema).max(200).parse(req.body);

  if (req.user!.role === 'PATIENT') {
    // Sort oldest-first for correct sequential awareness evaluation
    const sorted = [...pings].sort(
      (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
    );

    const saved: any[] = [];
    for (const p of sorted) {
      const row = await svc.recordPing(req.user!.id, { ...p, is_offline_sync: true });
      saved.push(row);
    }

    // Run awareness on the most recent ping only (avoids 200x DB writes)
    if (sorted.length > 0) {
      const last = sorted[sorted.length - 1]!;
      setImmediate(async () => {
        try {
          await evaluateAwareness(
            req.user!.id,
            last.lat,
            last.lng,
            last.speed_kmh ?? 0,
            last.accuracy_m,
            last.battery_pct,
            last.network_status,
          );
        } catch (e) {
          console.error('[Batch awareness eval error]', e);
        }
      });
    }

    created(res, { synced: saved.length });
  } else {
    // Caregiver or Family batch sync
    const sorted = [...pings].sort(
      (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
    );
    for (const p of sorted) {
      await svc.upsertUserLocation(req.user!.id, p);
    }

    if (sorted.length > 0) {
      const last = sorted[sorted.length - 1]!;
      const rels = await pool.query(
        `SELECT patient_user_id FROM patient_relationships
         WHERE related_user_id = $1 AND status = 'CONFIRMED'`,
        [req.user!.id]
      );
      try {
        const { io } = await import('../../server');
        for (const rel of rels.rows) {
          io.to(`patient:${rel.patient_user_id}`).emit('care-circle:location-update', {
            patient_id: rel.patient_user_id,
            member: {
              id: req.user!.id,
              role: req.user!.role,
              photo_url: req.user!.photo_url ?? null,
              name: req.user!.name,
              lat: last.lat,
              lng: last.lng,
              recorded_at: last.recorded_at,
            }
          });
        }
      } catch (_) {}
    }

    created(res, { synced: sorted.length });
  }
}

export async function getCurrentLocation(req: Request, res: Response) {
  const location = await svc.getCurrentLocation(req.params.patientId);
  ok(res, { location });
}

export async function requestLocationRefresh(req: Request, res: Response) {
  const { patientId } = req.params;

  // 1. WebSocket trigger
  try {
    const { io } = await import('../../server');
    io.to(`patient:${patientId}`).emit('location:request', { patientId });
  } catch (err) {
    console.warn('[location.controller] Socket emit failed:', err);
  }

  // 2. Silent FCM Push Notification trigger
  await sendSilentLocationRequest(patientId);

  ok(res, { message: 'Location refresh request dispatched' });
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
  try {
    const { io } = await import('../../server');
    io.to(`patient:${req.params.patientId}`).emit('geofences:change', { patientId: req.params.patientId });
  } catch (err) {
    console.warn('[location.controller] Socket emit for createZone failed:', err);
  }
  created(res, { zone });
}

export async function updateZone(req: Request, res: Response) {
  const zone = await svc.updateZone(req.params.id, req.user!.id, req.body);
  try {
    const { io } = await import('../../server');
    io.to(`patient:${zone.patient_id}`).emit('geofences:change', { patientId: zone.patient_id });
  } catch (err) {
    console.warn('[location.controller] Socket emit for updateZone failed:', err);
  }
  ok(res, { zone });
}

export async function deleteZone(req: Request, res: Response) {
  const zone = await svc.deactivateZone(req.params.id);
  try {
    const { io } = await import('../../server');
    io.to(`patient:${zone.patient_id}`).emit('geofences:change', { patientId: zone.patient_id });
  } catch (err) {
    console.warn('[location.controller] Socket emit for deleteZone failed:', err);
  }
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

export async function getCareCircleMap(req: Request, res: Response) {
  const result = await svc.getCareCircleMapLocations(req.params.patientId);
  ok(res, result);
}
