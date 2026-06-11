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

import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../../shared/middleware/authenticate';
import { requireRelationship } from '../../shared/middleware/requireRelationship';
import { asyncHandler, ok, created } from '../../shared/utils/response';
import { AppError } from '../../shared/errors/AppError';
import pool from '../../db/config';
import { upsertDeviceToken, sendToCareCircle } from './fcm.service';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ─── FCM Device Token Registration ───────────────────────────────────────────

const DeviceSchema = z.object({
  device_token: z.string().min(10),
  device_type:  z.enum(['PHONE_IOS', 'PHONE_ANDROID']),
  device_name:  z.string().optional(),
  app_version:  z.string().optional(),
});

router.post('/devices/register',
  asyncHandler(async (req: Request, res: Response) => {
    const { device_token, device_type, device_name, app_version } = DeviceSchema.parse(req.body);
    await upsertDeviceToken(req.user!.id, device_token, device_type, device_name, app_version);
    created(res, { registered: true });
  }),
);

router.post('/sos/patient/:patientId',
  requireRoles('PATIENT'),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId } = req.params;

    // Ensure the patient is the requesting user
    if (req.user!.id !== patientId) {
      throw new AppError('ROLE_NOT_PERMITTED', 'Patients can only trigger SOS for themselves', 403);
    }

    // Mark SOS active on patient state
    await pool.query(
      `UPDATE patient_states SET sos_active = TRUE, computed_at = NOW()
       WHERE patient_id = $1`,
      [patientId],
    );

    // Create CRITICAL alert
    const state = await pool.query('SELECT last_known_lat, last_known_lng FROM patient_states WHERE patient_id = $1', [patientId]);
    const lat = state.rows[0]?.last_known_lat ?? 0;
    const lng = state.rows[0]?.last_known_lng ?? 0;

    const alert = await pool.query(
      `INSERT INTO geofence_alerts (patient_id, alert_type, severity, lat, lng, dedup_key)
       VALUES ($1,'SOS_TRIGGERED','CRITICAL',$2,$3,$4)
       ON CONFLICT (dedup_key) DO NOTHING RETURNING *`,
      [patientId, lat, lng, `sos:${patientId}:${Math.floor(Date.now() / 60000)}`],
    );

    // Notify connected caregivers/family via WebSocket
    try {
      const { io } = await import('../../server');
      io.to(`patient:${patientId}`).emit('sos:triggered', {
        patient_id: patientId,
        alert: alert.rows[0],
        ts: new Date().toISOString(),
      });
    } catch (_) { /* WebSocket optional — FCM would fire here too */ }

    ok(res, { message: 'SOS triggered', alert: alert.rows[0] ?? null });
  }),
);

// ─── Helper to fetch populated alert ──────────────────────────────────────────
async function fetchFullAlertDetails(alertId: string) {
  const result = await pool.query(
    `SELECT ga.*, 
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
     WHERE ga.id = $1`,
    [alertId],
  );
  return result.rows[0];
}

async function notifyCareCircleOfAlertUpdate(patientId: string, actorId: string, alertId: string, title: string, body: string, notificationType: string) {
  try {
    const cgRes = await pool.query(
      `SELECT related_user_id FROM patient_relationships 
       WHERE patient_user_id = $1 AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`,
      [patientId]
    );
    const recipients = cgRes.rows.map((r: any) => r.related_user_id).filter((id: string) => id !== actorId);
    
    if (patientId !== actorId) {
      recipients.push(patientId);
    }

    const { createInAppNotification } = await import('./notification.service');
    for (const recipientId of recipients) {
      await createInAppNotification({
        userId: recipientId,
        notificationType: notificationType as any,
        priority: 'HIGH',
        title,
        body,
        payload: { alertId, patientId }
      });
    }
  } catch (err) {
    console.error('Failed to notify care circle of alert update:', err);
  }
}

// ─── Alert List for a Patient ─────────────────────────────────────────────────

router.get('/patient/:patientId',
  requireRelationship('patientId'),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId } = req.params;
    const { type, severity, limit = '20', cursor } = req.query as any;

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
    const params: any[] = [patientId];
    let i = 2;

    if (type)     { query += ` AND ga.alert_type = $${i++}`;  params.push(type); }
    if (severity) { query += ` AND ga.severity = $${i++}`;     params.push(severity); }
    if (cursor)   { query += ` AND ga.created_at < $${i++}`;   params.push(cursor); }

    query += ` ORDER BY ga.created_at DESC LIMIT $${i}`;
    params.push(parseInt(limit) + 1);

    const result = await pool.query(query, params);
    const has_more = result.rows.length > parseInt(limit);
    const alerts = has_more ? result.rows.slice(0, parseInt(limit)) : result.rows;

    ok(res, { alerts, has_more, next_cursor: has_more ? alerts[alerts.length - 1].created_at : null });
  }),
);

// ─── Acknowledge Alert ────────────────────────────────────────────────────────

router.post('/:alertId/acknowledge',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await pool.query(
      `UPDATE geofence_alerts
       SET acknowledged_by = $1, acknowledged_at = NOW(), status = 'ACKNOWLEDGED'
       WHERE id = $2 AND status = 'OPEN'
       RETURNING *`,
      [req.user!.id, req.params.alertId],
    );
    if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Alert not found, already acknowledged, or resolved', 404);

    const fullAlert = await fetchFullAlertDetails(req.params.alertId);

    // Broadcast acknowledgement to room
    try {
      const { io } = await import('../../server');
      io.to(`patient:${fullAlert.patient_id}`).emit('alert:updated', {
        alert: fullAlert,
      });
      // Backward compatibility socket trigger
      io.to(`patient:${fullAlert.patient_id}`).emit('alert:acknowledged', {
        alert_id: fullAlert.id,
        acknowledged_by: req.user!.id,
        ts: new Date().toISOString(),
      });
    } catch (_) {}

    // Send notifications to Care Circle
    const actorName = req.user!.name || 'A care circle member';
    const patientName = fullAlert.patient_name || 'Patient';
    await notifyCareCircleOfAlertUpdate(
      fullAlert.patient_id,
      req.user!.id,
      fullAlert.id,
      'Alert Acknowledged',
      `${actorName} acknowledged the alert for ${patientName}.`,
      'ALERT_ACKNOWLEDGED'
    );

    ok(res, { alert: fullAlert });
  }),
);

// ─── Respond Alert ────────────────────────────────────────────────────────────

router.post('/:alertId/respond',
  asyncHandler(async (req: Request, res: Response) => {
    const alertCheck = await pool.query('SELECT patient_id FROM geofence_alerts WHERE id = $1', [req.params.alertId]);
    if (!alertCheck.rows[0]) throw new AppError('NOT_FOUND', 'Alert not found', 404);
    const patientId = alertCheck.rows[0].patient_id;

    // Get user role label
    const relResult = await pool.query(
      `SELECT relationship_type FROM patient_relationships WHERE patient_user_id = $1 AND related_user_id = $2`,
      [patientId, req.user!.id]
    );
    const roleLabel = relResult.rows[0]?.relationship_type ?? req.user!.role;

    const result = await pool.query(
      `UPDATE geofence_alerts
       SET responder_id = $1, responder_role = $2, responded_at = NOW(), status = 'RESPONDING',
           acknowledged_by = COALESCE(acknowledged_by, $1), acknowledged_at = COALESCE(acknowledged_at, NOW())
       WHERE id = $3 AND status IN ('OPEN', 'ACKNOWLEDGED')
       RETURNING *`,
      [req.user!.id, roleLabel, req.params.alertId],
    );
    if (!result.rows[0]) throw new AppError('BAD_REQUEST', 'Cannot respond to this alert', 400);

    const fullAlert = await fetchFullAlertDetails(req.params.alertId);

    // Broadcast response update to room
    try {
      const { io } = await import('../../server');
      io.to(`patient:${fullAlert.patient_id}`).emit('alert:updated', {
        alert: fullAlert,
      });
    } catch (_) {}

    // Send notifications to Care Circle
    const actorName = req.user!.name || 'A care circle member';
    const patientName = fullAlert.patient_name || 'Patient';
    await notifyCareCircleOfAlertUpdate(
      fullAlert.patient_id,
      req.user!.id,
      fullAlert.id,
      'Responding to Alert',
      `${actorName} is responding to the alert for ${patientName}.`,
      'ALERT_RESPONDING'
    );

    ok(res, { alert: fullAlert });
  }),
);

// ─── Resolve Patient Incident ─────────────────────────────────────────────────

router.post('/patient/:patientId/resolve',
  requireRelationship('patientId', ['CAREGIVER','GUARDIAN']),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId } = req.params;
    const userId = req.user!.id;

    // Find all open/responding alerts to resolve
    const activeAlertsResult = await pool.query(
      `SELECT id FROM geofence_alerts WHERE patient_id = $1 AND status != 'RESOLVED'`,
      [patientId]
    );

    // 1. Resolve all open geofence alerts for this patient
    await pool.query(
      `UPDATE geofence_alerts
       SET status = 'RESOLVED', resolved_by = $1, resolved_at = NOW(), 
           acknowledged_by = COALESCE(acknowledged_by, $1), acknowledged_at = COALESCE(acknowledged_at, NOW())
       WHERE patient_id = $2 AND status != 'RESOLVED'`,
      [userId, patientId],
    );

    // 2. Set patient safety state back to SAFE and reset sos_active to FALSE
    await pool.query(
      `UPDATE patient_states
       SET safety_state = 'SAFE', sos_active = FALSE, computed_at = NOW()
       WHERE patient_id = $1`,
      [patientId],
    );

    // 3. Broadcast to websocket room
    try {
      const { io } = await import('../../server');
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
    } catch (_) {}

    // Send notifications to Care Circle
    try {
      const patientRow = await pool.query('SELECT name FROM users WHERE id = $1', [patientId]);
      const patientName = patientRow.rows[0]?.name || 'Patient';
      const actorName = req.user!.name || 'A care circle member';

      for (const row of activeAlertsResult.rows) {
        await notifyCareCircleOfAlertUpdate(
          patientId,
          userId,
          row.id,
          'Alert Resolved',
          `${actorName} resolved the alert for ${patientName}.`,
          'ALERT_RESOLVED'
        );
      }
    } catch (err) {
      console.error('Failed to notify care circle of alert resolution:', err);
    }

    ok(res, { success: true });
  }),
);

// ─── Caregiver Cross-Patient Feed ─────────────────────────────────────────────

router.get('/caregiver/feed',
  requireRoles('CAREGIVER'),
  asyncHandler(async (req: Request, res: Response) => {
    const { limit = '30', cursor } = req.query as any;

    // Get all patient IDs for this caregiver
    const patientIds = await pool.query(
      `SELECT patient_user_id FROM patient_relationships
       WHERE related_user_id = $1 
         AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`,
      [req.user!.id],
    );

    if (!patientIds.rows.length) {
      return ok(res, { alerts: [], has_more: false });
    }

    const ids = patientIds.rows.map((r: any) => r.patient_user_id);
    const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(',');

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
    const params: any[] = [...ids];

    if (cursor) {
      query += ` AND ga.created_at < $${params.length + 1}`;
      params.push(cursor);
    }

    query += ` ORDER BY ga.created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit) + 1);

    const result = await pool.query(query, params);
    const has_more = result.rows.length > parseInt(limit);
    const alerts = has_more ? result.rows.slice(0, parseInt(limit)) : result.rows;

    ok(res, { alerts, has_more, next_cursor: has_more ? alerts[alerts.length - 1].created_at : null });
  }),
);

// ─── Notification Settings & Reminders Service Imports ────────────────────────
import { getOrCreateNotificationSettings, updateNotificationSettings } from './notification.service';
import { getActivePatientReminders, snoozeReminder, completeReminder, skipReminder } from './reminders.service';

// ─── Notification Settings Endpoints ──────────────────────────────────────────

router.get('/settings',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const settings = await getOrCreateNotificationSettings(userId);
    ok(res, { settings });
  })
);

router.put('/settings',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const updated = await updateNotificationSettings(userId, req.body);
    ok(res, { settings: updated });
  })
);

// ─── Patient Reminders Endpoints ──────────────────────────────────────────────

router.get('/reminders/active',
  asyncHandler(async (req: Request, res: Response) => {
    let patientId = req.user!.id;
    if (req.user!.role !== 'PATIENT') {
      const qPatientId = req.query.patientId as string;
      if (!qPatientId) {
        throw new AppError('BAD_REQUEST', 'patientId query parameter is required for non-patients', 400);
      }
      // Check relationship (support CONFIRMED, ACTIVE_CARE, etc. status)
      const relCheck = await pool.query(
        `SELECT id FROM patient_relationships
         WHERE patient_user_id = $1 AND related_user_id = $2 AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`,
        [qPatientId, req.user!.id]
      );
      if (!relCheck.rows[0]) {
        throw new AppError('ROLE_NOT_PERMITTED', 'Not authorised to view reminders for this patient', 403);
      }
      patientId = qPatientId;
    }

    const reminders = await getActivePatientReminders(patientId);
    ok(res, { reminders });
  })
);

router.post('/reminders/:id/action',
  asyncHandler(async (req: Request, res: Response) => {
    const reminderId = req.params.id;
    const { action, snooze_minutes } = z.object({
      action: z.enum(['COMPLETE', 'SNOOZE', 'SKIP']),
      snooze_minutes: z.number().int().optional(),
    }).parse(req.body);

    const actorId = req.user!.id;
    let reminder;

    if (action === 'COMPLETE') {
      reminder = await completeReminder(reminderId, actorId);
      // Mark task complete as well if reference is a task
      if (reminder.reference_type === 'ROUTINE' && reminder.reference_id) {
        try {
          const { updateTaskStatus } = await import('../routines/routines.service');
          await updateTaskStatus(reminder.reference_id, actorId, 'DONE');
        } catch (err) {
          console.warn('[NotificationsRouter] Failed to sync task completion status:', err);
        }
      }
    } else if (action === 'SNOOZE') {
      reminder = await snoozeReminder(reminderId, snooze_minutes ?? 5);
    } else {
      reminder = await skipReminder(reminderId, actorId);
      // Mark task skipped if reference is a task
      if (reminder.reference_type === 'ROUTINE' && reminder.reference_id) {
        try {
          const { updateTaskStatus } = await import('../routines/routines.service');
          await updateTaskStatus(reminder.reference_id, actorId, 'SKIPPED');
        } catch (err) {
          console.warn('[NotificationsRouter] Failed to sync task skip status:', err);
        }
      }
    }

    ok(res, { reminder });
  })
);

// ─── Notification History Endpoints ──────────────────────────────────────────

router.get('/history',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const result = await pool.query(
      `SELECT * FROM notification_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );
    ok(res, { notifications: result.rows });
  }),
);

router.post('/:id/read',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const result = await pool.query(
      `UPDATE notification_logs
       SET is_read = TRUE, read_at = NOW(), opened = TRUE, opened_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, userId]
    );
    if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Notification not found', 404);
    ok(res, { notification: result.rows[0] });
  }),
);

router.post('/read-all',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    await pool.query(
      `UPDATE notification_logs
       SET is_read = TRUE, read_at = NOW(), opened = TRUE, opened_at = NOW()
       WHERE user_id = $1 AND is_read = FALSE`,
      [userId]
    );
    ok(res, { success: true });
  }),
);

export default router;
