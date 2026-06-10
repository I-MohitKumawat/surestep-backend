"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordPing = recordPing;
exports.getCurrentLocation = getCurrentLocation;
exports.getLocationTrail = getLocationTrail;
exports.getZones = getZones;
exports.createZone = createZone;
exports.updateZone = updateZone;
exports.deactivateZone = deactivateZone;
exports.getAlerts = getAlerts;
exports.acknowledgeAlert = acknowledgeAlert;
exports.evaluateGeofence = evaluateGeofence;
exports.upsertUserLocation = upsertUserLocation;
exports.getCareCircleMapLocations = getCareCircleMapLocations;
const config_1 = __importDefault(require("../../db/config"));
const helpers_1 = require("../../shared/utils/helpers");
const AppError_1 = require("../../shared/errors/AppError");
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
// ─── Geofence Zones ───────────────────────────────────────────────────────────
async function getZones(patientId) {
    const result = await config_1.default.query(`SELECT * FROM geofence_zones WHERE patient_id = $1 AND is_active = TRUE ORDER BY created_at`, [patientId]);
    return result.rows;
}
async function createZone(creatorId, patientId, data) {
    const result = await config_1.default.query(`INSERT INTO geofence_zones
       (patient_id, created_by, label, zone_type, center_lat, center_lng, radius_m,
        boundary_type, approach_threshold_pct, active_hours_start, active_hours_end)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`, [
        patientId, creatorId, data.label, data.zone_type ?? 'CUSTOM',
        data.center_lat, data.center_lng, data.radius_m,
        data.boundary_type ?? 'SOFT', data.approach_threshold_pct ?? 80,
        data.active_hours_start ?? null, data.active_hours_end ?? null,
    ]);
    return result.rows[0];
}
async function updateZone(zoneId, userId, data) {
    const fields = [];
    const values = [];
    let i = 1;
    const allowed = ['label', 'zone_type', 'center_lat', 'center_lng', 'radius_m',
        'boundary_type', 'approach_threshold_pct', 'is_active', 'active_hours_start', 'active_hours_end'];
    for (const key of allowed) {
        if (data[key] !== undefined) {
            fields.push(`${key} = $${i++}`);
            values.push(data[key]);
        }
    }
    if (!fields.length)
        throw new AppError_1.AppError('VALIDATION_ERROR', 'No fields to update', 422);
    values.push(zoneId);
    const result = await config_1.default.query(`UPDATE geofence_zones SET ${fields.join(',')} WHERE id = $${i} RETURNING *`, values);
    if (!result.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Zone not found', 404);
    return result.rows[0];
}
async function deactivateZone(zoneId) {
    const result = await config_1.default.query(`UPDATE geofence_zones SET is_active = FALSE WHERE id = $1 RETURNING id, patient_id`, [zoneId]);
    if (!result.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Zone not found', 404);
    return result.rows[0];
}
// ─── Geofence Alert ────────────────────────────────────────────────────────────
async function getAlerts(patientId, limit = 20, cursor) {
    let query = `SELECT * FROM geofence_alerts WHERE patient_id = $1`;
    const params = [patientId];
    if (cursor) {
        query += ` AND created_at < $2`;
        params.push(cursor);
    }
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit + 1);
    const result = await config_1.default.query(query, params);
    const has_more = result.rows.length > limit;
    const alerts = has_more ? result.rows.slice(0, limit) : result.rows;
    return { alerts, has_more, next_cursor: has_more ? alerts[alerts.length - 1].created_at : null };
}
async function acknowledgeAlert(alertId, userId) {
    const result = await config_1.default.query(`UPDATE geofence_alerts
     SET acknowledged_by = $1, acknowledged_at = NOW()
     WHERE id = $2 AND acknowledged_at IS NULL
     RETURNING *`, [userId, alertId]);
    if (!result.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Alert not found or already acknowledged', 404);
    return result.rows[0];
}
// ─── Geofence Evaluation (called by Awareness Engine) ────────────────────────
async function evaluateGeofence(patientId, lat, lng) {
    const zones = await config_1.default.query(`SELECT * FROM geofence_zones WHERE patient_id = $1 AND is_active = TRUE`, [patientId]);
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
    // 2. Caregivers
    const caregiverRes = await config_1.default.query(`SELECT u.id, u.role, u.photo_url, u.name, 
            ul.lat, ul.lng, ul.recorded_at
     FROM patient_relationships pr
     JOIN users u ON u.id = pr.related_user_id
     LEFT JOIN user_locations ul ON ul.user_id = u.id
     WHERE pr.patient_user_id = $1 
       AND pr.status = 'CONFIRMED' 
       AND u.role = 'CAREGIVER'`, [patientId]);
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
    const familyRes = await config_1.default.query(`SELECT u.id, u.role, u.photo_url, u.name, 
            ul.lat, ul.lng, ul.recorded_at
     FROM patient_relationships pr
     JOIN users u ON u.id = pr.related_user_id
     LEFT JOIN user_locations ul ON ul.user_id = u.id
     WHERE pr.patient_user_id = $1 
       AND pr.status = 'CONFIRMED' 
       AND u.role = 'FAMILY'`, [patientId]);
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