/**
 * Notifications / Alerts Router
 * Handles: geofence alert queries, alert acknowledgement, SOS trigger,
 * and the cross-patient caregiver alert feed.
 *
 * POST /api/v1/alerts/sos/patient/:patientId   — PATIENT
 * GET  /api/v1/alerts/patient/:id              — CAREGIVER, FAMILY
 * POST /api/v1/alerts/:id/acknowledge          — CAREGIVER, FAMILY
 * GET  /api/v1/alerts/caregiver/feed           — CAREGIVER
 */

import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../../shared/middleware/authenticate';
import { requireRelationship } from '../../shared/middleware/requireRelationship';
import { asyncHandler, ok } from '../../shared/utils/response';
import { AppError } from '../../shared/errors/AppError';
import pool from '../../db/config';

const router = Router();
router.use(authenticate);

// ─── SOS Trigger ─────────────────────────────────────────────────────────────

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

// ─── Alert List for a Patient ─────────────────────────────────────────────────

router.get('/patient/:patientId',
  requireRelationship('patientId'),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId } = req.params;
    const { type, severity, limit = '20', cursor } = req.query as any;

    let query = `SELECT * FROM geofence_alerts WHERE patient_id = $1`;
    const params: any[] = [patientId];
    let i = 2;

    if (type)     { query += ` AND alert_type = $${i++}`;  params.push(type); }
    if (severity) { query += ` AND severity = $${i++}`;     params.push(severity); }
    if (cursor)   { query += ` AND created_at < $${i++}`;   params.push(cursor); }

    query += ` ORDER BY created_at DESC LIMIT $${i}`;
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
       SET acknowledged_by = $1, acknowledged_at = NOW()
       WHERE id = $2 AND acknowledged_at IS NULL
       RETURNING *`,
      [req.user!.id, req.params.alertId],
    );
    if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Alert not found or already acknowledged', 404);

    // Broadcast acknowledgement to room
    try {
      const { io } = await import('../../server');
      const alert = result.rows[0];
      io.to(`patient:${alert.patient_id}`).emit('alert:acknowledged', {
        alert_id: alert.id,
        acknowledged_by: req.user!.id,
        ts: new Date().toISOString(),
      });
    } catch (_) {}

    ok(res, { alert: result.rows[0] });
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
       WHERE related_user_id = $1 AND status = 'CONFIRMED'`,
      [req.user!.id],
    );

    if (!patientIds.rows.length) {
      return ok(res, { alerts: [], has_more: false });
    }

    const ids = patientIds.rows.map((r: any) => r.patient_user_id);
    const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(',');

    let query = `SELECT ga.*, u.name as patient_name
       FROM geofence_alerts ga
       JOIN users u ON u.id = ga.patient_id
       WHERE ga.patient_id IN (${placeholders})`;
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

export default router;
