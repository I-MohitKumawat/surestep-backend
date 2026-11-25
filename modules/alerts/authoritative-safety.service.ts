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

import pool from '../../db/config';
import { AppError } from '../../shared/errors/AppError';
import { User } from '../../shared/types';

export class AuthoritativeSafetyService {
  /**
   * 1. Trigger SOS Alert (Patient-initiated)
   */
  async triggerSOS(patientId: string, lat?: number, lng?: number) {
    // 1. Resolve patient's active Care Circle
    const circleRes = await pool.query(
      `SELECT pca.circle_id
       FROM patient_circle_associations pca
       JOIN care_circles c ON pca.circle_id = c.id
       WHERE pca.patient_id = $1 AND c.terminated_at IS NULL
       LIMIT 1`,
      [patientId]
    );

    let circleId = circleRes.rows[0]?.circle_id;
    if (!circleId) {
      // Check if user owns a circle or fallback
      const ownCircle = await pool.query(
        `SELECT id FROM care_circles WHERE owner_id = $1 AND terminated_at IS NULL LIMIT 1`,
        [patientId]
      );
      circleId = ownCircle.rows[0]?.id;
    }

    if (!circleId) {
      throw new AppError('NO_ACTIVE_CIRCLE', 'Patient must belong to an active Care Circle to dispatch safety alerts', 400);
    }

    const dedupKey = `SOS_${patientId}_${Math.floor(Date.now() / 60000)}`;

    const alertRes = await pool.query(
      `INSERT INTO safety_alerts (
         circle_id, patient_id, alert_type, status, trigger_lat, trigger_lng, dedup_key
       ) VALUES ($1, $2, 'SOS_MANUAL', 'TRIGGERED', $3, $4, $5)
       ON CONFLICT (dedup_key)
       DO UPDATE SET trigger_lat = COALESCE(EXCLUDED.trigger_lat, safety_alerts.trigger_lat),
                     trigger_lng = COALESCE(EXCLUDED.trigger_lng, safety_alerts.trigger_lng)
       RETURNING *`,
      [circleId, patientId, lat || null, lng || null, dedupKey]
    );

    const alert = alertRes.rows[0];

    // Reflect the SOS in the patient's derived state so every client sees
    // a consistent safety state without polling the alert table directly.
    await pool.query(
      `INSERT INTO patient_states (patient_id, sos_active, safety_state, computed_at)
       VALUES ($1, TRUE, 'CRITICAL', NOW())
       ON CONFLICT (patient_id) DO UPDATE SET
         sos_active = TRUE,
         safety_state = 'CRITICAL',
         computed_at = NOW()`,
      [patientId],
    );

    // Push notification to authorized Care Circle recipients (best effort).
    try {
      const patientRow = await pool.query('SELECT name FROM users WHERE id = $1', [patientId]);
      const patientName = patientRow.rows[0]?.name ?? 'Your patient';
      const { sendToCareCircle } = await import('../notifications/fcm.service');
      await sendToCareCircle(
        patientId,
        {
          title: '🆘 SOS — Immediate Response Required',
          body: `${patientName} has triggered an emergency SOS alert.`,
          data: { type: 'SOS_MANUAL', patientId, alertId: alert.id },
        },
        'SOS_TRIGGERED',
      );
    } catch (err) {
      console.warn('[AuthoritativeSafetyService] SOS push failed:', err);
    }

    // Dispatch socket broadcast
    try {
      const { io } = await import('../../server');
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
      io.to(`patient:${patientId}`).emit('alert:new', { alert });
      io.to(`patient:${patientId}`).emit('alert:updated', { alert });
    } catch (_) {}

    return alert;
  }

  /**
   * 1b. Create a Safe Zone breach alert (canonical ZONE_BREACH model).
   *
   * Deduplicated per zone/patient/window so repeated telemetry cannot flood the
   * alert ledger. Returns null when the slot was already recorded.
   */
  async createZoneBreachAlert(params: {
    patientId: string;
    circleId: string;
    zoneId: string;
    zoneName?: string | null;
    lat: number;
    lng: number;
    recordedAt?: string | Date;
    dedupWindowMinutes?: number;
  }) {
    const { patientId, circleId, zoneId, zoneName, lat, lng } = params;
    const recordedAt = params.recordedAt ? new Date(params.recordedAt) : new Date();
    const windowMinutes = params.dedupWindowMinutes ?? 10;
    const bucket = Math.floor(recordedAt.getTime() / (windowMinutes * 60 * 1000));
    const dedupKey = `ZONE_BREACH:${zoneId}:${patientId}:${bucket}`;

    const alertRes = await pool.query(
      `INSERT INTO safety_alerts (
         circle_id, patient_id, alert_type, status,
         trigger_lat, trigger_lng, safe_zone_id, dedup_key, triggered_at
       ) VALUES ($1, $2, 'ZONE_BREACH', 'TRIGGERED', $3, $4, $5, $6, $7)
       ON CONFLICT (dedup_key) DO NOTHING
       RETURNING *`,
      [circleId, patientId, lat, lng, zoneId, dedupKey, recordedAt.toISOString()],
    );

    const alert = alertRes.rows[0];
    if (!alert) return null;

    try {
      const patientRow = await pool.query('SELECT name FROM users WHERE id = $1', [patientId]);
      const patientName = patientRow.rows[0]?.name ?? 'Your patient';
      const { sendToCareCircle } = await import('../notifications/fcm.service');
      await sendToCareCircle(
        patientId,
        {
          title: '⚠️ Safe Zone Breach',
          body: `${patientName} has left a safe zone${zoneName ? ` (${zoneName})` : ''}.`,
          data: { type: 'ZONE_BREACH', patientId, zoneId, alertId: alert.id },
        },
        'ZONE_EXIT',
      );
    } catch (err) {
      console.warn('[AuthoritativeSafetyService] Zone breach push failed:', err);
    }

    try {
      const { io } = await import('../../server');
      io.to(`patient:${patientId}`).emit('alert:new', { alert });
      io.to(`patient:${patientId}`).emit('alert:updated', { alert });
      io.to(`circle:${circleId}`).emit('alert:new', { alert });
    } catch (_) {}

    return alert;
  }

  /**
   * 2. Record "I'm Responding" Action
   * Decoupled responder ledger: records action without granting exclusive ownership or resolving alert.
   */
  async respondToAlert(alertId: string, responderUser: User, notes?: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const alertRes = await client.query(
        `SELECT sa.*, c.owner_id
         FROM safety_alerts sa
         JOIN care_circles c ON sa.circle_id = c.id
         WHERE sa.id = $1
         FOR UPDATE`,
        [alertId]
      );
      const alert = alertRes.rows[0];
      if (!alert) {
        throw new AppError('NOT_FOUND', 'Safety alert not found', 404);
      }

      if (alert.status === 'RESOLVED') {
        throw new AppError('ALREADY_RESOLVED', 'Cannot respond to an already resolved alert', 400);
      }

      // Check responder authorization
      await this.assertAuthorizedRecipient(alert.circle_id, alert.patient_id, responderUser);

      // Transition TRIGGERED -> ACTIVE if not already active
      let updatedStatus = alert.status;
      if (alert.status === 'TRIGGERED') {
        await client.query(
          `UPDATE safety_alerts SET status = 'ACTIVE' WHERE id = $1`,
          [alertId]
        );
        updatedStatus = 'ACTIVE';
      }

      // Insert response into ledger
      const respRes = await client.query(
        `INSERT INTO safety_alert_responses (alert_id, responder_id, action, notes)
         VALUES ($1, $2, 'IM_RESPONDING', $3)
         RETURNING *`,
        [alertId, responderUser.id, notes || null]
      );

      await client.query('COMMIT');

      // Socket broadcast
      try {
        const { io } = await import('../../server');
        io.to(`patient:${alert.patient_id}`).emit('alert:response', {
          alertId,
          responderId: responderUser.id,
          responderName: responderUser.name,
          action: 'IM_RESPONDING',
          respondedAt: respRes.rows[0].created_at,
        });
      } catch (_) {}

      return {
        alert: { ...alert, status: updatedStatus },
        response: respRes.rows[0],
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * 3. Resolve Safety Alert
   * INVARIANT: Resolving an alert is strictly Circle Owner only in V1 (TARGET_ARCHITECTURE.md §3.6, §4.3, §5.3).
   * Responding does NOT grant resolution authority.
   * Circle members and caregivers receive 403 Forbidden.
   */
  async resolveAlert(alertId: string, resolverUser: User, notes?: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const alertRes = await client.query(
        `SELECT sa.*, c.owner_id
         FROM safety_alerts sa
         JOIN care_circles c ON sa.circle_id = c.id
         WHERE sa.id = $1
         FOR UPDATE`,
        [alertId]
      );
      const alert = alertRes.rows[0];
      if (!alert) {
        throw new AppError('NOT_FOUND', 'Safety alert not found', 404);
      }

      if (alert.status === 'RESOLVED') {
        throw new AppError('ALREADY_RESOLVED', 'Safety alert is already resolved', 400);
      }

      // INVARIANT: Strictly Circle Owner only
      if (alert.owner_id !== resolverUser.id) {
        throw new AppError(
          'OWNER_ONLY',
          'Resolving a safety alert is strictly Circle Owner only in V1. Responders and non-Owner members cannot resolve alerts.',
          403
        );
      }

      // Update alert to RESOLVED
      const updateRes = await client.query(
        `UPDATE safety_alerts
         SET status = 'RESOLVED', resolved_at = NOW(), resolved_by = $1
         WHERE id = $2
         RETURNING *`,
        [resolverUser.id, alertId]
      );

      // Record RESOLVED in response ledger
      const respRes = await client.query(
        `INSERT INTO safety_alert_responses (alert_id, responder_id, action, notes)
         VALUES ($1, $2, 'RESOLVED', $3)
         RETURNING *`,
        [alertId, resolverUser.id, notes || null]
      );

      await client.query('COMMIT');

      // If no other open alerts remain, clear the derived SOS state.
      try {
        const openRes = await pool.query(
          `SELECT COUNT(*)::int AS count FROM safety_alerts
           WHERE patient_id = $1 AND status <> 'RESOLVED'`,
          [alert.patient_id],
        );
        if ((openRes.rows[0]?.count ?? 0) === 0) {
          await pool.query(
            `UPDATE patient_states
             SET safety_state = 'SAFE', sos_active = FALSE, computed_at = NOW()
             WHERE patient_id = $1`,
            [alert.patient_id],
          );
        }
      } catch (err) {
        console.warn('[AuthoritativeSafetyService] state reset after resolution failed:', err);
      }

      // Notify the Care Circle that the incident was resolved.
      try {
        const patientRow = await pool.query('SELECT name FROM users WHERE id = $1', [alert.patient_id]);
        const patientName = patientRow.rows[0]?.name ?? 'Patient';
        const { sendToCareCircle } = await import('../notifications/fcm.service');
        await sendToCareCircle(
          alert.patient_id,
          {
            title: 'Alert Resolved',
            body: `${resolverUser.name || 'The Circle Owner'} resolved the alert for ${patientName}.`,
            data: { type: 'ALERT_RESOLVED', patientId: alert.patient_id, alertId },
          },
          'GENERAL',
        );
      } catch (err) {
        console.warn('[AuthoritativeSafetyService] resolution push failed:', err);
      }

      // Socket broadcast
      try {
        const { io } = await import('../../server');
        io.to(`patient:${alert.patient_id}`).emit('alert:resolved', {
          alertId,
          resolvedBy: resolverUser.id,
          resolvedAt: updateRes.rows[0].resolved_at,
        });
        io.to(`patient:${alert.patient_id}`).emit('state:change', {
          patient_id: alert.patient_id,
          safety_state: 'SAFE',
          computed_at: new Date().toISOString(),
        });
      } catch (_) {}

      return {
        alert: updateRes.rows[0],
        response: respRes.rows[0],
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * 4. List Alerts for a Care Circle
   */
  async listCircleAlerts(circleId: string, status?: string) {
    let sql = `
      SELECT sa.*, u.name as patient_name, u.photo_url as patient_photo,
             sz.name as zone_name,
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
      LEFT JOIN safe_zones sz ON sa.safe_zone_id = sz.id
      LEFT JOIN users res_u ON sa.resolved_by = res_u.id
      LEFT JOIN safety_alert_responses sar ON sa.id = sar.alert_id
      LEFT JOIN users ru ON sar.responder_id = ru.id
      WHERE sa.circle_id = $1`;

    const params: any[] = [circleId];
    if (status) {
      params.push(status);
      sql += ` AND sa.status = $2`;
    }

    sql += ` GROUP BY sa.id, u.id, res_u.id, sz.id ORDER BY sa.triggered_at DESC`;

    const res = await pool.query(sql, params);
    return res.rows;
  }

  /**
   * 5. List Alerts for a Patient
   */
  async listPatientAlerts(patientId: string, status?: string) {
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

    const params: any[] = [patientId];
    if (status) {
      params.push(status);
      sql += ` AND sa.status = $2`;
    }

    sql += ` GROUP BY sa.id, u.id ORDER BY sa.triggered_at DESC`;

    const res = await pool.query(sql, params);
    return res.rows;
  }

  /**
   * Helper: Assert actor is authorized to receive and respond to alerts for the patient.
   */
  private async assertAuthorizedRecipient(circleId: string, patientId: string, user: User) {
    if (user.id === patientId) return;

    if (user.role === 'CAREGIVER') {
      const assignCheck = await pool.query(
        `SELECT pa.id
         FROM patient_assignments pa
         JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
         WHERE cr.caregiver_id = $1
           AND pa.patient_id = $2
           AND pa.is_active = TRUE
           AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')`,
        [user.id, patientId]
      );
      if (assignCheck.rows.length === 0) {
        throw new AppError('CAREGIVER_NOT_ASSIGNED', 'Caregiver is not assigned to this patient', 403);
      }
      return;
    }

    // Family or other member in circle
    const memberCheck = await pool.query(
      `SELECT 1 FROM care_circles c
       WHERE c.id = $1 AND c.owner_id = $2
       UNION
       SELECT 1 FROM care_circle_members m
       WHERE m.circle_id = $1 AND m.user_id = $2`,
      [circleId, user.id]
    );

    if (memberCheck.rows.length > 0) return;

    throw new AppError('FORBIDDEN', 'User is not an authorized recipient for this safety alert', 403);
  }
}

export const authoritativeSafetyService = new AuthoritativeSafetyService();

