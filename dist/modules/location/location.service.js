"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordPing = recordPing;
exports.getCurrentLocation = getCurrentLocation;
exports.getLocationTrail = getLocationTrail;
exports.evaluateGeofence = evaluateGeofence;
exports.upsertUserLocation = upsertUserLocation;
exports.getCareCircleMapLocations = getCareCircleMapLocations;
const config_1 = __importDefault(require("../../db/config"));
const helpers_1 = require("../../shared/utils/helpers");
// ─── Ping Ingestion ───────────────────────────────────────────────────────────
async function recordPing(patientId, data) {
    const result = await config_1.default.query(`INSERT INTO location_pings
       (patient_id, lat, lng, accuracy_m, source, speed_kmh, heading, battery_pct, network_status, recorded_at, is_offline_sync)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`, [
        patientId, data.lat, data.lng, data.accuracy_m ?? null,
        data.source ?? 'PHONE', data.speed_kmh ?? null, data.heading ?? null,
        data.battery_pct ?? null, data.network_status ?? null, data.recorded_at, data.is_offline_sync ?? false,
    ]);
    return result.rows[0];
}
// ─── Trail & Current ──────────────────────────────────────────────────────────
async function getCurrentLocation(patientId) {
    const result = await config_1.default.query(`SELECT * FROM location_pings WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 1`, [patientId]);
    return result.rows[0] ?? null;
}
async function getLocationTrail(patientId, limit = 100, cursor) {
    let query = `SELECT * FROM location_pings WHERE patient_id = $1`;
    const params = [patientId];
    if (cursor) {
        query += ` AND recorded_at < $2`;
        params.push(cursor);
    }
    query += ` ORDER BY recorded_at DESC LIMIT $${params.length + 1}`;
    params.push(limit + 1);
    const result = await config_1.default.query(query, params);
    const has_more = result.rows.length > limit;
    const pings = has_more ? result.rows.slice(0, limit) : result.rows;
    return { pings, has_more, next_cursor: has_more ? pings[pings.length - 1].recorded_at : null };
}
// ─── Geofence Evaluation (called by Awareness Engine) ────────────────────────
async function evaluateGeofence(patientId, lat, lng) {
    // Query canonical Care Circle safe zones monitored for this patient
    const zones = await config_1.default.query(`SELECT sz.id, sz.circle_id, sz.name AS label, sz.center_lat, sz.center_lng, sz.radius_meters AS radius_m,
            10 AS approach_threshold_pct
     FROM safe_zones sz
     JOIN safe_zone_monitors szm ON sz.id = szm.safe_zone_id
     JOIN care_circles c ON sz.circle_id = c.id
     WHERE szm.patient_id = $1 AND sz.is_active = TRUE AND c.terminated_at IS NULL`, [patientId]);
    let insideAny = false;
    const breachedZones = [];
    const approachingZones = [];
    const insideZones = [];
    for (const zone of zones.rows) {
        const dist = (0, helpers_1.haversineMetres)(lat, lng, zone.center_lat, zone.center_lng);
        const threshold = zone.radius_m * (zone.approach_threshold_pct / 100);
        if (dist <= zone.radius_m) {
            insideAny = true;
            insideZones.push({ ...zone, distance_m: dist });
        }
        else if (dist <= zone.radius_m + (zone.radius_m - threshold)) {
            approachingZones.push({ ...zone, distance_m: dist });
        }
        else {
            breachedZones.push({ ...zone, distance_m: dist });
        }
    }
    let state = 'SAFE';
    if (!insideAny && breachedZones.length > 0)
        state = 'BREACH';
    else if (approachingZones.length > 0)
        state = 'APPROACHING';
    // Overlapping priority rule: smallest radius (most specific zone) takes precedence
    let activeZone = null;
    if (insideAny && insideZones.length > 0) {
        insideZones.sort((a, b) => Number(a.radius_m) - Number(b.radius_m));
        activeZone = insideZones[0];
    }
    return { state, breachedZones, approachingZones, activeZone };
}
async function upsertUserLocation(userId, data) {
    await config_1.default.query(`INSERT INTO user_locations
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
       updated_at = NOW()`, [
        userId,
        data.lat,
        data.lng,
        data.accuracy_m ?? null,
        data.speed_kmh ?? null,
        data.heading ?? null,
        data.battery_pct ?? null,
        data.recorded_at,
    ]);
}
async function getCareCircleMapLocations(patientId) {
    // 1. Patient location
    const patientRes = await config_1.default.query(`SELECT u.id, u.role, u.photo_url, u.name, 
            ps.last_known_lat AS lat, ps.last_known_lng AS lng, ps.last_ping_at AS recorded_at
     FROM users u
     LEFT JOIN patient_states ps ON ps.patient_id = u.id
     WHERE u.id = $1 AND u.role = 'PATIENT'`, [patientId]);
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
    const caregiverRes = await config_1.default.query(`SELECT u.id, u.role, u.photo_url, u.name,
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
     LIMIT 1`, [patientId]);
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
    const familyRes = await config_1.default.query(`SELECT DISTINCT u.id, u.role, u.photo_url, u.name,
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
     ORDER BY u.name`, [patientId]);
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
//# sourceMappingURL=location.service.js.map