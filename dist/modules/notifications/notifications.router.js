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
    const state = await config_1.default.query('SELECT last_known_lat, last_known_lng FROM patient_states WHERE patient_id = $1', [patientId]);
    const lat = state.rows[0]?.last_known_lat ?? 0;
    const lng = state.rows[0]?.last_known_lng ?? 0;
    const { authoritativeSafetyService } = await Promise.resolve().then(() => __importStar(require('../alerts/authoritative-safety.service')));
    const alert = await authoritativeSafetyService.triggerSOS(patientId, lat, lng);
    (0, response_1.ok)(res, { message: 'SOS triggered', alert });
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
async function notifyCareCircleOfAlertUpdate(patientId, actorId, alertId, title, body, notificationType) {
    try {
        const cgRes = await config_1.default.query(`SELECT c.owner_id AS user_id
       FROM patient_circle_associations pca
       JOIN care_circles c ON pca.circle_id = c.id
       WHERE pca.patient_id = $1 AND c.terminated_at IS NULL
       UNION
       SELECT ccm.user_id
       FROM patient_circle_associations pca
       JOIN care_circles c ON pca.circle_id = c.id
       JOIN care_circle_members ccm ON ccm.circle_id = c.id
       WHERE pca.patient_id = $1 AND c.terminated_at IS NULL
       UNION
       SELECT cr.caregiver_id AS user_id
       FROM patient_assignments pa
       JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
       JOIN care_circles c ON cr.circle_id = c.id
       WHERE pa.patient_id = $1 AND pa.is_active = TRUE AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD') AND c.terminated_at IS NULL`, [patientId]);
        const recipients = cgRes.rows.map((r) => r.user_id).filter((id) => id !== actorId);
        if (patientId !== actorId) {
            recipients.push(patientId);
        }
        const { createInAppNotification } = await Promise.resolve().then(() => __importStar(require('./notification.service')));
        for (const recipientId of recipients) {
            await createInAppNotification({
                userId: recipientId,
                notificationType: notificationType,
                priority: 'HIGH',
                title,
                body,
                payload: { alertId, patientId }
            });
        }
    }
    catch (err) {
        console.error('Failed to notify care circle of alert update:', err);
    }
}
// ─── Alert List for a Patient (Canonical safety_alerts) ───────────────────────
router.get('/patient/:patientId', (0, requireRelationship_1.requireRelationship)('patientId'), (0, response_1.asyncHandler)(async (req, res) => {
    const { patientId } = req.params;
    const { status, limit = '20', cursor } = req.query;
    let query = `
      SELECT sa.*, 
             u.name AS patient_name,
             c.name AS circle_name,
             sz.name AS safe_zone_name,
             u_res.name AS resolved_by_name
      FROM safety_alerts sa
      JOIN users u ON u.id = sa.patient_id
      JOIN care_circles c ON c.id = sa.circle_id
      LEFT JOIN safe_zones sz ON sz.id = sa.safe_zone_id
      LEFT JOIN users u_res ON u_res.id = sa.resolved_by
      WHERE sa.patient_id = $1
    `;
    const params = [patientId];
    let i = 2;
    if (status) {
        query += ` AND sa.status = $${i++}`;
        params.push(status);
    }
    if (cursor) {
        query += ` AND sa.triggered_at < $${i++}`;
        params.push(cursor);
    }
    query += ` ORDER BY sa.triggered_at DESC LIMIT $${i}`;
    params.push(parseInt(limit) + 1);
    const result = await config_1.default.query(query, params);
    const has_more = result.rows.length > parseInt(limit);
    const alerts = has_more ? result.rows.slice(0, parseInt(limit)) : result.rows;
    (0, response_1.ok)(res, { alerts, has_more, next_cursor: has_more ? alerts[alerts.length - 1].triggered_at : null });
}));
// ─── Acknowledge Alert (Authoritative) ────────────────────────────────────────
router.post('/:alertId/acknowledge', (0, response_1.asyncHandler)(async (req, res) => {
    const { authoritativeSafetyService } = await Promise.resolve().then(() => __importStar(require('../alerts/authoritative-safety.service')));
    const result = await authoritativeSafetyService.respondToAlert(req.params.alertId, req.user, 'Acknowledged');
    (0, response_1.ok)(res, result);
}));
// ─── Respond Alert (Authoritative) ────────────────────────────────────────────
router.post('/:alertId/respond', (0, response_1.asyncHandler)(async (req, res) => {
    const { authoritativeSafetyService } = await Promise.resolve().then(() => __importStar(require('../alerts/authoritative-safety.service')));
    const result = await authoritativeSafetyService.respondToAlert(req.params.alertId, req.user, req.body?.notes);
    (0, response_1.ok)(res, result);
}));
// ─── Resolve Single Alert (Authoritative) ────────────────────────────────────
router.post('/:alertId/resolve', (0, response_1.asyncHandler)(async (req, res) => {
    const { authoritativeSafetyService } = await Promise.resolve().then(() => __importStar(require('../alerts/authoritative-safety.service')));
    const result = await authoritativeSafetyService.resolveAlert(req.params.alertId, req.user, req.body?.notes);
    (0, response_1.ok)(res, result);
}));
// ─── Resolve Patient Incident ─────────────────────────────────────────────────
router.post('/patient/:patientId/resolve', (0, response_1.asyncHandler)(async (req, res) => {
    const { patientId } = req.params;
    const userId = req.user.id;
    // INVARIANT (TARGET_ARCHITECTURE.md §3.6): Resolving an alert is strictly Circle Owner only in V1
    const circleCheck = await config_1.default.query(`SELECT c.owner_id FROM patient_circle_associations pca
       JOIN care_circles c ON pca.circle_id = c.id
       WHERE pca.patient_id = $1 AND c.terminated_at IS NULL`, [patientId]);
    if (circleCheck.rows.length === 0) {
        throw new AppError_1.AppError('CIRCLE_NOT_FOUND', 'Active Care Circle not found for patient', 404);
    }
    const isOwner = circleCheck.rows.some((r) => r.owner_id === userId);
    if (!isOwner) {
        throw new AppError_1.AppError('OWNER_ONLY', 'Resolving safety alerts is strictly Circle Owner only in V1', 403);
    }
    // Fetch active safety alerts before resolving
    const activeAlertsResult = await config_1.default.query(`SELECT id FROM safety_alerts WHERE patient_id = $1 AND status != 'RESOLVED'`, [patientId]);
    // Resolve all open safety_alerts for this patient
    for (const row of activeAlertsResult.rows) {
        await config_1.default.query(`UPDATE safety_alerts
         SET status = 'RESOLVED', resolved_at = NOW(), resolved_by = $1
         WHERE id = $2`, [userId, row.id]);
        await config_1.default.query(`INSERT INTO safety_alert_responses (alert_id, responder_id, action, notes)
         VALUES ($1, $2, 'RESOLVED', 'Resolved via patient incident resolution')`, [row.id, userId]);
    }
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
        for (const row of activeAlertsResult.rows) {
            io.to(`patient:${patientId}`).emit('alert:resolved', {
                alertId: row.id,
                resolvedBy: userId,
                resolvedAt: new Date().toISOString(),
            });
        }
    }
    catch (_) { }
    // Send notifications to Care Circle
    try {
        const patientRow = await config_1.default.query('SELECT name FROM users WHERE id = $1', [patientId]);
        const patientName = patientRow.rows[0]?.name || 'Patient';
        const actorName = req.user.name || 'A care circle member';
        for (const row of activeAlertsResult.rows) {
            await notifyCareCircleOfAlertUpdate(patientId, userId, row.id, 'Alert Resolved', `${actorName} resolved the alert for ${patientName}.`, 'ALERT_RESOLVED');
        }
    }
    catch (err) {
        console.error('Failed to notify care circle of alert resolution:', err);
    }
    (0, response_1.ok)(res, { success: true });
}));
// ─── Caregiver Cross-Patient Feed ─────────────────────────────────────────────
router.get('/caregiver/feed', (0, authenticate_1.requireRoles)('CAREGIVER'), (0, response_1.asyncHandler)(async (req, res) => {
    const { limit = '30', cursor } = req.query;
    // Get all assigned patient IDs for this caregiver from canonical tables
    const patientIds = await config_1.default.query(`SELECT pa.patient_id
       FROM patient_assignments pa
       JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
       JOIN care_circles c ON cr.circle_id = c.id
       WHERE cr.caregiver_id = $1
         AND pa.is_active = TRUE
         AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
         AND c.terminated_at IS NULL`, [req.user.id]);
    if (!patientIds.rows.length) {
        return (0, response_1.ok)(res, { alerts: [], has_more: false });
    }
    const ids = patientIds.rows.map((r) => r.patient_id);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    let query = `
      SELECT sa.*, 
             u.name as patient_name,
             u_res.name AS resolved_by_name,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', sar.id,
                   'responder_id', sar.responder_id,
                   'responder_name', ru.name,
                   'responder_role', ru.role,
                   'action', sar.action,
                   'notes', sar.notes,
                   'created_at', sar.created_at
                 )
               ) FILTER (WHERE sar.id IS NOT NULL),
               '[]'::json
             ) as responses
      FROM safety_alerts sa
      JOIN users u ON u.id = sa.patient_id
      LEFT JOIN users u_res ON u_res.id = sa.resolved_by
      LEFT JOIN safety_alert_responses sar ON sar.alert_id = sa.id
      LEFT JOIN users ru ON ru.id = sar.responder_id
      WHERE sa.patient_id IN (${placeholders})
    `;
    const params = [...ids];
    if (cursor) {
        query += ` AND sa.triggered_at < $${params.length + 1}`;
        params.push(cursor);
    }
    query += ` GROUP BY sa.id, u.name, u_res.name
               ORDER BY sa.triggered_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit) + 1);
    const result = await config_1.default.query(query, params);
    const has_more = result.rows.length > parseInt(limit);
    const alerts = has_more ? result.rows.slice(0, parseInt(limit)) : result.rows;
    (0, response_1.ok)(res, { alerts, has_more, next_cursor: has_more ? alerts[alerts.length - 1].triggered_at : null });
}));
// ─── Notification Settings Imports ─────────────────────────────────────────────
const notification_service_1 = require("./notification.service");
// ─── Notification Settings Endpoints ──────────────────────────────────────────
router.get('/settings', (0, response_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const settings = await (0, notification_service_1.getOrCreateNotificationSettings)(userId);
    (0, response_1.ok)(res, { settings });
}));
router.put('/settings', (0, response_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const updated = await (0, notification_service_1.updateNotificationSettings)(userId, req.body);
    (0, response_1.ok)(res, { settings: updated });
}));
// ─── Patient Reminders Endpoints (Decommissioned) ─────────────────────────────
const deprecatedRemindersHandler = (_req, _res, next) => {
    next(new AppError_1.AppError('DEPRECATED_ENDPOINT', 'Legacy reminder endpoints are deprecated (410 GONE). Use authoritative routine occurrence endpoints for care routine tracking at /api/v1/patients/:patientId/routines/occurrences.', 410));
};
router.all('/reminders', deprecatedRemindersHandler);
router.all('/reminders/*', deprecatedRemindersHandler);
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
// ─── Test / Validation Endpoints (Dev) ────────────────────────────────────────
/** POST /alerts/test/notification — create a test notification for the caller. */
router.post('/test/notification', (0, response_1.asyncHandler)(async (req, res) => {
    const { createInAppNotification } = await Promise.resolve().then(() => __importStar(require('./notification.service')));
    const notification = await createInAppNotification({
        userId: req.user.id,
        notificationType: 'TEST_NOTIFICATION',
        priority: 'MEDIUM',
        title: '🔔 Test Notification',
        body: `This is a test notification triggered at ${new Date().toLocaleTimeString()}.`,
        payload: { isTest: true, triggeredAt: new Date().toISOString() },
    });
    (0, response_1.created)(res, { notification });
}));
/** POST /alerts/test/reminder — create a reminder scheduled for right now. */
router.post('/test/reminder', (0, response_1.asyncHandler)(async (req, res) => {
    let patientId = req.user.id;
    if (req.user.role !== 'PATIENT') {
        const circleRes = await config_1.default.query(`SELECT pca.patient_id FROM patient_circle_associations pca
         JOIN care_circles c ON pca.circle_id = c.id
         WHERE c.owner_id = $1 AND c.terminated_at IS NULL LIMIT 1`, [req.user.id]);
        if (circleRes.rows[0]) {
            patientId = circleRes.rows[0].patient_id;
        }
    }
    const { createReminder } = await Promise.resolve().then(() => __importStar(require('./reminders.service')));
    const reminder = await createReminder({
        patientId,
        referenceType: 'CUSTOM',
        title: '⏰ Test Reminder',
        body: `Test reminder created at ${new Date().toLocaleTimeString()}.`,
        scheduledAt: new Date().toISOString(), // Due immediately
    });
    // Mark is_test
    await config_1.default.query(`UPDATE reminders SET is_test = TRUE WHERE id = $1`, [reminder.id]);
    (0, response_1.created)(res, { reminder });
}));
/** POST /alerts/test/escalation — create a reminder backdated 30 min to trigger escalation. */
router.post('/test/escalation', (0, response_1.asyncHandler)(async (req, res) => {
    const patientId = req.user.id;
    const backdated = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { createReminder } = await Promise.resolve().then(() => __importStar(require('./reminders.service')));
    const reminder = await createReminder({
        patientId,
        referenceType: 'CUSTOM',
        title: '🚨 Test Escalation Reminder',
        body: 'This reminder was backdated 30 minutes to trigger the escalation engine.',
        scheduledAt: backdated,
    });
    // Mark is_test and set state to ACTIVE so sweep picks it up immediately
    await config_1.default.query(`UPDATE reminders SET is_test = TRUE, state = 'ACTIVE' WHERE id = $1`, [reminder.id]);
    (0, response_1.created)(res, { reminder });
}));
exports.default = router;
//# sourceMappingURL=notifications.router.js.map