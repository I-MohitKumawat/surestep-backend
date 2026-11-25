import { Request, Response } from 'express';
import { ok, created } from '../../shared/utils/response';
import { z } from 'zod';
import * as svc from './location.service';
import { evaluateAwareness } from '../awareness/awareness.service';
import { sendSilentLocationRequest } from '../notifications/fcm.service';
import pool from '../../db/config';
import { AppError } from '../../shared/errors/AppError';

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

const ObservationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyMeters: z.number().positive().max(10000).optional(),
  accuracy_m: z.number().positive().max(10000).optional(),
  altitudeMeters: z.number().optional(),
  batteryPct: z.number().int().min(0).max(100).optional(),
  isCharging: z.boolean().optional(),
  recordedAt: z.string().datetime().optional(),
  recorded_at: z.string().datetime().optional(),
});

export async function recordObservation(req: Request, res: Response) {
  // Identity invariant: observations are emitted by the Patient's own device.
  // A caller may never nominate another Patient's UUID.
  if (req.user!.role !== 'PATIENT') {
    throw new AppError(
      'OBSERVATION_SELF_ONLY',
      'Location observations may only be submitted by the Patient for their own device',
      403,
    );
  }

  const patientId = req.params.patientId ?? req.user!.id;
  if (patientId !== req.user!.id) {
    throw new AppError(
      'OBSERVATION_SELF_ONLY',
      'Location observations may only be submitted for the authenticated Patient',
      403,
    );
  }

  const body = ObservationSchema.parse(req.body);
  const { authoritativeSafeZonesService } = await import('./authoritative-safe-zones.service');
  const result = await authoritativeSafeZonesService.ingestLocationObservation(patientId, {
    lat: body.lat,
    lng: body.lng,
    accuracyMeters: body.accuracyMeters ?? body.accuracy_m ?? 10,
    altitudeMeters: body.altitudeMeters ?? null,
    batteryPct: body.batteryPct ?? null,
    isCharging: body.isCharging ?? false,
    recordedAt: body.recordedAt ?? body.recorded_at ?? new Date().toISOString(),
  });
  created(res, result);
}

export async function ping(req: Request, res: Response) {
  const data = PingSchema.parse(req.body);

  if (req.user!.role === 'PATIENT') {
    const ping = await svc.recordPing(req.user!.id, data);

    // Fire authoritative Safe Zone evaluation and awareness asynchronously
    setImmediate(async () => {
      try {
        const { authoritativeSafeZonesService } = await import('./authoritative-safe-zones.service');
        await authoritativeSafeZonesService.ingestLocationObservation(req.user!.id, {
          lat: data.lat,
          lng: data.lng,
          accuracyMeters: data.accuracy_m || 10,
          batteryPct: data.battery_pct,
          recordedAt: data.recorded_at,
        });
      } catch (e) {
        console.error('[SafeZone eval error]', e);
      }

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

    // Resolve canonically associated patients for broadcasting
    let patientIds: string[] = [];
    if (req.user!.role === 'CAREGIVER') {
      const cgRes = await pool.query(
        `SELECT DISTINCT pa.patient_id
         FROM patient_assignments pa
         JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
         JOIN care_circles c ON cr.circle_id = c.id
         WHERE cr.caregiver_id = $1
           AND pa.is_active = TRUE
           AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
           AND c.terminated_at IS NULL`,
        [req.user!.id]
      );
      patientIds = cgRes.rows.map((r: any) => r.patient_id);
    } else {
      const famRes = await pool.query(
        `SELECT DISTINCT pca.patient_id
         FROM patient_circle_associations pca
         JOIN care_circles c ON pca.circle_id = c.id
         WHERE c.terminated_at IS NULL
           AND (
             c.owner_id = $1
             OR EXISTS (
               SELECT 1 FROM care_circle_members m
               WHERE m.circle_id = c.id AND m.user_id = $1
             )
           )`,
        [req.user!.id]
      );
      patientIds = famRes.rows.map((r: any) => r.patient_id);
    }

    try {
      const { io } = await import('../../server');
      for (const pid of patientIds) {
        io.to(`patient:${pid}`).emit('care-circle:location-update', {
          patient_id: pid,
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
      let patientIds: string[] = [];
      if (req.user!.role === 'CAREGIVER') {
        const cgRes = await pool.query(
          `SELECT DISTINCT pa.patient_id
           FROM patient_assignments pa
           JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
           JOIN care_circles c ON cr.circle_id = c.id
           WHERE cr.caregiver_id = $1
             AND pa.is_active = TRUE
             AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
             AND c.terminated_at IS NULL`,
          [req.user!.id]
        );
        patientIds = cgRes.rows.map((r: any) => r.patient_id);
      } else {
        const famRes = await pool.query(
          `SELECT DISTINCT pca.patient_id
           FROM patient_circle_associations pca
           JOIN care_circles c ON pca.circle_id = c.id
           WHERE c.terminated_at IS NULL
             AND (
               c.owner_id = $1
               OR EXISTS (
                 SELECT 1 FROM care_circle_members m
                 WHERE m.circle_id = c.id AND m.user_id = $1
               )
             )`,
          [req.user!.id]
        );
        patientIds = famRes.rows.map((r: any) => r.patient_id);
      }

      try {
        const { io } = await import('../../server');
        for (const pid of patientIds) {
          io.to(`patient:${pid}`).emit('care-circle:location-update', {
            patient_id: pid,
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

export async function getCareCircleMap(req: Request, res: Response) {
  const result = await svc.getCareCircleMapLocations(req.params.patientId);
  ok(res, result);
}
