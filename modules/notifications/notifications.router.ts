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

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRoles } from '../../shared/middleware/authenticate';
import { requireRelationship } from '../../shared/middleware/requireRelationship';
import { asyncHandler, ok, created } from '../../shared/utils/response';
import { AppError } from '../../shared/errors/AppError';
import pool from '../../db/config';
import { upsertDeviceToken } from './fcm.service';
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

    const state = await pool.query('SELECT last_known_lat, last_known_lng FROM patient_states WHERE patient_id = $1', [patientId]);
    const lat = state.rows[0]?.last_known_lat ?? 0;
    const lng = state.rows[0]?.last_known_lng ?? 0;

    const { authoritativeSafetyService } = await import('../alerts/authoritative-safety.service');
    const alert = await authoritativeSafetyService.triggerSOS(patientId, lat, lng);

    ok(res, { message: 'SOS triggered', alert });
  }),
);

// ─── Alert List for a Patient (Canonical safety_alerts) ───────────────────────

router.get('/patient/:patientId',
  requireRelationship('patientId'),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId } = req.params;
    const { status, limit = '20', cursor } = req.query as any;

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
    const params: any[] = [patientId];
    let i = 2;

    if (status) { query += ` AND sa.status = $${i++}`; params.push(status); }
    if (cursor) { query += ` AND sa.triggered_at < $${i++}`; params.push(cursor); }

    query += ` ORDER BY sa.triggered_at DESC LIMIT $${i}`;
    params.push(parseInt(limit) + 1);

    const result = await pool.query(query, params);
    const has_more = result.rows.length > parseInt(limit);
    const alerts = has_more ? result.rows.slice(0, parseInt(limit)) : result.rows;

    ok(res, { alerts, has_more, next_cursor: has_more ? alerts[alerts.length - 1].triggered_at : null });
  }),
);

// ─── Acknowledge Alert (Authoritative) ────────────────────────────────────────

router.post('/:alertId/acknowledge',
  asyncHandler(async (req: Request, res: Response) => {
    const { authoritativeSafetyService } = await import('../alerts/authoritative-safety.service');
    const result = await authoritativeSafetyService.respondToAlert(req.params.alertId, req.user!, 'Acknowledged');
    ok(res, result);
  }),
);

// ─── Respond Alert (Authoritative) ────────────────────────────────────────────

router.post('/:alertId/respond',
  asyncHandler(async (req: Request, res: Response) => {
    const { authoritativeSafetyService } = await import('../alerts/authoritative-safety.service');
    const result = await authoritativeSafetyService.respondToAlert(req.params.alertId, req.user!, req.body?.notes);
    ok(res, result);
  }),
);

// ─── Resolve Single Alert (Authoritative) ────────────────────────────────────

router.post('/:alertId/resolve',
  asyncHandler(async (req: Request, res: Response) => {
    const { authoritativeSafetyService } = await import('../alerts/authoritative-safety.service');
    const result = await authoritativeSafetyService.resolveAlert(req.params.alertId, req.user!, req.body?.notes);
    ok(res, result);
  }),
);

// ─── Caregiver Cross-Patient Feed ─────────────────────────────────────────────

router.get('/caregiver/feed',
  requireRoles('CAREGIVER'),
  asyncHandler(async (req: Request, res: Response) => {
    const { limit = '30', cursor } = req.query as any;

    // Get all assigned patient IDs for this caregiver from canonical tables
    const patientIds = await pool.query(
      `SELECT pa.patient_id
       FROM patient_assignments pa
       JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
       JOIN care_circles c ON cr.circle_id = c.id
       WHERE cr.caregiver_id = $1
         AND pa.is_active = TRUE
         AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
         AND c.terminated_at IS NULL`,
      [req.user!.id],
    );

    if (!patientIds.rows.length) {
      return ok(res, { alerts: [], has_more: false });
    }

    const ids = patientIds.rows.map((r: any) => r.patient_id);
    const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(',');

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
    const params: any[] = [...ids];

    if (cursor) {
      query += ` AND sa.triggered_at < $${params.length + 1}`;
      params.push(cursor);
    }

    query += ` GROUP BY sa.id, u.name, u_res.name
               ORDER BY sa.triggered_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit) + 1);

    const result = await pool.query(query, params);
    const has_more = result.rows.length > parseInt(limit);
    const alerts = has_more ? result.rows.slice(0, parseInt(limit)) : result.rows;

    ok(res, { alerts, has_more, next_cursor: has_more ? alerts[alerts.length - 1].triggered_at : null });
  }),
);

// ─── Notification Settings Imports ─────────────────────────────────────────────
import { getOrCreateNotificationSettings, updateNotificationSettings } from './notification.service';

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

// ─── Patient Reminders Endpoints (Decommissioned) ─────────────────────────────
const deprecatedRemindersHandler = (_req: any, _res: any, next: any) => {
  next(new AppError('DEPRECATED_ENDPOINT', 'Legacy reminder endpoints are deprecated (410 GONE). Use authoritative routine occurrence endpoints for care routine tracking at /api/v1/patients/:patientId/routines/occurrences.', 410));
};

router.all('/reminders', deprecatedRemindersHandler);
router.all('/reminders/*', deprecatedRemindersHandler);

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

// ─── Test / Validation Endpoints (Dev) ────────────────────────────────────────

/** POST /alerts/test/notification — create a test notification for the caller. */
router.post('/test/notification',
  asyncHandler(async (req: Request, res: Response) => {
    const { createInAppNotification } = await import('./notification.service');
    const notification = await createInAppNotification({
      userId:           req.user!.id,
      notificationType: 'TEST_NOTIFICATION',
      priority:         'MEDIUM',
      title:            '🔔 Test Notification',
      body:             `This is a test notification triggered at ${new Date().toLocaleTimeString()}.`,
      payload:          { isTest: true, triggeredAt: new Date().toISOString() },
    });
    created(res, { notification });
  }),
);

export default router;

