"use strict";
/**
 * SureStep — modules/alerts/authoritative-safety.service.ts
 *
 * Authoritative Safety Alerts Lifecycle and Decoupled Responder Service.
 * Baselines:
 *   - docs/architecture/TARGET_ARCHITECTURE.md (Sections 3.6, 4.3, 5.3)
 *   - docs/workflows/07-SAFETY.md
 *
 * Invariants:
 *   - SOS and Safe Zone breaches stored in safety_alerts.
 *   - Status: TRIGGERED -> ACTIVE -> VIEWED -> RESOLVED.
 *   - Responder actions recorded in safety_alert_responses (action: IM_RESPONDING).
 *   - Multiple responders permitted; does NOT mutate alert status away from active visibility.
 *   - Alert resolution is STRICTLY Circle Owner only in V1. Non-Owners receive 403 Forbidden.
 *   - No FALSE_ALARM status in V1.
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
exports.authoritativeSafetyService = exports.AuthoritativeSafetyService = void 0;
const config_1 = __importDefault(require("../../db/config"));
const AppError_1 = require("../../shared/errors/AppError");
class AuthoritativeSafetyService {
    /**
     * 1. Trigger SOS Alert (Patient-initiated)
     */
    async triggerSOS(patientId, lat, lng) {
        // 1. Resolve patient's active Care Circle
        const circleRes = await config_1.default.query(`SELECT pca.circle_id
       FROM patient_circle_associations pca
       JOIN care_circles c ON pca.circle_id = c.id
       WHERE pca.patient_id = $1 AND c.terminated_at IS NULL
       LIMIT 1`, [patientId]);
        let circleId = circleRes.rows[0]?.circle_id;
        if (!circleId) {
            // Check if user owns a circle or fallback
            const ownCircle = await config_1.default.query(`SELECT id FROM care_circles WHERE owner_id = $1 AND terminated_at IS NULL LIMIT 1`, [patientId]);
            circleId = ownCircle.rows[0]?.id;
        }
        if (!circleId) {
            throw new AppError_1.AppError('NO_ACTIVE_CIRCLE', 'Patient must belong to an active Care Circle to dispatch safety alerts', 400);
        }
        const dedupKey = `SOS_${patientId}_${Math.floor(Date.now() / 60000)}`;
        const alertRes = await config_1.default.query(`INSERT INTO safety_alerts (
         circle_id, patient_id, alert_type, status, trigger_lat, trigger_lng, dedup_key
       ) VALUES ($1, $2, 'SOS_MANUAL', 'TRIGGERED', $3, $4, $5)
       ON CONFLICT (dedup_key)
       DO UPDATE SET trigger_lat = COALESCE(EXCLUDED.trigger_lat, safety_alerts.trigger_lat),
                     trigger_lng = COALESCE(EXCLUDED.trigger_lng, safety_alerts.trigger_lng)
       RETURNING *`, [circleId, patientId, lat || null, lng || null, dedupKey]);
        const alert = alertRes.rows[0];
        // Dispatch socket broadcast
        try {
            const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
            io.to(`patient:${patientId}`).emit('sos:triggered', {
                alertId: alert.id,
                patientId,
                alertType: 'SOS_MANUAL',
                lat,
                lng,
                triggeredAt: alert.triggered_at,
            });
            io.to(`circle:${circleId}`).emit('sos:triggered', {
                alertId: alert.id,
                patientId,
                alertType: 'SOS_MANUAL',
                lat,
                lng,
                triggeredAt: alert.triggered_at,
            });
        }
        catch (_) { }
        return alert;
    }
    /**
     * 2. Record "I'm Responding" Action
     * Decoupled responder ledger: records action without granting exclusive ownership or resolving alert.
     */
    async respondToAlert(alertId, responderUser, notes) {
        const client = await config_1.default.connect();
        try {
            await client.query('BEGIN');
            const alertRes = await client.query(`SELECT sa.*, c.owner_id
         FROM safety_alerts sa
         JOIN care_circles c ON sa.circle_id = c.id
         WHERE sa.id = $1
         FOR UPDATE`, [alertId]);
            const alert = alertRes.rows[0];
            if (!alert) {
                throw new AppError_1.AppError('NOT_FOUND', 'Safety alert not found', 404);
            }
            if (alert.status === 'RESOLVED') {
                throw new AppError_1.AppError('ALREADY_RESOLVED', 'Cannot respond to an already resolved alert', 400);
            }
            // Check responder authorization
            await this.assertAuthorizedRecipient(alert.circle_id, alert.patient_id, responderUser);
            // Transition TRIGGERED -> ACTIVE if not already active
            let updatedStatus = alert.status;
            if (alert.status === 'TRIGGERED') {
                await client.query(`UPDATE safety_alerts SET status = 'ACTIVE' WHERE id = $1`, [alertId]);
                updatedStatus = 'ACTIVE';
            }
            // Insert response into ledger
            const respRes = await client.query(`INSERT INTO safety_alert_responses (alert_id, responder_id, action, notes)
         VALUES ($1, $2, 'IM_RESPONDING', $3)
         RETURNING *`, [alertId, responderUser.id, notes || null]);
            await client.query('COMMIT');
            // Socket broadcast
            try {
                const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
                io.to(`patient:${alert.patient_id}`).emit('alert:response', {
                    alertId,
                    responderId: responderUser.id,
                    responderName: responderUser.name,
                    action: 'IM_RESPONDING',
                    respondedAt: respRes.rows[0].created_at,
                });
            }
            catch (_) { }
            return {
                alert: { ...alert, status: updatedStatus },
                response: respRes.rows[0],
            };
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
     * 3. Resolve Safety Alert
     * INVARIANT: Resolving an alert is strictly Circle Owner only in V1 (TARGET_ARCHITECTURE.md §3.6, §4.3, §5.3).
     * Responding does NOT grant resolution authority.
     * Circle members and caregivers receive 403 Forbidden.
     */
    async resolveAlert(alertId, resolverUser, notes) {
        const client = await config_1.default.connect();
        try {
            await client.query('BEGIN');
            const alertRes = await client.query(`SELECT sa.*, c.owner_id
         FROM safety_alerts sa
         JOIN care_circles c ON sa.circle_id = c.id
         WHERE sa.id = $1
         FOR UPDATE`, [alertId]);
            const alert = alertRes.rows[0];
            if (!alert) {
                throw new AppError_1.AppError('NOT_FOUND', 'Safety alert not found', 404);
            }
            if (alert.status === 'RESOLVED') {
                throw new AppError_1.AppError('ALREADY_RESOLVED', 'Safety alert is already resolved', 400);
            }
            // INVARIANT: Strictly Circle Owner only
            if (alert.owner_id !== resolverUser.id) {
                throw new AppError_1.AppError('OWNER_ONLY', 'Resolving a safety alert is strictly Circle Owner only in V1. Responders and non-Owner members cannot resolve alerts.', 403);
            }
            // Update alert to RESOLVED
            const updateRes = await client.query(`UPDATE safety_alerts
         SET status = 'RESOLVED', resolved_at = NOW(), resolved_by = $1
         WHERE id = $2
         RETURNING *`, [resolverUser.id, alertId]);
            // Record RESOLVED in response ledger
            const respRes = await client.query(`INSERT INTO safety_alert_responses (alert_id, responder_id, action, notes)
         VALUES ($1, $2, 'RESOLVED', $3)
         RETURNING *`, [alertId, resolverUser.id, notes || null]);
            await client.query('COMMIT');
            // Socket broadcast
            try {
                const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
                io.to(`patient:${alert.patient_id}`).emit('alert:resolved', {
                    alertId,
                    resolvedBy: resolverUser.id,
                    resolvedAt: updateRes.rows[0].resolved_at,
                });
            }
            catch (_) { }
            return {
                alert: updateRes.rows[0],
                response: respRes.rows[0],
            };
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
     * 4. List Alerts for a Care Circle
     */
    async listCircleAlerts(circleId, status) {
        let sql = `
      SELECT sa.*, u.name as patient_name, u.photo_url as patient_photo,
             res_u.name as resolved_by_name,
             COALESCE(
               json_agg(
                 json_build_object(
                   'response_id', sar.id,
                   'responder_id', sar.responder_id,
                   'responder_name', ru.name,
                   'action', sar.action,
                   'notes', sar.notes,
                   'created_at', sar.created_at
                 )
               ) FILTER (WHERE sar.id IS NOT NULL),
               '[]'::json
             ) as responses
      FROM safety_alerts sa
      JOIN users u ON sa.patient_id = u.id
      LEFT JOIN users res_u ON sa.resolved_by = res_u.id
      LEFT JOIN safety_alert_responses sar ON sa.id = sar.alert_id
      LEFT JOIN users ru ON sar.responder_id = ru.id
      WHERE sa.circle_id = $1`;
        const params = [circleId];
        if (status) {
            params.push(status);
            sql += ` AND sa.status = $2`;
        }
        sql += ` GROUP BY sa.id, u.id, res_u.id ORDER BY sa.triggered_at DESC`;
        const res = await config_1.default.query(sql, params);
        return res.rows;
    }
    /**
     * 5. List Alerts for a Patient
     */
    async listPatientAlerts(patientId, status) {
        let sql = `
      SELECT sa.*, u.name as patient_name,
             COALESCE(
               json_agg(
                 json_build_object(
                   'response_id', sar.id,
                   'responder_id', sar.responder_id,
                   'responder_name', ru.name,
                   'action', sar.action,
                   'created_at', sar.created_at
                 )
               ) FILTER (WHERE sar.id IS NOT NULL),
               '[]'::json
             ) as responses
      FROM safety_alerts sa
      JOIN users u ON sa.patient_id = u.id
      LEFT JOIN safety_alert_responses sar ON sa.id = sar.alert_id
      LEFT JOIN users ru ON sar.responder_id = ru.id
      WHERE sa.patient_id = $1`;
        const params = [patientId];
        if (status) {
            params.push(status);
            sql += ` AND sa.status = $2`;
        }
        sql += ` GROUP BY sa.id, u.id ORDER BY sa.triggered_at DESC`;
        const res = await config_1.default.query(sql, params);
        return res.rows;
    }
    /**
     * Helper: Assert actor is authorized to receive and respond to alerts for the patient.
     */
    async assertAuthorizedRecipient(circleId, patientId, user) {
        if (user.id === patientId)
            return;
        if (user.role === 'CAREGIVER') {
            const assignCheck = await config_1.default.query(`SELECT pa.id
         FROM patient_assignments pa
         JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
         WHERE cr.caregiver_id = $1
           AND pa.patient_id = $2
           AND pa.is_active = TRUE
           AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')`, [user.id, patientId]);
            if (assignCheck.rows.length === 0) {
                throw new AppError_1.AppError('CAREGIVER_NOT_ASSIGNED', 'Caregiver is not assigned to this patient', 403);
            }
            return;
        }
        // Family or other member in circle
        const memberCheck = await config_1.default.query(`SELECT 1 FROM care_circles c
       WHERE c.id = $1 AND c.owner_id = $2
       UNION
       SELECT 1 FROM care_circle_members m
       WHERE m.circle_id = $1 AND m.user_id = $2`, [circleId, user.id]);
        if (memberCheck.rows.length > 0)
            return;
        throw new AppError_1.AppError('FORBIDDEN', 'User is not an authorized recipient for this safety alert', 403);
    }
}
exports.AuthoritativeSafetyService = AuthoritativeSafetyService;
exports.authoritativeSafetyService = new AuthoritativeSafetyService();
//# sourceMappingURL=authoritative-safety.service.js.map