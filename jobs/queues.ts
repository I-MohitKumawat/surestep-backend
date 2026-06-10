/**
 * Bull Job Queue — Background Workers
 *
 * Jobs:
 *  1. dailyOrientationCheck  — fires at 7:00am IST for each patient
 *  2. routineStateSweep      — every 15 min: marks BEHIND / MISSED_CRITICAL tasks
 *  3. weeklyReportGeneration — every Sunday night: builds cognitive_assessments rows
 *  4. noSignalEscalation     — every 5 min: escalates patients with NO_SIGNAL > 15 min
 */

import Bull from 'bull';
import pool from '../db/config';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const opts = { redis: REDIS_URL };

// ─── Queue Definitions ────────────────────────────────────────────────────────

export const orientationQueue    = new Bull('daily-orientation',    opts);
export const routineSweepQueue   = new Bull('routine-sweep',        opts);
export const weeklyReportQueue   = new Bull('weekly-report',        opts);
export const noSignalQueue       = new Bull('no-signal-escalation', opts);

// ─── Processors ───────────────────────────────────────────────────────────────

/** Daily orientation: queue a SCHEDULED voice message for each active patient */
orientationQueue.process(async (job) => {
  const { patientId } = job.data;
  console.log(`[orientation] Processing patient ${patientId}`);

  // Check: hasn't had orientation today yet
  const today = new Date().toISOString().split('T')[0];
  const alreadySent = await pool.query(
    `SELECT id FROM voice_messages
     WHERE patient_id = $1 AND trigger_type = 'SCHEDULED'
       AND created_at::date = $2 LIMIT 1`,
    [patientId, today],
  );
  if (alreadySent.rows[0]) return { skipped: true };

  // Fetch patient name for script
  const user = await pool.query('SELECT name, preferred_language FROM users WHERE id = $1', [patientId]);
  if (!user.rows[0]) return;

  const { name, preferred_language: lang } = user.rows[0];
  const now = new Date();
  const day  = now.toLocaleDateString('en-IN', { weekday: 'long' });
  const date = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  const script = `Good morning ${name}! Today is ${day}, ${date}. Hope you have a wonderful day ahead.`;

  await pool.query(
    `INSERT INTO voice_messages (patient_id, trigger_type, script, status)
     VALUES ($1, 'SCHEDULED', $2, 'QUEUED')`,
    [patientId, script],
  );

  return { queued: true };
});

/** Routine sweep: check for BEHIND / MISSED_CRITICAL tasks every 15 minutes */
routineSweepQueue.process(async (_job) => {
  const today = new Date().toISOString().split('T')[0];
  const now   = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;

  // Mark tasks as MISSED if overdue by > 60 min and still PENDING
  const overdue = await pool.query(
    `UPDATE tasks SET status = 'MISSED'
     WHERE status = 'PENDING'
       AND scheduled_date = $1
       AND (scheduled_time::time + INTERVAL '60 minutes') < $2::time
     RETURNING id, title, patient_id, is_critical`,
    [today, timeStr],
  );

  // Collect patients with critical misses
  const criticalPatients = new Set<string>();
  for (const row of overdue.rows) {
    if (row.is_critical) {
      criticalPatients.add(row.patient_id);

      try {
        // Fetch patient details
        const patientRes = await pool.query(
          `SELECT u.name, ps.last_known_lat, ps.last_known_lng 
           FROM users u 
           LEFT JOIN patient_states ps ON ps.patient_id = u.id 
           WHERE u.id = $1`,
          [row.patient_id]
        );
        const patientName = patientRes.rows[0]?.name ?? 'Patient';
        const lat = patientRes.rows[0]?.last_known_lat ?? 0;
        const lng = patientRes.rows[0]?.last_known_lng ?? 0;

        // Insert geofence_alerts row
        const dedupKey = `missed_task:${row.id}:${today}`;
        const alertResult = await pool.query(
          `INSERT INTO geofence_alerts (patient_id, alert_type, severity, lat, lng, dedup_key)
           VALUES ($1, 'TASK_MISSED_CRITICAL', 'WARNING', $2, $3, $4)
           ON CONFLICT (dedup_key) DO NOTHING
           RETURNING id`,
          [row.patient_id, lat, lng, dedupKey]
        );

        // Notify Care Circle
        if (alertResult.rows[0]) {
          const { sendToCareCircle } = await import('../modules/notifications/fcm.service');
          await sendToCareCircle(
            row.patient_id,
            {
              title: `Critical Routine Missed`,
              body: `${patientName} missed the critical routine: "${row.title}".`,
              data: {
                route: 'PatientDetailScreen',
                patientId: row.patient_id,
              },
            },
            'TASK_MISSED_CRITICAL'
          );
        }
      } catch (err) {
        console.error('[routineSweepQueue] Failed to escalate critical routine miss:', err);
      }
    }
  }

  // Update routine_state for affected patients
  for (const patientId of criticalPatients) {
    await pool.query(
      `UPDATE patient_states SET routine_state = 'MISSED_CRITICAL', computed_at = NOW()
       WHERE patient_id = $1`,
      [patientId],
    );
  }

  // Also mark patients with any pending task > 15 min late as BEHIND
  await pool.query(
    `UPDATE patient_states ps
     SET routine_state = (CASE
       WHEN ps.routine_state = 'MISSED_CRITICAL' THEN 'MISSED_CRITICAL'
       ELSE 'BEHIND'
     END)::routine_state, computed_at = NOW()
     FROM users u
     WHERE ps.patient_id = u.id
       AND u.role = 'PATIENT'
       AND EXISTS (
         SELECT 1 FROM tasks t
         WHERE t.patient_id = u.id AND t.status = 'PENDING'
           AND t.scheduled_date = $1
           AND (t.scheduled_time::time + INTERVAL '15 minutes') < $2::time
       )`,
    [today, timeStr],
  );

  return { processed: overdue.rows.length };
});

/** Weekly report: compute cognitive_assessments for each patient */
weeklyReportQueue.process(async (_job) => {
  const periodEnd   = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const periodStart = sevenDaysAgo.toISOString().split('T')[0];

  // Get all active patients
  const patients = await pool.query(
    `SELECT id FROM users WHERE role = 'PATIENT' AND is_active = TRUE AND deleted_at IS NULL`,
  );

  for (const { id: patientId } of patients.rows) {
    // Aggregate metrics for the week
    const metrics = await pool.query(
      `SELECT gm.metric_type, AVG(gm.value) as avg_val, COUNT(*) as cnt
       FROM game_metrics gm
       JOIN game_sessions gs ON gs.id = gm.session_id
       WHERE gs.patient_id = $1 AND gs.played_at::date BETWEEN $2 AND $3
       GROUP BY gm.metric_type`,
      [patientId, periodStart, periodEnd],
    );

    const sessionCount = await pool.query(
      `SELECT COUNT(*) as cnt FROM game_sessions
       WHERE patient_id = $1 AND played_at::date BETWEEN $2 AND $3`,
      [patientId, periodStart, periodEnd],
    );

    if (!metrics.rows.length) continue;

    // Map metric types to domain scores (0–100 normalised)
    const scoreMap: Record<string, number> = {};
    for (const m of metrics.rows) {
      scoreMap[m.metric_type] = parseFloat(m.avg_val);
    }

    const memoryScore      = scoreMap['RECALL_ACCURACY']     ?? null;
    const attentionScore   = scoreMap['REACTION_TIME_MS']
      ? Math.max(0, 100 - scoreMap['REACTION_TIME_MS'] / 20) : null;
    const orientationScore = scoreMap['ORIENTATION_CORRECT'] ?? null;

    // Upsert assessment row
    await pool.query(
      `INSERT INTO cognitive_assessments
         (patient_id, period_start, period_end, memory_score, attention_score,
          orientation_score, sessions_count, trend)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'INSUFFICIENT_DATA')
       ON CONFLICT (patient_id, period_start)
         DO UPDATE SET
           memory_score      = EXCLUDED.memory_score,
           attention_score   = EXCLUDED.attention_score,
           orientation_score = EXCLUDED.orientation_score,
           sessions_count    = EXCLUDED.sessions_count,
           computed_at       = NOW()`,
      [patientId, periodStart, periodEnd, memoryScore, attentionScore, orientationScore,
        parseInt(sessionCount.rows[0]?.cnt ?? '0')],
    );
  }

  return { patientsProcessed: patients.rows.length };
});

/** NO_SIGNAL escalation: patients with no ping for > 5 min become WARNING */
noSignalQueue.process(async (_job) => {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const stale = await pool.query(
    `UPDATE patient_states
     SET location_state = 'NO_SIGNAL', computed_at = NOW()
     WHERE location_state != 'NO_SIGNAL'
       AND (last_ping_at IS NULL OR last_ping_at < $1)
     RETURNING patient_id`,
    [fiveMinAgo],
  );

  for (const { patient_id: patientId } of stale.rows) {
    // Create WARNING alert if none exists in last 10 min
    const existing = await pool.query(
      `SELECT id FROM geofence_alerts
       WHERE patient_id = $1 AND alert_type = 'NO_SIGNAL'
         AND created_at > NOW() - INTERVAL '10 minutes' LIMIT 1`,
      [patientId],
    );
    if (existing.rows[0]) continue;

    // Get last known location
    const state = await pool.query('SELECT last_known_lat, last_known_lng FROM patient_states WHERE patient_id = $1', [patientId]);
    const { last_known_lat: lat = 0, last_known_lng: lng = 0 } = state.rows[0] ?? {};

    await pool.query(
      `INSERT INTO geofence_alerts (patient_id, alert_type, severity, lat, lng, dedup_key)
       VALUES ($1, 'NO_SIGNAL', 'WARNING', $2, $3, $4)
       ON CONFLICT (dedup_key) DO NOTHING`,
      [patientId, lat, lng, `no_signal:${patientId}:${Math.floor(Date.now() / 300000)}`],
    );
  }

  return { escalated: stale.rows.length };
});

// ─── Schedule Jobs ────────────────────────────────────────────────────────────

export async function scheduleJobs() {
  // Clear existing repeatable jobs first
  await Promise.all([
    routineSweepQueue.removeRepeatable({ cron: '*/15 * * * *', tz: 'Asia/Kolkata' }),
    weeklyReportQueue.removeRepeatable({ cron: '0 23 * * 0', tz: 'Asia/Kolkata' }),
    noSignalQueue.removeRepeatable({ cron: '*/5 * * * *', tz: 'Asia/Kolkata' }),
  ]).catch(() => {});

  // Routine sweep: every 15 minutes
  await routineSweepQueue.add({}, {
    repeat: { cron: '*/15 * * * *', tz: 'Asia/Kolkata' },
    jobId: 'routine-sweep-repeat',
  });

  // Weekly cognitive report: Sundays at 11pm IST
  await weeklyReportQueue.add({}, {
    repeat: { cron: '0 23 * * 0', tz: 'Asia/Kolkata' },
    jobId: 'weekly-report-repeat',
  });

  // No-signal check: every 5 minutes
  await noSignalQueue.add({}, {
    repeat: { cron: '*/5 * * * *', tz: 'Asia/Kolkata' },
    jobId: 'no-signal-repeat',
  });

  console.log('[Jobs] Background job queues scheduled');
}

/**
 * Queue morning orientation for a specific patient.
 * Called by the awareness engine on first app open of the day.
 */
export async function queueOrientationForPatient(patientId: string) {
  await orientationQueue.add({ patientId }, {
    jobId: `orientation:${patientId}:${new Date().toISOString().split('T')[0]}`,
    removeOnComplete: true,
    removeOnFail: false,
  });
}

// Error handlers
orientationQueue.on('failed', (job, err) => console.error(`[orientation:failed] ${job.id}`, err));
routineSweepQueue.on('failed', (job, err) => console.error(`[routineSweep:failed] ${job.id}`, err));
weeklyReportQueue.on('failed', (job, err) => console.error(`[weeklyReport:failed] ${job.id}`, err));
noSignalQueue.on('failed', (job, err) => console.error(`[noSignal:failed] ${job.id}`, err));
