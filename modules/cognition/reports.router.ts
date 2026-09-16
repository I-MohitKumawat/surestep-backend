import { Router } from 'express';
import { authenticate, requireRoles } from '../../shared/middleware/authenticate';
import { requireRelationship } from '../../shared/middleware/requireRelationship';
import { asyncHandler, ok } from '../../shared/utils/response';
import pool from '../../db/config';
import { Request, Response } from 'express';

const router = Router();
router.use(authenticate);

// ─── Family Digest ────────────────────────────────────────────────────────────

router.get('/family-digest/patient/:patientId',
  requireRoles('FAMILY'),
  requireRelationship('patientId'),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId } = req.params;

    const [state, tasks, lastAlert, recentSession] = await Promise.all([
      pool.query('SELECT * FROM patient_states WHERE patient_id = $1', [patientId]),
      pool.query(
        `SELECT status, COUNT(*) as count FROM tasks
         WHERE patient_id = $1 AND scheduled_date = CURRENT_DATE AND deleted_at IS NULL GROUP BY status`,
        [patientId],
      ),
      pool.query(
        `SELECT * FROM geofence_alerts WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [patientId],
      ),
      pool.query(
        `SELECT ca.* FROM cognitive_assessments ca WHERE patient_id = $1 ORDER BY period_start DESC LIMIT 1`,
        [patientId],
      ),
    ]);

    const taskSummary = Object.fromEntries(
      tasks.rows.map((r: any) => [r.status.toLowerCase(), parseInt(r.count)]),
    );

    ok(res, {
      digest: {
        patient_state: state.rows[0] ?? null,
        today_tasks: taskSummary,
        last_alert: lastAlert.rows[0] ?? null,
        latest_assessment: recentSession.rows[0] ?? null,
      },
    });
  }),
);

// ─── Caregiver Weekly Summary ─────────────────────────────────────────────────

router.get('/caregiver-summary/patient/:patientId',
  requireRoles('CAREGIVER'),
  requireRelationship('patientId', ['CAREGIVER']),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId } = req.params;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const since = sevenDaysAgo.toISOString().split('T')[0];

    const [tasks, alerts, sessions] = await Promise.all([
      pool.query(
        `SELECT status, COUNT(*) as count FROM tasks
         WHERE patient_id = $1 AND scheduled_date >= $2 AND deleted_at IS NULL GROUP BY status`,
        [patientId, since],
      ),
      pool.query(
        `SELECT alert_type, severity, COUNT(*) as count FROM geofence_alerts
         WHERE patient_id = $1 AND created_at >= $2 GROUP BY alert_type, severity`,
        [patientId, since],
      ),
      pool.query(
        `SELECT game_type, AVG(score) as avg_score, COUNT(*) as count
         FROM game_sessions WHERE patient_id = $1 AND played_at >= $2 GROUP BY game_type`,
        [patientId, since],
      ),
    ]);

    ok(res, {
      summary: {
        period: { from: since, to: new Date().toISOString().split('T')[0] },
        task_completion: Object.fromEntries(tasks.rows.map((r: any) => [r.status, parseInt(r.count)])),
        alerts: alerts.rows,
        cognitive_sessions: sessions.rows,
      },
    });
  }),
);

// ─── Clinical Export (Doctor) ─────────────────────────────────────────────────

router.get('/clinical-export/patient/:patientId',
  requireRoles('FAMILY'), // DOCTOR role maps to FAMILY with relationship_type=DOCTOR
  requireRelationship('patientId', ['DOCTOR']),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId } = req.params;

    const [patient, assessments, sessions] = await Promise.all([
      pool.query('SELECT u.*, pp.* FROM users u JOIN patient_profiles pp ON pp.user_id = u.id WHERE u.id = $1', [patientId]),
      pool.query('SELECT * FROM cognitive_assessments WHERE patient_id = $1 ORDER BY period_start', [patientId]),
      pool.query(
        `SELECT gs.*, array_agg(json_build_object('metric_type', gm.metric_type, 'value', gm.value) ORDER BY gm.recorded_at) as metrics
         FROM game_sessions gs LEFT JOIN game_metrics gm ON gm.session_id = gs.id
         WHERE gs.patient_id = $1 GROUP BY gs.id ORDER BY gs.played_at DESC LIMIT 50`,
        [patientId],
      ),
    ]);

    ok(res, {
      clinical_export: {
        patient: patient.rows[0] ?? null,
        assessments: assessments.rows,
        game_sessions: sessions.rows,
        exported_at: new Date().toISOString(),
      },
    });
  }),
);

export default router;
