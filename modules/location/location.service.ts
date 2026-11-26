import pool from '../../db/config';
import { haversineMetres } from '../../shared/utils/helpers';
import { AppError } from '../../shared/errors/AppError';
import { computeLocationFreshness } from '../../shared/utils/locationFreshness';

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
    `SELECT lp.*,
            ps.safety_state, ps.location_state, ps.sos_active,
            ps.battery_pct AS state_battery_pct, ps.network_status AS state_network_status,
            sz.name AS zone_name,
            (
              SELECT COUNT(*)::int
              FROM safe_zone_monitors szm
              JOIN safe_zones sz2 ON sz2.id = szm.safe_zone_id
              JOIN care_circles c2 ON sz2.circle_id = c2.id
              WHERE szm.patient_id = lp.patient_id
                AND sz2.is_active = TRUE
                AND c2.terminated_at IS NULL
            ) AS monitored_zone_count
     FROM location_pings lp
     LEFT JOIN patient_states ps ON ps.patient_id = lp.patient_id
     LEFT JOIN safe_zones sz ON sz.id = ps.last_known_zone_id
     WHERE lp.patient_id = $1
     ORDER BY lp.recorded_at DESC
     LIMIT 1`,
    [patientId],
  );
  const row = result.rows[0];
  if (!row) return null;

  const freshness = computeLocationFreshness(row.recorded_at, row.accuracy_m);
  const monitoredZoneCount = Number(row.monitored_zone_count ?? 0);
  const hasActiveSafeZone = monitoredZoneCount > 0;
  const zoneName = hasActiveSafeZone ? (row.zone_name ?? null) : null;

  return {
    ...row,
    latitude: row.lat != null ? Number(row.lat) : null,
    longitude: row.lng != null ? Number(row.lng) : null,
    accuracy_meters: row.accuracy_m != null ? Number(row.accuracy_m) : null,
    battery_pct: row.battery_pct ?? row.state_battery_pct ?? null,
    network_status: row.network_status ?? row.state_network_status ?? null,
    last_ping_at: row.recorded_at ?? null,
    freshness_tier: freshness.freshness_tier,
    location_freshness: freshness.freshness_tier,
    is_low_confidence: freshness.is_low_confidence,
    monitored_zone_count: monitoredZoneCount,
    has_active_safe_zone: hasActiveSafeZone,
    current_zone_name: freshness.freshness_tier === 'CURRENT' ? zoneName : null,
    last_known_zone_name: zoneName,
  };
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

// ─── Geofence Evaluation (called by Awareness Engine) ────────────────────────

export async function evaluateGeofence(
  patientId: string,
  lat: number,
  lng: number,
  accuracyM?: number | null,
): Promise<{
  state: string;
  breachedZones: any[];
  approachingZones: any[];
  activeZone?: any;
  monitoredZoneCount: number;
  confirmedInside: boolean;
  boundaryUncertain: boolean;
}> {
  // Query canonical Care Circle safe zones monitored for this patient
  const zones = await pool.query(
    `SELECT sz.id, sz.circle_id, sz.name AS label, sz.center_lat, sz.center_lng, sz.radius_meters AS radius_m,
            10 AS approach_threshold_pct
     FROM safe_zones sz
     JOIN safe_zone_monitors szm ON sz.id = szm.safe_zone_id
     JOIN care_circles c ON sz.circle_id = c.id
     WHERE szm.patient_id = $1 AND sz.is_active = TRUE AND c.terminated_at IS NULL`,
    [patientId],
  );

  const accuracy = accuracyM != null && Number.isFinite(Number(accuracyM)) && Number(accuracyM) > 0
    ? Number(accuracyM)
    : 0;
  const isLowConfidence = accuracy > 50;

  let insideAny = false;
  const breachedZones: any[] = [];
  const approachingZones: any[] = [];
  const insideZones: any[] = [];
  const confirmedInsideZones: any[] = [];

  for (const zone of zones.rows) {
    const dist = haversineMetres(lat, lng, zone.center_lat, zone.center_lng);
    const radius = Number(zone.radius_m);
    const threshold = radius * (zone.approach_threshold_pct / 100);

    if (dist <= radius) {
      insideAny = true;
      insideZones.push({ ...zone, distance_m: dist });
      // Containment is confirmed only when confidence is acceptable AND
      // the full accuracy circle lies inside the Safe Zone boundary.
      if (!isLowConfidence && dist + accuracy <= radius) {
        confirmedInsideZones.push({ ...zone, distance_m: dist });
      }
    } else if (dist <= radius + (radius - threshold)) {
      approachingZones.push({ ...zone, distance_m: dist });
    } else {
      breachedZones.push({ ...zone, distance_m: dist });
    }
  }

  let state = 'SAFE';
  if (!insideAny && breachedZones.length > 0) state = 'BREACH';
  else if (approachingZones.length > 0) state = 'APPROACHING';

  const confirmedInside = confirmedInsideZones.length > 0;
  const boundaryUncertain =
    zones.rows.length > 0 &&
    ((insideAny && !confirmedInside) || isLowConfidence);

  // Overlapping priority rule: smallest radius (most specific zone) takes precedence
  let activeZone: any = null;
  if (confirmedInside) {
    confirmedInsideZones.sort((a, b) => Number(a.radius_m) - Number(b.radius_m));
    activeZone = confirmedInsideZones[0];
  }

  return {
    state,
    breachedZones,
    approachingZones,
    activeZone,
    monitoredZoneCount: zones.rows.length,
    confirmedInside,
    boundaryUncertain,
  };
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

  // 2. Caregivers — active assignments in a non-terminated Circle
  const caregiverRes = await pool.query(
    `SELECT u.id, u.role, u.photo_url, u.name,
            ul.lat, ul.lng, ul.recorded_at
     FROM patient_assignments pa
     JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
     JOIN care_circles c ON cr.circle_id = c.id
     JOIN users u ON u.id = cr.caregiver_id
     LEFT JOIN user_locations ul ON ul.user_id = u.id
     WHERE pa.patient_id = $1
       AND pa.is_active = TRUE
       AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
       AND c.terminated_at IS NULL
     ORDER BY pa.assigned_at DESC NULLS LAST
     LIMIT 1`,
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

  // 3. Family members — Circle Owner and members of the Patient's Circles
  const familyRes = await pool.query(
    `SELECT DISTINCT u.id, u.role, u.photo_url, u.name,
            ul.lat, ul.lng, ul.recorded_at
     FROM patient_circle_associations pca
     JOIN care_circles c ON pca.circle_id = c.id AND c.terminated_at IS NULL
     JOIN users u ON u.role = 'FAMILY'
       AND (
         u.id = c.owner_id
         OR EXISTS (
           SELECT 1 FROM care_circle_members m
           WHERE m.circle_id = c.id AND m.user_id = u.id
         )
       )
     LEFT JOIN user_locations ul ON ul.user_id = u.id
     WHERE pca.patient_id = $1
     ORDER BY u.name`,
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
