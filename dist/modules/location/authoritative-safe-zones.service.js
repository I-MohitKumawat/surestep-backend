"use strict";
/**
 * SureStep — modules/location/authoritative-safe-zones.service.ts
 *
 * Authoritative Care Circle Safe Zones & Location Telemetry Service.
 * Baselines:
 *   - docs/architecture/TARGET_ARCHITECTURE.md (Sections 3.5, 4.3, 6.1, 6.2)
 *   - docs/workflows/08-LOCATION-AND-SAFE-ZONES.md
 *
 * Invariants:
 *   - Safe Zones are owned by the Care Circle (safe_zones.circle_id).
 *   - Managed strictly by Circle Owner only in V1 (create, edit, delete, attach/detach patients).
 *   - Non-Owner members and caregivers receive 403 Forbidden.
 *   - Stale/offline telemetry (> 20 min or accuracy > 50m) NEVER generates Safe Zone breach alerts.
 *   - Stored in location_observations for historical audit/activity only.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authoritativeSafeZonesService = exports.AuthoritativeSafeZonesService = void 0;
const config_1 = __importDefault(require("../../db/config"));
const AppError_1 = require("../../shared/errors/AppError");
class AuthoritativeSafeZonesService {
    /**
     * 1. Create a Safe Zone for a Care Circle (Circle Owner only)
     */
    async createSafeZone(circleId, actorId, dto) {
        if (!dto.name || dto.name.trim().length < 2) {
            throw new AppError_1.AppError('VALIDATION_ERROR', 'Safe zone name must be at least 2 characters', 400);
        }
        if (dto.radiusMeters < 50 || dto.radiusMeters > 10000) {
            throw new AppError_1.AppError('VALIDATION_ERROR', 'Radius must be between 50 and 10,000 meters', 400);
        }
        if (dto.centerLat < -90 || dto.centerLat > 90 || dto.centerLng < -180 || dto.centerLng > 180) {
            throw new AppError_1.AppError('VALIDATION_ERROR', 'Invalid latitude or longitude coordinates', 400);
        }
        const client = await config_1.default.connect();
        try {
            await client.query('BEGIN');
            // 1. Verify Circle exists and is active
            const circleRes = await client.query('SELECT owner_id, terminated_at FROM care_circles WHERE id = $1', [circleId]);
            const circle = circleRes.rows[0];
            if (!circle || circle.terminated_at) {
                throw new AppError_1.AppError('CIRCLE_NOT_FOUND', 'Active Care Circle not found', 404);
            }
            // Owner check: strictly Circle Owner only
            if (circle.owner_id !== actorId) {
                throw new AppError_1.AppError('OWNER_ONLY', 'Only the Circle Owner can create Safe Zones in V1', 403);
            }
            // 2. Insert safe_zone
            const zoneRes = await client.query(`INSERT INTO safe_zones (
           circle_id, name, center_lat, center_lng, radius_meters, is_active, created_by
         ) VALUES ($1, $2, $3, $4, $5, TRUE, $6)
         RETURNING *`, [circleId, dto.name.trim(), dto.centerLat, dto.centerLng, dto.radiusMeters, actorId]);
            const zone = zoneRes.rows[0];
            // 3. Attach monitored patients if specified
            const attachedPatients = [];
            if (dto.monitoredPatientIds && dto.monitoredPatientIds.length > 0) {
                for (const patientId of dto.monitoredPatientIds) {
                    // Verify patient belongs to this Circle
                    const checkAssoc = await client.query('SELECT 1 FROM patient_circle_associations WHERE circle_id = $1 AND patient_id = $2', [circleId, patientId]);
                    if (checkAssoc.rows.length === 0) {
                        throw new AppError_1.AppError('PATIENT_NOT_IN_CIRCLE', `Patient ${patientId} is not associated with this Care Circle`, 400);
                    }
                    await client.query(`INSERT INTO safe_zone_monitors (safe_zone_id, patient_id)
             VALUES ($1, $2)
             ON CONFLICT (safe_zone_id, patient_id) DO NOTHING`, [zone.id, patientId]);
                    attachedPatients.push(patientId);
                }
            }
            await client.query('COMMIT');
            return { ...zone, monitored_patients: attachedPatients };
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * 2. Update a Safe Zone (Circle Owner only)
     */
    async updateSafeZone(circleId, zoneId, actorId, dto) {
        const client = await config_1.default.connect();
        try {
            await client.query('BEGIN');
            const circleRes = await client.query('SELECT owner_id, terminated_at FROM care_circles WHERE id = $1', [circleId]);
            const circle = circleRes.rows[0];
            if (!circle || circle.terminated_at) {
                throw new AppError_1.AppError('CIRCLE_NOT_FOUND', 'Active Care Circle not found', 404);
            }
            if (circle.owner_id !== actorId) {
                throw new AppError_1.AppError('OWNER_ONLY', 'Only the Circle Owner can update Safe Zones in V1', 403);
            }
            const zoneCheck = await client.query('SELECT * FROM safe_zones WHERE id = $1 AND circle_id = $2 FOR UPDATE', [zoneId, circleId]);
            const zone = zoneCheck.rows[0];
            if (!zone) {
                throw new AppError_1.AppError('NOT_FOUND', 'Safe Zone not found in this Care Circle', 404);
            }
            const name = dto.name !== undefined ? dto.name.trim() : zone.name;
            const lat = dto.centerLat !== undefined ? dto.centerLat : zone.center_lat;
            const lng = dto.centerLng !== undefined ? dto.centerLng : zone.center_lng;
            const radius = dto.radiusMeters !== undefined ? dto.radiusMeters : zone.radius_meters;
            const active = dto.isActive !== undefined ? dto.isActive : zone.is_active;
            if (name.length < 2) {
                throw new AppError_1.AppError('VALIDATION_ERROR', 'Safe zone name must be at least 2 characters', 400);
            }
            if (radius < 50 || radius > 10000) {
                throw new AppError_1.AppError('VALIDATION_ERROR', 'Radius must be between 50 and 10,000 meters', 400);
            }
            const updateRes = await client.query(`UPDATE safe_zones
         SET name = $1, center_lat = $2, center_lng = $3, radius_meters = $4, is_active = $5, updated_at = NOW()
         WHERE id = $6 AND circle_id = $7
         RETURNING *`, [name, lat, lng, radius, active, zoneId, circleId]);
            await client.query('COMMIT');
            return updateRes.rows[0];
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * 3. Delete / Deactivate a Safe Zone (Circle Owner only)
     */
    async deleteSafeZone(circleId, zoneId, actorId) {
        const circleRes = await config_1.default.query('SELECT owner_id, terminated_at FROM care_circles WHERE id = $1', [circleId]);
        const circle = circleRes.rows[0];
        if (!circle || circle.terminated_at) {
            throw new AppError_1.AppError('CIRCLE_NOT_FOUND', 'Active Care Circle not found', 404);
        }
        if (circle.owner_id !== actorId) {
            throw new AppError_1.AppError('OWNER_ONLY', 'Only the Circle Owner can delete Safe Zones in V1', 403);
        }
        const res = await config_1.default.query(`UPDATE safe_zones SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND circle_id = $2
       RETURNING id, name, is_active`, [zoneId, circleId]);
        if (!res.rows[0]) {
            throw new AppError_1.AppError('NOT_FOUND', 'Safe Zone not found in this Care Circle', 404);
        }
        return res.rows[0];
    }
    /**
     * 4. Attach a Patient to a Safe Zone (Circle Owner only)
     */
    async attachPatient(circleId, zoneId, patientId, actorId) {
        const circleRes = await config_1.default.query('SELECT owner_id, terminated_at FROM care_circles WHERE id = $1', [circleId]);
        const circle = circleRes.rows[0];
        if (!circle || circle.terminated_at) {
            throw new AppError_1.AppError('CIRCLE_NOT_FOUND', 'Active Care Circle not found', 404);
        }
        if (circle.owner_id !== actorId) {
            throw new AppError_1.AppError('OWNER_ONLY', 'Only the Circle Owner can manage Safe Zone monitored patients', 403);
        }
        const zoneCheck = await config_1.default.query('SELECT id FROM safe_zones WHERE id = $1 AND circle_id = $2', [zoneId, circleId]);
        if (!zoneCheck.rows[0]) {
            throw new AppError_1.AppError('NOT_FOUND', 'Safe Zone not found in this Care Circle', 404);
        }
        const assocCheck = await config_1.default.query('SELECT 1 FROM patient_circle_associations WHERE circle_id = $1 AND patient_id = $2', [circleId, patientId]);
        if (!assocCheck.rows[0]) {
            throw new AppError_1.AppError('PATIENT_NOT_IN_CIRCLE', 'Target patient is not associated with this Care Circle', 400);
        }
        const res = await config_1.default.query(`INSERT INTO safe_zone_monitors (safe_zone_id, patient_id)
       VALUES ($1, $2)
       ON CONFLICT (safe_zone_id, patient_id) DO NOTHING
       RETURNING *`, [zoneId, patientId]);
        return res.rows[0] || { safe_zone_id: zoneId, patient_id: patientId, already_attached: true };
    }
    /**
     * 5. Detach a Patient from a Safe Zone (Circle Owner only)
     */
    async detachPatient(circleId, zoneId, patientId, actorId) {
        const circleRes = await config_1.default.query('SELECT owner_id, terminated_at FROM care_circles WHERE id = $1', [circleId]);
        const circle = circleRes.rows[0];
        if (!circle || circle.terminated_at) {
            throw new AppError_1.AppError('CIRCLE_NOT_FOUND', 'Active Care Circle not found', 404);
        }
        if (circle.owner_id !== actorId) {
            throw new AppError_1.AppError('OWNER_ONLY', 'Only the Circle Owner can manage Safe Zone monitored patients', 403);
        }
        const res = await config_1.default.query(`DELETE FROM safe_zone_monitors
       WHERE safe_zone_id = $1 AND patient_id = $2
       RETURNING id`, [zoneId, patientId]);
        return { detached: res.rows.length > 0 };
    }
    /**
     * 6. List Safe Zones for a Circle
     */
    async listCircleSafeZones(circleId) {
        const res = await config_1.default.query(`SELECT sz.*,
              COALESCE(
                json_agg(
                  json_build_object(
                    'patient_id', szm.patient_id,
                    'patient_name', u.name
                  )
                ) FILTER (WHERE szm.patient_id IS NOT NULL),
                '[]'::json
              ) as monitored_patients
       FROM safe_zones sz
       LEFT JOIN safe_zone_monitors szm ON sz.id = szm.safe_zone_id
       LEFT JOIN users u ON szm.patient_id = u.id
       WHERE sz.circle_id = $1
       GROUP BY sz.id
       ORDER BY sz.created_at ASC`, [circleId]);
        return res.rows;
    }
    /**
     * 7. Record Location Observation and Evaluate Safe Zones
     * Invariant (TARGET_ARCHITECTURE.md §6.1):
     *   - Stale / offline telemetry (> 20 min or accuracy > 50m) NEVER generates breach alerts.
     *   - Normal monitoring resumes when fresh telemetry arrives.
     */
    async ingestLocationObservation(patientId, dto) {
        const recordedAt = new Date(dto.recordedAt);
        const now = Date.now();
        const ageMinutes = (now - recordedAt.getTime()) / (1000 * 60);
        // 1. Determine Freshness Tier
        let freshnessTier;
        if (ageMinutes <= 5 && dto.accuracyMeters <= 50) {
            freshnessTier = 'CURRENT';
        }
        else if (ageMinutes <= 20) {
            freshnessTier = 'RECENT';
        }
        else {
            freshnessTier = 'STALE';
        }
        // 2. Persist in location_observations (historical time-series)
        const insertRes = await config_1.default.query(`INSERT INTO location_observations (
         patient_id, lat, lng, accuracy_meters, altitude_meters, battery_pct, is_charging, recorded_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`, [
            patientId,
            dto.lat,
            dto.lng,
            dto.accuracyMeters,
            dto.altitudeMeters || null,
            dto.batteryPct || null,
            dto.isCharging || false,
            recordedAt.toISOString(),
        ]);
        const observation = insertRes.rows[0];
        // 3. Safe Zone Evaluation
        // INVARIANT: SureStep must NOT generate a Safe Zone breach alert from stale or offline data
        if (freshnessTier !== 'CURRENT') {
            return {
                observation,
                freshnessTier,
                monitoringActive: false,
                breachAlertGenerated: false,
                reason: `Observation age (${ageMinutes.toFixed(1)}m) or accuracy (${dto.accuracyMeters}m) exceeds freshness threshold. Retrospective breach evaluation suppressed.`,
            };
        }
        // Evaluate against active monitored safe zones
        const zonesRes = await config_1.default.query(`SELECT sz.*, c.id as circle_id
       FROM safe_zones sz
       JOIN safe_zone_monitors szm ON sz.id = szm.safe_zone_id
       JOIN care_circles c ON sz.circle_id = c.id
       WHERE szm.patient_id = $1 AND sz.is_active = TRUE AND c.terminated_at IS NULL`, [patientId]);
        const triggeredAlerts = [];
        for (const zone of zonesRes.rows) {
            const distanceMeters = haversineDistance(dto.lat, dto.lng, zone.center_lat, zone.center_lng);
            // Patient is outside the safe zone boundary
            if (distanceMeters > zone.radius_meters) {
                // Anti-flapping check: breach distance must exceed 1.5 * accuracy or consecutive breaches
                const exitDistance = distanceMeters - zone.radius_meters;
                if (exitDistance > 1.5 * dto.accuracyMeters) {
                    const dedupKey = `BREACH_${zone.id}_${patientId}_${recordedAt.toISOString().slice(0, 16)}`;
                    const alertRes = await config_1.default.query(`INSERT INTO safety_alerts (
               circle_id, patient_id, alert_type, status, trigger_lat, trigger_lng, safe_zone_id, dedup_key
             ) VALUES ($1, $2, 'ZONE_BREACH', 'TRIGGERED', $3, $4, $5, $6)
             ON CONFLICT (dedup_key) DO NOTHING
             RETURNING *`, [zone.circle_id, patientId, dto.lat, dto.lng, zone.id, dedupKey]);
                    if (alertRes.rows[0]) {
                        triggeredAlerts.push(alertRes.rows[0]);
                    }
                }
            }
        }
        return {
            observation,
            freshnessTier,
            monitoringActive: true,
            breachAlertGenerated: triggeredAlerts.length > 0,
            triggeredAlerts,
        };
    }
}
exports.AuthoritativeSafeZonesService = AuthoritativeSafeZonesService;
/**
 * Haversine formula to compute great-circle distance between two points on Earth in meters.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) *
            Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
exports.authoritativeSafeZonesService = new AuthoritativeSafeZonesService();
//# sourceMappingURL=authoritative-safe-zones.service.js.map