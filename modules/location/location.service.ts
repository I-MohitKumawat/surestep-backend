import pool from '../../db/config';
import { haversineMetres } from '../../shared/utils/helpers';
import { AppError } from '../../shared/errors/AppError';

// ─── Ping Ingestion ───────────────────────────────────────────────────────────

export async function recordPing(patientId: string, data: {
  lat: number; lng: number; accuracy_m?: number;
  source?: string; speed_kmh?: number; heading?: number;
  battery_pct?: number; network_status?: string; recorded_at: string;
  is_offline_sync?: boolean;
}) {
  const result = await pool.query(
    `INSERT INTO location_pings
       (patient_id, lat, lng, accuracy_m, source, speed_kmh, heading, battery_pct, network_status, recorded_at, is_offline_sync)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      patientId, data.lat, data.lng, data.accuracy_m ?? null,
      data.source ?? 'PHONE', data.speed_kmh ?? null, data.heading ?? null,
      data.battery_pct ?? null, data.network_status ?? null, data.recorded_at, data.is_offline_sync ?? false,
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
    `SELECT * FROM geofence_zones WHERE patient_id = $1 AND is_active = TRUE ORDER BY created_at`,
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
    `UPDATE geofence_zones SET is_active = FALSE WHERE id = $1 RETURNING id, patient_id`,
    [zoneId],
  );
  if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Zone not found', 404);
  return result.rows[0];
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
): Promise<{ state: string; breachedZones: any[]; approachingZones: any[]; activeZone?: any }> {
  const zones = await pool.query(
    `SELECT * FROM geofence_zones WHERE patient_id = $1 AND is_active = TRUE`,
    [patientId],
  );

  let insideAny = false;
  const breachedZones: any[] = [];
  const approachingZones: any[] = [];
  const insideZones: any[] = [];

  for (const zone of zones.rows) {
    const dist = haversineMetres(lat, lng, zone.center_lat, zone.center_lng);
    const threshold = zone.radius_m * (zone.approach_threshold_pct / 100);

    if (dist <= zone.radius_m) {
      insideAny = true;
      insideZones.push({ ...zone, distance_m: dist });
    } else if (dist <= zone.radius_m + (zone.radius_m - threshold)) {
      approachingZones.push({ ...zone, distance_m: dist });
    } else {
      breachedZones.push({ ...zone, distance_m: dist });
    }
  }

  let state = 'SAFE';
  if (!insideAny && breachedZones.length > 0) state = 'BREACH';
  else if (approachingZones.length > 0) state = 'APPROACHING';

  // Overlapping priority rule: smallest radius (most specific zone) takes precedence
  let activeZone: any = null;
  if (insideAny && insideZones.length > 0) {
    insideZones.sort((a, b) => Number(a.radius_m) - Number(b.radius_m));
    activeZone = insideZones[0];
  }

  return { state, breachedZones, approachingZones, activeZone };
}

export async function upsertUserLocation(userId: string, data: {
  lat: number;
  lng: number;
  accuracy_m?: number;
  speed_kmh?: number;
  heading?: number;
  battery_pct?: number;
  recorded_at: string;
}) {
  await pool.query(
    `INSERT INTO user_locations
       (user_id, lat, lng, accuracy_m, speed_kmh, heading, battery_pct, recorded_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       lat = EXCLUDED.lat,
       lng = EXCLUDED.lng,
       accuracy_m = EXCLUDED.accuracy_m,
       speed_kmh = EXCLUDED.speed_kmh,
       heading = EXCLUDED.heading,
       battery_pct = EXCLUDED.battery_pct,
       recorded_at = EXCLUDED.recorded_at,
       updated_at = NOW()`,
    [
      userId,
      data.lat,
      data.lng,
      data.accuracy_m ?? null,
      data.speed_kmh ?? null,
      data.heading ?? null,
      data.battery_pct ?? null,
      data.recorded_at,
    ]
  );
}

export async function getCareCircleMapLocations(patientId: string) {
  // 1. Patient location
  const patientRes = await pool.query(
    `SELECT u.id, u.role, u.photo_url, u.name, 
            ps.last_known_lat AS lat, ps.last_known_lng AS lng, ps.last_ping_at AS recorded_at
     FROM users u
     LEFT JOIN patient_states ps ON ps.patient_id = u.id
     WHERE u.id = $1 AND u.role = 'PATIENT'`,
    [patientId]
  );
  const patientRow = patientRes.rows[0];
  const patient = patientRow ? {
    id: patientRow.id,
    role: patientRow.role,
    photo_url: patientRow.photo_url ?? null,
    name: patientRow.name,
    lat: patientRow.lat != null ? Number(patientRow.lat) : null,
    lng: patientRow.lng != null ? Number(patientRow.lng) : null,
    recorded_at: patientRow.recorded_at ?? null,
  } : null;

  // 2. Caregivers
  const caregiverRes = await pool.query(
    `SELECT u.id, u.role, u.photo_url, u.name, 
            ul.lat, ul.lng, ul.recorded_at
     FROM patient_relationships pr
     JOIN users u ON u.id = pr.related_user_id
     LEFT JOIN user_locations ul ON ul.user_id = u.id
     WHERE pr.patient_user_id = $1 
       AND pr.status = 'CONFIRMED' 
       AND u.role = 'CAREGIVER'`,
    [patientId]
  );
  const caregiverRow = caregiverRes.rows[0];
  const caregiver = caregiverRow ? {
    id: caregiverRow.id,
    role: caregiverRow.role,
    photo_url: caregiverRow.photo_url ?? null,
    name: caregiverRow.name,
    lat: caregiverRow.lat != null ? Number(caregiverRow.lat) : null,
    lng: caregiverRow.lng != null ? Number(caregiverRow.lng) : null,
    recorded_at: caregiverRow.recorded_at ?? null,
  } : null;

  // 3. Family members
  const familyRes = await pool.query(
    `SELECT u.id, u.role, u.photo_url, u.name, 
            ul.lat, ul.lng, ul.recorded_at
     FROM patient_relationships pr
     JOIN users u ON u.id = pr.related_user_id
     LEFT JOIN user_locations ul ON ul.user_id = u.id
     WHERE pr.patient_user_id = $1 
       AND pr.status = 'CONFIRMED' 
       AND u.role = 'FAMILY'`,
    [patientId]
  );
  const familyMembers = familyRes.rows.map(row => ({
    id: row.id,
    role: row.role,
    photo_url: row.photo_url ?? null,
    name: row.name,
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    recorded_at: row.recorded_at ?? null,
  }));

  return { patient, caregiver, familyMembers };
}
