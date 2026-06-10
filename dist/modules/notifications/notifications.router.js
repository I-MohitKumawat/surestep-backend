"use strict";
/**
 * Notifications / Alerts Router
 * Handles: geofence alert queries, alert acknowledgement, SOS trigger,
 * and the cross-patient caregiver alert feed.
 *
 * POST /api/v1/alerts/sos/patient/:patientId   — PATIENT
 * GET  /api/v1/alerts/patient/:id              — CAREGIVER, FAMILY
 * POST /api/v1/alerts/:id/acknowledge          — CAREGIVER, FAMILY
 * POST /api/v1/alerts/:id/respond              — CAREGIVER, FAMILY
 * GET  /api/v1/alerts/caregiver/feed           — CAREGIVER
 */
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
const express_1 = require("express");
const authenticate_1 = require("../../shared/middleware/authenticate");
const requireRelationship_1 = require("../../shared/middleware/requireRelationship");
const response_1 = require("../../shared/utils/response");
const AppError_1 = require("../../shared/errors/AppError");
const config_1 = __importDefault(require("../../db/config"));
const fcm_service_1 = require("./fcm.service");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// ─── FCM Device Token Registration ───────────────────────────────────────────
const DeviceSchema = zod_1.z.object({
    device_token: zod_1.z.string().min(10),
    device_type: zod_1.z.enum(['PHONE_IOS', 'PHONE_ANDROID']),
    device_name: zod_1.z.string().optional(),
    app_version: zod_1.z.string().optional(),
});
router.post('/devices/register', (0, response_1.asyncHandler)(async (req, res) => {
    const { device_token, device_type, device_name, app_version } = DeviceSchema.parse(req.body);
    await (0, fcm_service_1.upsertDeviceToken)(req.user.id, device_token, device_type, device_name, app_version);
    (0, response_1.created)(res, { registered: true });
}));
router.post('/sos/patient/:patientId', (0, authenticate_1.requireRoles)('PATIENT'), (0, response_1.asyncHandler)(async (req, res) => {
    const { patientId } = req.params;
    // Ensure the patient is the requesting user
    if (req.user.id !== patientId) {
        throw new AppError_1.AppError('ROLE_NOT_PERMITTED', 'Patients can only trigger SOS for themselves', 403);
    }
    // Mark SOS active on patient state
    await config_1.default.query(`UPDATE patient_states SET sos_active = TRUE, computed_at = NOW()
       WHERE patient_id = $1`, [patientId]);
    // Create CRITICAL alert
    const state = await config_1.default.query('SELECT last_known_lat, last_known_lng FROM patient_states WHERE patient_id = $1', [patientId]);
    const lat = state.rows[0]?.last_known_lat ?? 0;
    const lng = state.rows[0]?.last_known_lng ?? 0;
    const alert = await config_1.default.query(`INSERT INTO geofence_alerts (patient_id, alert_type, severity, lat, lng, dedup_key)
       VALUES ($1,'SOS_TRIGGERED','CRITICAL',$2,$3,$4)
       ON CONFLICT (dedup_key) DO NOTHING RETURNING *`, [patientId, lat, lng, `sos:${patientId}:${Math.floor(Date.now() / 60000)}`]);
    // Notify connected caregivers/family via WebSocket
    try {
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        io.to(`patient:${patientId}`).emit('sos:triggered', {
            patient_id: patientId,
            alert: alert.rows[0],
            ts: new Date().toISOString(),
        });
    }
    catch (_) { /* WebSocket optional — FCM would fire here too */ }
    (0, response_1.ok)(res, { message: 'SOS triggered', alert: alert.rows[0] ?? null });
}));
// ─── Helper to fetch populated alert ──────────────────────────────────────────
async function fetchFullAlertDetails(alertId) {
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
    return result.rows[0];
}
// ─── Alert List for a Patient ─────────────────────────────────────────────────
router.get('/patient/:patientId', (0, requireRelationship_1.requireRelationship)('patientId'), (0, response_1.asyncHandler)(async (req, res) => {
    const { patientId } = req.params;
    const { type, severity, limit = '20', cursor } = req.query;
    let query = `
      SELECT ga.*, 
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
      WHERE ga.patient_id = $1
    `;
    const params = [patientId];
    let i = 2;
    if (type) {
        query += ` AND ga.alert_type = $${i++}`;
        params.push(type);
    }
    if (severity) {
        query += ` AND ga.severity = $${i++}`;
        params.push(severity);
    }
    if (cursor) {
        query += ` AND ga.created_at < $${i++}`;
        params.push(cursor);
    }
    query += ` ORDER BY ga.created_at DESC LIMIT $${i}`;
    params.push(parseInt(limit) + 1);
    const result = await config_1.default.query(query, params);
    const has_more = result.rows.length > parseInt(limit);
    const alerts = has_more ? result.rows.slice(0, parseInt(limit)) : result.rows;
    (0, response_1.ok)(res, { alerts, has_more, next_cursor: has_more ? alerts[alerts.length - 1].created_at : null });
}));
// ─── Acknowledge Alert ────────────────────────────────────────────────────────
router.post('/:alertId/acknowledge', (0, response_1.asyncHandler)(async (req, res) => {
    const result = await config_1.default.query(`UPDATE geofence_alerts
       SET acknowledged_by = $1, acknowledged_at = NOW(), status = 'ACKNOWLEDGED'
       WHERE id = $2 AND status = 'OPEN'
       RETURNING *`, [req.user.id, req.params.alertId]);
    if (!result.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Alert not found, already acknowledged, or resolved', 404);
    const fullAlert = await fetchFullAlertDetails(req.params.alertId);
    // Broadcast acknowledgement to room
    try {
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        io.to(`patient:${fullAlert.patient_id}`).emit('alert:updated', {
            alert: fullAlert,
        });
        // Backward compatibility socket trigger
        io.to(`patient:${fullAlert.patient_id}`).emit('alert:acknowledged', {
            alert_id: fullAlert.id,
            acknowledged_by: req.user.id,
            ts: new Date().toISOString(),
        });
    }
    catch (_) { }
    (0, response_1.ok)(res, { alert: fullAlert });
}));
// ─── Respond Alert ────────────────────────────────────────────────────────────
router.post('/:alertId/respond', (0, response_1.asyncHandler)(async (req, res) => {
    const alertCheck = await config_1.default.query('SELECT patient_id FROM geofence_alerts WHERE id = $1', [req.params.alertId]);
    if (!alertCheck.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Alert not found', 404);
    const patientId = alertCheck.rows[0].patient_id;
    // Get user role label
    const relResult = await config_1.default.query(`SELECT relationship_type FROM patient_relationships WHERE patient_user_id = $1 AND related_user_id = $2`, [patientId, req.user.id]);
    const roleLabel = relResult.rows[0]?.relationship_type ?? req.user.role;
    const result = await config_1.default.query(`UPDATE geofence_alerts
       SET responder_id = $1, responder_role = $2, responded_at = NOW(), status = 'RESPONDING',
           acknowledged_by = COALESCE(acknowledged_by, $1), acknowledged_at = COALESCE(acknowledged_at, NOW())
       WHERE id = $3 AND status IN ('OPEN', 'ACKNOWLEDGED')
       RETURNING *`, [req.user.id, roleLabel, req.params.alertId]);
    if (!result.rows[0])
        throw new AppError_1.AppError('BAD_REQUEST', 'Cannot respond to this alert', 400);
    const fullAlert = await fetchFullAlertDetails(req.params.alertId);
    // Broadcast response update to room
    try {
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        io.to(`patient:${fullAlert.patient_id}`).emit('alert:updated', {
            alert: fullAlert,
        });
    }
    catch (_) { }
    (0, response_1.ok)(res, { alert: fullAlert });
}));
// ─── Resolve Patient Incident ─────────────────────────────────────────────────
router.post('/patient/:patientId/resolve', (0, requireRelationship_1.requireRelationship)('patientId', ['CAREGIVER', 'GUARDIAN']), (0, response_1.asyncHandler)(async (req, res) => {
    const { patientId } = req.params;
    const userId = req.user.id;
    // Find all open/responding alerts to resolve
    const activeAlertsResult = await config_1.default.query(`SELECT id FROM geofence_alerts WHERE patient_id = $1 AND status != 'RESOLVED'`, [patientId]);
    // 1. Resolve all open geofence alerts for this patient
    await config_1.default.query(`UPDATE geofence_alerts
       SET status = 'RESOLVED', resolved_by = $1, resolved_at = NOW(), 
           acknowledged_by = COALESCE(acknowledged_by, $1), acknowledged_at = COALESCE(acknowledged_at, NOW())
       WHERE patient_id = $2 AND status != 'RESOLVED'`, [userId, patientId]);
    // 2. Set patient safety state back to SAFE and reset sos_active to FALSE
    await config_1.default.query(`UPDATE patient_states
       SET safety_state = 'SAFE', sos_active = FALSE, computed_at = NOW()
       WHERE patient_id = $1`, [patientId]);
    // 3. Broadcast to websocket room
    try {
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        io.to(`patient:${patientId}`).emit('state:change', {
            patient_id: patientId,
            safety_state: 'SAFE',
            sos_active: false,
            computed_at: new Date().toISOString(),
        });
        // Broadcast alert:updated for each resolved alert
        for (const row of activeAlertsResult.rows) {
            const fullAlert = await fetchFullAlertDetails(row.id);
            io.to(`patient:${patientId}`).emit('alert:updated', {
                alert: fullAlert,
            });
        }
    }
    catch (_) { }
    (0, response_1.ok)(res, { success: true });
}));
// ─── Caregiver Cross-Patient Feed ─────────────────────────────────────────────
router.get('/caregiver/feed', (0, authenticate_1.requireRoles)('CAREGIVER'), (0, response_1.asyncHandler)(async (req, res) => {
    const { limit = '30', cursor } = req.query;
    // Get all patient IDs for this caregiver
    const patientIds = await config_1.default.query(`SELECT patient_user_id FROM patient_relationships
       WHERE related_user_id = $1 
         AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`, [req.user.id]);
    if (!patientIds.rows.length) {
        return (0, response_1.ok)(res, { alerts: [], has_more: false });
    }
    const ids = patientIds.rows.map((r) => r.patient_user_id);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    let query = `
      SELECT ga.*, 
             u.name as patient_name,
             u_ack.name AS acknowledged_by_name, 
             u_ack.role AS acknowledged_by_role, 
             u_res.name AS resolved_by_name, 
             u_res.role AS resolved_by_role, 
             u_resp.name AS responder_name, 
             u_resp.role AS responder_role
      FROM geofence_alerts ga
      JOIN users u ON u.id = ga.patient_id
      LEFT JOIN users u_ack ON u_ack.id = ga.acknowledged_by
      LEFT JOIN users u_res ON u_res.id = ga.resolved_by
      LEFT JOIN users u_resp ON u_resp.id = ga.responder_id
      WHERE ga.patient_id IN (${placeholders})
    `;
    const params = [...ids];
    if (cursor) {
        query += ` AND ga.created_at < $${params.length + 1}`;
        params.push(cursor);
    }
    query += ` ORDER BY ga.created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit) + 1);
    const result = await config_1.default.query(query, params);
    const has_more = result.rows.length > parseInt(limit);
    const alerts = has_more ? result.rows.slice(0, parseInt(limit)) : result.rows;
    (0, response_1.ok)(res, { alerts, has_more, next_cursor: has_more ? alerts[alerts.length - 1].created_at : null });
}));
// ─── Notification History Endpoints ──────────────────────────────────────────
router.get('/history', (0, response_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const result = await config_1.default.query(`SELECT * FROM notification_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`, [userId]);
    (0, response_1.ok)(res, { notifications: result.rows });
}));
router.post('/:id/read', (0, response_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const result = await config_1.default.query(`UPDATE notification_logs
       SET is_read = TRUE, read_at = NOW(), opened = TRUE, opened_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`, [req.params.id, userId]);
    if (!result.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Notification not found', 404);
    (0, response_1.ok)(res, { notification: result.rows[0] });
}));
router.post('/read-all', (0, response_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    await config_1.default.query(`UPDATE notification_logs
       SET is_read = TRUE, read_at = NOW(), opened = TRUE, opened_at = NOW()
       WHERE user_id = $1 AND is_read = FALSE`, [userId]);
    (0, response_1.ok)(res, { success: true });
}));
exports.default = router;
//# sourceMappingURL=notifications.router.js.map