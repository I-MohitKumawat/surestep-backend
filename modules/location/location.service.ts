import pool from '../../db/config';
import { haversineMetres } from '../../shared/utils/helpers';
import { AppError } from '../../shared/errors/AppError';

// ─── Ping Ingestion ───────────────────────────────────────────────────────────

export async function recordPing(patientId: string, data: {
  lat: number; lng: number; accuracy_m?: number;
  source?: string; speed_kmh?: number; heading?: number;
  battery_pct?: number; recorded_at: string;
}) {
  const result = await pool.query(
    `INSERT INTO location_pings
       (patient_id, lat, lng, accuracy_m, source, speed_kmh, heading, battery_pct, recorded_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      patientId, data.lat, data.lng, data.accuracy_m ?? null,
      data.source ?? 'PHONE', data.speed_kmh ?? null, data.heading ?? null,
      data.battery_pct ?? null, data.recorded_at,
    ],
  );
  return result.rows[0];
}

// ─── Trail & Current ──────────────────────────────────────────────────────────

export async function getCurrentLocation(patientId: string) {
  const result = await pool.query(
    `SELECT * FROM location_pings WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
    [patientId],
  );
  return result.rows[0] ?? null;
}

export async function getLocationTrail(patientId: string, limit = 100, cursor?: string) {
  let query = `SELECT * FROM location_pings WHERE patient_id = $1`;
  const params: any[] = [patientId];
  if (cursor) { query += ` AND recorded_at < $2`; params.push(cursor); }
  query += ` ORDER BY recorded_at DESC LIMIT $${params.length + 1}`;
  params.push(limit + 1);

  const result = await pool.query(query, params);
  const has_more = result.rows.length > limit;
  const pings = has_more ? result.rows.slice(0, limit) : result.rows;
  return { pings, has_more, next_cursor: has_more ? pings[pings.length - 1].recorded_at : null };
}

// ─── Geofence Zones ───────────────────────────────────────────────────────────

export async function getZones(patientId: string) {
  const result = await pool.query(
    `SELECT * FROM geofence_zones WHERE patient_id = $1 ORDER BY is_active DESC, created_at`,
    [patientId],
  );
  return result.rows;
}

export async function createZone(creatorId: string, patientId: string, data: any) {
  const result = await pool.query(
    `INSERT INTO geofence_zones
       (patient_id, created_by, label, zone_type, center_lat, center_lng, radius_m,
        boundary_type, approach_threshold_pct, active_hours_start, active_hours_end)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      patientId, creatorId, data.label, data.zone_type ?? 'CUSTOM',
      data.center_lat, data.center_lng, data.radius_m,
      data.boundary_type ?? 'SOFT', data.approach_threshold_pct ?? 80,
      data.active_hours_start ?? null, data.active_hours_end ?? null,
    ],
  );
  return result.rows[0];
}

export async function updateZone(zoneId: string, userId: string, data: any) {
  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;

  const allowed = ['label','zone_type','center_lat','center_lng','radius_m',
                   'boundary_type','approach_threshold_pct','is_active','active_hours_start','active_hours_end'];
  for (const key of allowed) {
    if (data[key] !== undefined) { fields.push(`${key} = $${i++}`); values.push(data[key]); }
  }
  if (!fields.length) throw new AppError('VALIDATION_ERROR', 'No fields to update', 422);
  values.push(zoneId);

  const result = await pool.query(
    `UPDATE geofence_zones SET ${fields.join(',')} WHERE id = $${i} RETURNING *`,
    values,
  );
  if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Zone not found', 404);
  return result.rows[0];
}

export async function deactivateZone(zoneId: string) {
  const result = await pool.query(
    `UPDATE geofence_zones SET is_active = FALSE WHERE id = $1 RETURNING id`,
    [zoneId],
  );
  if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Zone not found', 404);
}

// ─── Geofence Alert ────────────────────────────────────────────────────────────

export async function getAlerts(patientId: string, limit = 20, cursor?: string) {
  let query = `SELECT * FROM geofence_alerts WHERE patient_id = $1`;
  const params: any[] = [patientId];
  if (cursor) { query += ` AND created_at < $2`; params.push(cursor); }
  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit + 1);

  const result = await pool.query(query, params);
  const has_more = result.rows.length > limit;
  const alerts = has_more ? result.rows.slice(0, limit) : result.rows;
  return { alerts, has_more, next_cursor: has_more ? alerts[alerts.length - 1].created_at : null };
}

export async function acknowledgeAlert(alertId: string, userId: string) {
  const result = await pool.query(
    `UPDATE geofence_alerts
     SET acknowledged_by = $1, acknowledged_at = NOW()
     WHERE id = $2 AND acknowledged_at IS NULL
     RETURNING *`,
    [userId, alertId],
  );
  if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Alert not found or already acknowledged', 404);
  return result.rows[0];
}

// ─── Geofence Evaluation (called by Awareness Engine) ────────────────────────

export async function evaluateGeofence(
  patientId: string,
  lat: number,
  lng: number,
): Promise<{ state: string; breachedZones: any[]; approachingZones: any[] }> {
  const zones = await pool.query(
    `SELECT * FROM geofence_zones WHERE patient_id = $1 AND is_active = TRUE`,
    [patientId],
  );

  let insideAny = false;
  const breachedZones: any[] = [];
  const approachingZones: any[] = [];

  for (const zone of zones.rows) {
    const dist = haversineMetres(lat, lng, zone.center_lat, zone.center_lng);
    const threshold = zone.radius_m * (zone.approach_threshold_pct / 100);

    if (dist <= zone.radius_m) {
      insideAny = true;
    } else if (dist <= zone.radius_m + (zone.radius_m - threshold)) {
      approachingZones.push({ ...zone, distance_m: dist });
    } else {
      breachedZones.push({ ...zone, distance_m: dist });
    }
  }

  let state = 'SAFE';
  if (!insideAny && breachedZones.length > 0) state = 'BREACH';
  else if (approachingZones.length > 0) state = 'APPROACHING';

  return { state, breachedZones, approachingZones };
}
