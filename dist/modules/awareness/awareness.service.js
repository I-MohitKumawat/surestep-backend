"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateAwareness = evaluateAwareness;
exports.updateEngagement = updateEngagement;
exports.getPatientState = getPatientState;
exports.getAllPatientStates = getAllPatientStates;
exports.triggerSOS = triggerSOS;
const config_1 = __importDefault(require("../../db/config"));
const location_service_1 = require("../location/location.service");
const AppError_1 = require("../../shared/errors/AppError");
const fcm_service_1 = require("../notifications/fcm.service");
// ─── Safety state human-readable labels (for FCM push bodies) ────────────────
const STATE_LABELS = {
    ZONE_EXIT: 'has left a safe zone',
    ZONE_ENTER: 'has returned to a safe zone',
    APPROACHING_BOUNDARY: 'is approaching the boundary of a safe zone',
    STATIONARY_UNKNOWN: 'has been stationary in an unknown location',
    SOS_TRIGGERED: 'has triggered an emergency SOS',
};
/**
 * Core Awareness Engine — evaluates all 4 state dimensions for a patient
 * on every location ping. Writes result to patient_states (upsert).
 *
 * Called asynchronously from location.controller.ping — never blocks HTTP.
 *
 * Changes from v1:
 *  - GPS confidence filter: skip alert creation for accuracy_m >= 50 (Low Confidence)
 *  - ZONE_ENTER alert created when patient returns inside a zone
 *  - APPROACHING_BOUNDARY alert created for approaching zones
 *  - FCM push sent to caregivers on BREACH / CRITICAL / APPROACHING / SOS
 *  - WebSocket state:change emitted to patient room after state upsert
 */
async function evaluateAwareness(patientId, lat, lng, speed_kmh, accuracy_m, battery_pct, network_status) {
    // ─── GPS Confidence Filter (TDD §1.2) ──────────────────────────────────────
    // Low Confidence (>= 50m accuracy) pings are recorded but must not trigger alerts
    const isLowConfidence = accuracy_m !== undefined && accuracy_m >= 50;
    // ─── 1. Location State ────────────────────────────────────────────────────
    const { state: safetyEval, breachedZones, approachingZones, activeZone } = await (0, location_service_1.evaluateGeofence)(patientId, lat, lng);
    const recentPings = await config_1.default.query(`SELECT speed_kmh, recorded_at FROM location_pings
     WHERE patient_id = $1
     ORDER BY recorded_at DESC LIMIT 3`, [patientId]);
    const avgSpeed = recentPings.rows.reduce((sum, r) => sum + (r.speed_kmh || 0), 0)
        / Math.max(recentPings.rows.length, 1);
    const current = await config_1.default.query('SELECT * FROM patient_states WHERE patient_id = $1', [patientId]);
    const prev = current.rows[0];
    let location_state;
    let stationary_since = prev?.stationary_since ?? null;
    // Convert speed_kmh to m/s for comparison
    const speedMs = avgSpeed / 3.6;
    if (speedMs > 0.5) {
        location_state = 'MOVING';
        stationary_since = null;
    }
    else if (safetyEval !== 'BREACH') {
        location_state = 'STATIONARY_KNOWN';
        stationary_since = stationary_since ?? new Date().toISOString();
    }
    else {
        location_state = 'STATIONARY_UNKNOWN';
        stationary_since = stationary_since ?? new Date().toISOString();
    }
    // ─── 2. Safety State ─────────────────────────────────────────────────────
    let safety_state = safetyEval;
    // Escalate to CRITICAL if breach + stationary unknown for > 10 min with no engagement
    if (safetyEval === 'BREACH' &&
        location_state === 'STATIONARY_UNKNOWN' &&
        prev?.engagement_state === 'NO_INTERACTION') {
        const stationaryMs = stationary_since
            ? Date.now() - new Date(stationary_since).getTime()
            : 0;
        if (stationaryMs > 10 * 60 * 1000) {
            safety_state = 'CRITICAL';
        }
    }
    // ─── 3. Routine State ─────────────────────────────────────────────────────
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const tasks = await config_1.default.query(`SELECT status, is_critical, scheduled_time FROM tasks
     WHERE patient_id = $1 AND scheduled_date = $2 AND deleted_at IS NULL`, [patientId, today]);
    let routine_state = 'ON_TRACK';
    if (tasks.rows.length > 0 && tasks.rows.every((t) => t.status === 'DONE')) {
        routine_state = 'ALL_DONE';
    }
    else {
        const missedCritical = tasks.rows.some((t) => {
            if (t.status !== 'PENDING')
                return false;
            const [h, m] = t.scheduled_time.split(':').map(Number);
            const scheduled = new Date(today);
            scheduled.setHours(h, m, 0, 0);
            const overdueMs = now.getTime() - scheduled.getTime();
            return t.is_critical && overdueMs > 15 * 60 * 1000;
        });
        const anyBehind = tasks.rows.some((t) => {
            if (t.status !== 'PENDING')
                return false;
            const [h, m] = t.scheduled_time.split(':').map(Number);
            const scheduled = new Date(today);
            scheduled.setHours(h, m, 0, 0);
            return now > scheduled;
        });
        if (missedCritical)
            routine_state = 'MISSED_CRITICAL';
        else if (anyBehind)
            routine_state = 'BEHIND';
    }
    // ─── 4. Engagement State ──────────────────────────────────────────────────
    const engagement_state = prev?.engagement_state ?? 'NO_INTERACTION';
    const last_known_zone_id = activeZone ? activeZone.id : null;
    const current_zone_name = activeZone ? activeZone.label : null;
    // ─── 5. Upsert patient_states ─────────────────────────────────────────────
    await config_1.default.query(`INSERT INTO patient_states
       (patient_id, location_state, safety_state, routine_state, engagement_state,
        last_known_lat, last_known_lng, last_known_zone_id, last_ping_at, stationary_since,
        battery_pct, network_status, computed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,$10,$11,NOW())
     ON CONFLICT (patient_id) DO UPDATE SET
       location_state   = EXCLUDED.location_state,
       safety_state     = EXCLUDED.safety_state,
       routine_state    = EXCLUDED.routine_state,
       last_known_lat   = EXCLUDED.last_known_lat,
       last_known_lng   = EXCLUDED.last_known_lng,
       last_known_zone_id = EXCLUDED.last_known_zone_id,
       last_ping_at     = EXCLUDED.last_ping_at,
       stationary_since = EXCLUDED.stationary_since,
       battery_pct      = COALESCE(EXCLUDED.battery_pct, patient_states.battery_pct),
       network_status   = COALESCE(EXCLUDED.network_status, patient_states.network_status),
       computed_at      = NOW()`, [
        patientId, location_state, safety_state, routine_state, engagement_state,
        lat, lng, last_known_zone_id, stationary_since,
        battery_pct ?? null, network_status ?? null
    ]);
    // ─── 6. Fetch patient name for notification copy ──────────────────────────
    const patientRow = await config_1.default.query('SELECT name FROM users WHERE id = $1', [patientId]);
    const patientName = patientRow.rows[0]?.name ?? 'Your patient';
    const prevSafetyState = prev?.safety_state;
    // ─── 7. Alert creation & push notifications ───────────────────────────────
    // Only create alerts for High/Medium confidence GPS (TDD §1.2)
    if (!isLowConfidence) {
        // 7a. ZONE_EXIT — patient breached a zone
        for (const zone of breachedZones) {
            const severity = safety_state === 'CRITICAL' ? 'CRITICAL' : 'WARNING';
            const dedupKey = `zone_exit:${patientId}:${zone.id}:${today}`;
            const insertResult = await config_1.default.query(`INSERT INTO geofence_alerts
           (patient_id, zone_id, alert_type, severity, lat, lng, distance_from_zone_m, dedup_key)
         VALUES ($1,$2,'ZONE_EXIT',$3,$4,$5,$6,$7)
         ON CONFLICT (dedup_key) DO NOTHING
         RETURNING id`, [patientId, zone.id, severity, lat, lng, Math.round(zone.distance_m), dedupKey]);
            if (insertResult.rows[0]) {
                // Only send push if this is a new alert row (not a duplicate)
                await (0, fcm_service_1.sendToCareCircle)(patientId, {
                    title: severity === 'CRITICAL' ? '🚨 Critical Safety Alert' : '⚠️ Geofence Alert',
                    body: `${patientName} ${STATE_LABELS.ZONE_EXIT} (${zone.label}).`,
                    data: {
                        type: 'ZONE_EXIT',
                        patientId,
                        zoneId: zone.id,
                        alertId: insertResult.rows[0].id,
                        severity,
                    },
                }, 'ZONE_EXIT');
                void broadcastNewAlert(insertResult.rows[0].id, patientId);
            }
        }
        // 7b. ZONE_ENTER — patient returned inside a zone (was previously in BREACH)
        if (safetyEval === 'SAFE' && prevSafetyState && ['BREACH', 'CRITICAL'].includes(prevSafetyState)) {
            // Find the zone the patient is now inside
            const zones = await config_1.default.query(`SELECT * FROM geofence_zones WHERE patient_id = $1 AND is_active = TRUE`, [patientId]);
            const { haversineMetres } = await Promise.resolve().then(() => __importStar(require('../../shared/utils/helpers')));
            for (const zone of zones.rows) {
                const dist = haversineMetres(lat, lng, zone.center_lat, zone.center_lng);
                if (dist <= zone.radius_m) {
                    const dedupKey = `zone_enter:${patientId}:${zone.id}:${Math.floor(Date.now() / 300000)}`;
                    const insertResult = await config_1.default.query(`INSERT INTO geofence_alerts
               (patient_id, zone_id, alert_type, severity, lat, lng, distance_from_zone_m, dedup_key)
             VALUES ($1,$2,'ZONE_ENTER','INFO',$3,$4,$5,$6)
             ON CONFLICT (dedup_key) DO NOTHING
             RETURNING id`, [patientId, zone.id, lat, lng, 0, dedupKey]);
                    if (insertResult.rows[0]) {
                        await (0, fcm_service_1.sendToCareCircle)(patientId, {
                            title: '✅ Patient Returned Safely',
                            body: `${patientName} ${STATE_LABELS.ZONE_ENTER} (${zone.label}).`,
                            data: {
                                type: 'ZONE_ENTER',
                                patientId,
                                zoneId: zone.id,
                                alertId: insertResult.rows[0].id,
                            },
                        }, 'GENERAL');
                        void broadcastNewAlert(insertResult.rows[0].id, patientId);
                    }
                    break; // Only alert for the first matching zone
                }
            }
        }
        // 7c. APPROACHING_BOUNDARY — patient nearing edge of a zone
        for (const zone of approachingZones) {
            const dedupKey = `approaching:${patientId}:${zone.id}:${Math.floor(Date.now() / 600000)}`; // 10-min dedup
            const insertResult = await config_1.default.query(`INSERT INTO geofence_alerts
           (patient_id, zone_id, alert_type, severity, lat, lng, distance_from_zone_m, dedup_key)
         VALUES ($1,$2,'APPROACHING_BOUNDARY','INFO',$3,$4,$5,$6)
         ON CONFLICT (dedup_key) DO NOTHING
         RETURNING id`, [patientId, zone.id, lat, lng, Math.round(zone.radius_m - zone.distance_m + zone.radius_m), dedupKey]);
            if (insertResult.rows[0]) {
                await (0, fcm_service_1.sendToCareCircle)(patientId, {
                    title: '📍 Approaching Zone Boundary',
                    body: `${patientName} ${STATE_LABELS.APPROACHING_BOUNDARY} (${zone.label}).`,
                    data: {
                        type: 'APPROACHING_BOUNDARY',
                        patientId,
                        zoneId: zone.id,
                        alertId: insertResult.rows[0].id,
                    },
                }, 'APPROACHING_BOUNDARY');
                void broadcastNewAlert(insertResult.rows[0].id, patientId);
            }
        }
        // 7d. STATIONARY_UNKNOWN — escalate notification if > 10 min stationary outside
        if (safety_state === 'CRITICAL' && prevSafetyState !== 'CRITICAL') {
            await (0, fcm_service_1.sendToCareCircle)(patientId, {
                title: '🚨 Emergency: Patient Stationary Outside Safe Zone',
                body: `${patientName} has been stationary outside a safe zone for over 10 minutes. Immediate attention required.`,
                data: { type: 'STATIONARY_UNKNOWN', patientId },
            }, 'ZONE_EXIT');
        }
    }
    const latestBattery = battery_pct !== undefined ? battery_pct : (prev?.battery_pct ?? null);
    const latestNetwork = network_status !== undefined ? network_status : (prev?.network_status ?? null);
    // ─── 8. WebSocket state:change broadcast ─────────────────────────────────
    // Emit updated state to all caregivers/family watching this patient
    try {
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        io.to(`patient:${patientId}`).emit('state:change', {
            patient_id: patientId,
            location_state,
            safety_state,
            routine_state,
            engagement_state,
            last_known_lat: lat,
            last_known_lng: lng,
            last_known_zone_id,
            current_zone_name,
            computed_at: new Date().toISOString(),
            speed: speed_kmh,
            speed_kmh: speed_kmh,
            accuracy: accuracy_m,
            accuracy_m: accuracy_m,
            coords: { latitude: lat, longitude: lng },
            battery_pct: latestBattery,
            network_status: latestNetwork,
        });
    }
    catch (_) {
        // WebSocket unavailable — not fatal
    }
}
// ─── Engagement update (called by patient app interactions) ──────────────────
async function updateEngagement(patientId, state) {
    await config_1.default.query(`UPDATE patient_states SET engagement_state = $1, computed_at = NOW() WHERE patient_id = $2`, [state, patientId]);
    try {
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        io.to(`patient:${patientId}`).emit('state:change', {
            patient_id: patientId,
            engagement_state: state,
            computed_at: new Date().toISOString(),
        });
    }
    catch (_) { }
}
// ─── State queries ────────────────────────────────────────────────────────────
async function getPatientState(patientId) {
    const result = await config_1.default.query(`SELECT ps.*, u.photo_url, u.name, gz.label AS current_zone_name
     FROM patient_states ps
     JOIN users u ON u.id = ps.patient_id
     LEFT JOIN geofence_zones gz ON gz.id = ps.last_known_zone_id
     WHERE ps.patient_id = $1`, [patientId]);
    if (!result.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Patient state not found', 404);
    return result.rows[0];
}
async function getAllPatientStates(caregiverId) {
    const result = await config_1.default.query(`SELECT ps.*, u.name, u.photo_url, gz.label AS current_zone_name
     FROM patient_states ps
     JOIN users u ON u.id = ps.patient_id
     LEFT JOIN geofence_zones gz ON gz.id = ps.last_known_zone_id
     WHERE ps.patient_id IN (
       SELECT patient_user_id FROM patient_relationships
       WHERE related_user_id = $1 AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE') AND relationship_type = 'CAREGIVER'
     )
     ORDER BY
       CASE ps.safety_state WHEN 'CRITICAL' THEN 0 WHEN 'BREACH' THEN 1 WHEN 'APPROACHING' THEN 2 ELSE 3 END,
       ps.computed_at DESC`, [caregiverId]);
    return result.rows;
}
async function triggerSOS(patientId) {
    await config_1.default.query(`UPDATE patient_states SET sos_active = TRUE, safety_state = 'CRITICAL', computed_at = NOW()
     WHERE patient_id = $1`, [patientId]);
    const state = await config_1.default.query('SELECT last_known_lat, last_known_lng FROM patient_states WHERE patient_id = $1', [patientId]);
    const { last_known_lat = 0, last_known_lng = 0 } = state.rows[0] ?? {};
    const patientRow = await config_1.default.query('SELECT name FROM users WHERE id = $1', [patientId]);
    const patientName = patientRow.rows[0]?.name ?? 'Your patient';
    const alertResult = await config_1.default.query(`INSERT INTO geofence_alerts (patient_id, alert_type, severity, lat, lng, dedup_key)
     VALUES ($1,'SOS_TRIGGERED','CRITICAL',$2,$3,$4)
     ON CONFLICT (dedup_key) DO NOTHING RETURNING id`, [patientId, last_known_lat, last_known_lng, `sos:${patientId}:${Math.floor(Date.now() / 60000)}`]);
    if (alertResult.rows[0]) {
        await (0, fcm_service_1.sendToCareCircle)(patientId, {
            title: '🆘 SOS — Immediate Response Required',
            body: `${patientName} has triggered an emergency SOS alert.`,
            data: { type: 'SOS_TRIGGERED', patientId, alertId: alertResult.rows[0].id },
        }, 'SOS_TRIGGERED');
        void broadcastNewAlert(alertResult.rows[0].id, patientId);
    }
    try {
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        io.to(`patient:${patientId}`).emit('sos:triggered', {
            patient_id: patientId,
            alert: alertResult.rows[0] ?? null,
            ts: new Date().toISOString(),
        });
    }
    catch (_) { }
}
async function broadcastNewAlert(alertId, patientId) {
    try {
        const result = await config_1.default.query(`SELECT ga.*, 
              u_ack.name AS acknowledged_by_name, 
              u_ack.role AS acknowledged_by_role, 
              u_res.name AS resolved_by_name, 
              u_res.role AS resolved_by_role, 
              u_resp.name AS responder_name, 
              u_resp.role AS responder_role,
              u_pat.name AS patient_name
       FROM geofence_alerts ga
       LEFT JOIN users u_ack ON u_ack.id = ga.acknowledged_by
       LEFT JOIN users u_res ON u_res.id = ga.resolved_by
       LEFT JOIN users u_resp ON u_resp.id = ga.responder_id
       LEFT JOIN users u_pat ON u_pat.id = ga.patient_id
       WHERE ga.id = $1`, [alertId]);
        const fullAlert = result.rows[0];
        if (fullAlert) {
            const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
            io.to(`patient:${patientId}`).emit('alert:new', { alert: fullAlert });
            io.to(`patient:${patientId}`).emit('alert:updated', { alert: fullAlert });
        }
    }
    catch (err) {
        console.error('[broadcastNewAlert] failed to broadcast:', err);
    }
}
//# sourceMappingURL=awareness.service.js.map