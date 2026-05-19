import { Router } from 'express';
import { authenticate, requireRoles } from '../../shared/middleware/authenticate';
import { requireRelationship } from '../../shared/middleware/requireRelationship';
import { asyncHandler, ok, created } from '../../shared/utils/response';
import pool from '../../db/config';
import { AppError } from '../../shared/errors/AppError';
import { Request, Response } from 'express';

const router = Router();
router.use(authenticate);

// ─── Threads ──────────────────────────────────────────────────────────────────

router.get('/patient/:patientId',
  requireRelationship('patientId'),
  asyncHandler(async (req: Request, res: Response) => {
    const { limit = '20', cursor } = req.query as any;

    // Get or create thread
    let thread = await pool.query('SELECT id FROM patient_threads WHERE patient_id = $1', [req.params.patientId]);
    if (!thread.rows[0]) {
      thread = await pool.query(
        'INSERT INTO patient_threads (patient_id) VALUES ($1) RETURNING id',
        [req.params.patientId],
      );
    }
    const threadId = thread.rows[0].id;

    let query = `
      SELECT tm.*, u.name as sender_name, u.photo_url as sender_photo
      FROM thread_messages tm JOIN users u ON u.id = tm.sender_id
      WHERE tm.thread_id = $1
    `;
    const params: any[] = [threadId];
    if (cursor) { query += ` AND tm.created_at < $2`; params.push(cursor); }
    query += ` ORDER BY tm.created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit) + 1);

    const result = await pool.query(query, params);
    const has_more = result.rows.length > parseInt(limit);
    const messages = has_more ? result.rows.slice(0, parseInt(limit)) : result.rows;

    ok(res, { messages, has_more, next_cursor: has_more ? messages[messages.length - 1].created_at : null });
  }),
);

router.post('/patient/:patientId/messages',
  requireRelationship('patientId', ['CAREGIVER','FAMILY_CLOSE','GUARDIAN']),
  asyncHandler(async (req: Request, res: Response) => {
    let thread = await pool.query('SELECT id FROM patient_threads WHERE patient_id = $1', [req.params.patientId]);
    if (!thread.rows[0]) {
      thread = await pool.query(
        'INSERT INTO patient_threads (patient_id) VALUES ($1) RETURNING id',
        [req.params.patientId],
      );
    }
    const result = await pool.query(
      `INSERT INTO thread_messages (thread_id, sender_id, message_type, content, media_url)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [thread.rows[0].id, req.user!.id,
       req.body.message_type ?? 'TEXT', req.body.content ?? null, req.body.media_url ?? null],
    );
    created(res, { message: result.rows[0] });
  }),
);

// ─── Appointments ─────────────────────────────────────────────────────────────

router.get('/calendar/patient/:patientId',
  requireRelationship('patientId'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT * FROM appointments WHERE patient_id = $1 ORDER BY appointment_at`,
      [req.params.patientId],
    );
    ok(res, { appointments: result.rows });
  }),
);

router.post('/calendar/patient/:patientId',
  requireRelationship('patientId', ['CAREGIVER','GUARDIAN']),
  asyncHandler(async (req: Request, res: Response) => {
    const { title, location, notes, appointment_at, duration_minutes, transport_needed } = req.body;
    const result = await pool.query(
      `INSERT INTO appointments (patient_id, created_by, title, location, notes, appointment_at, duration_minutes, transport_needed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.patientId, req.user!.id, title, location ?? null, notes ?? null,
       appointment_at, duration_minutes ?? 60, transport_needed ?? false],
    );
    created(res, { appointment: result.rows[0] });
  }),
);

router.patch('/calendar/:id', asyncHandler(async (req: Request, res: Response) => {
  const { title, location, notes, appointment_at, duration_minutes } = req.body;
  const result = await pool.query(
    `UPDATE appointments SET title=$1, location=$2, notes=$3, appointment_at=$4, duration_minutes=$5
     WHERE id = $6 RETURNING *`,
    [title, location, notes, appointment_at, duration_minutes, req.params.id],
  );
  if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Appointment not found', 404);
  ok(res, { appointment: result.rows[0] });
}));

router.delete('/calendar/:id', asyncHandler(async (req: Request, res: Response) => {
  await pool.query('DELETE FROM appointments WHERE id = $1', [req.params.id]);
  ok(res, { message: 'Appointment deleted' });
}));

// ─── Documents ────────────────────────────────────────────────────────────────

router.get('/documents/patient/:patientId',
  requireRelationship('patientId', ['CAREGIVER','GUARDIAN','DOCTOR']),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await pool.query(
      'SELECT * FROM shared_documents WHERE patient_id = $1 ORDER BY created_at DESC',
      [req.params.patientId],
    );
    ok(res, { documents: result.rows });
  }),
);

router.post('/documents/patient/:patientId',
  requireRelationship('patientId', ['CAREGIVER','GUARDIAN']),
  asyncHandler(async (req: Request, res: Response) => {
    const { title, document_type, storage_path, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO shared_documents (patient_id, uploaded_by, title, document_type, storage_path, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.patientId, req.user!.id, title, document_type, storage_path, notes ?? null],
    );
    created(res, { document: result.rows[0] });
  }),
);

// ─── Handovers ────────────────────────────────────────────────────────────────

router.get('/handovers/patient/:patientId',
  requireRoles('CAREGIVER'),
  requireRelationship('patientId', ['CAREGIVER']),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT h.*, u.name as from_caregiver_name
       FROM caregiver_handovers h JOIN users u ON u.id = h.from_caregiver
       WHERE h.patient_id = $1 ORDER BY h.created_at DESC LIMIT 20`,
      [req.params.patientId],
    );
    ok(res, { handovers: result.rows });
  }),
);

router.post('/handovers/patient/:patientId',
  requireRoles('CAREGIVER'),
  requireRelationship('patientId', ['CAREGIVER']),
  asyncHandler(async (req: Request, res: Response) => {
    const { mood_today, tasks_summary, anomalies, medications_ok, watch_for, to_caregiver } = req.body;
    const result = await pool.query(
      `INSERT INTO caregiver_handovers
         (patient_id, from_caregiver, to_caregiver, mood_today, tasks_summary, anomalies, medications_ok, watch_for)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.patientId, req.user!.id, to_caregiver ?? null,
       mood_today ?? null, tasks_summary ?? null, anomalies ?? null,
       medications_ok ?? true, watch_for ?? null],
    );
    created(res, { handover: result.rows[0] });
  }),
);

// ─── Wellbeing Logs ───────────────────────────────────────────────────────────

router.post('/wellbeing/log',
  requireRoles('CAREGIVER'),
  asyncHandler(async (req: Request, res: Response) => {
    const { mood_score, shift_note, alert_count_today } = req.body;
    const result = await pool.query(
      `INSERT INTO caregiver_wellbeing_logs (caregiver_id, mood_score, shift_note, alert_count_today, burnout_flag)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user!.id, mood_score, shift_note ?? null, alert_count_today ?? 0, mood_score <= 2],
    );
    created(res, { log: result.rows[0] });
  }),
);

router.get('/wellbeing/my-logs',
  requireRoles('CAREGIVER'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await pool.query(
      'SELECT * FROM caregiver_wellbeing_logs WHERE caregiver_id = $1 ORDER BY logged_at DESC LIMIT 30',
      [req.user!.id],
    );
    ok(res, { logs: result.rows });
  }),
);

// ─── Incidents & Ratings ──────────────────────────────────────────────────────

router.post('/incidents', asyncHandler(async (req: Request, res: Response) => {
  const { reported_user, patient_id, description } = req.body;
  const result = await pool.query(
    `INSERT INTO incident_reports (reported_by, reported_user, patient_id, description)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.user!.id, reported_user, patient_id, description],
  );
  created(res, { report: result.rows[0] });
}));

router.post('/ratings/caregiver/:caregiverId',
  requireRoles('FAMILY'),
  asyncHandler(async (req: Request, res: Response) => {
    const { patient_id, score, comment } = req.body;
    const result = await pool.query(
      `INSERT INTO caregiver_ratings (caregiver_id, rated_by, patient_id, score, comment)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (caregiver_id, rated_by, patient_id) DO UPDATE SET score=$4, comment=$5
       RETURNING *`,
      [req.params.caregiverId, req.user!.id, patient_id, score, comment ?? null],
    );

    // Update caregiver profile rating average
    await pool.query(
      `UPDATE caregiver_profiles cp SET
         rating = (SELECT AVG(score) FROM caregiver_ratings WHERE caregiver_id = $1),
         rating_count = (SELECT COUNT(*) FROM caregiver_ratings WHERE caregiver_id = $1)
       WHERE user_id = $1`,
      [req.params.caregiverId],
    );

    ok(res, { rating: result.rows[0] });
  }),
);

export default router;
