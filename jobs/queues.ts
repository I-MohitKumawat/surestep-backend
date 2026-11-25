/**
 * Bull Job Queue — Background Workers
 *
 * Active Queues:
 *  1. dailyOrientationCheck  — fires at 7:00am IST for each patient
 *  2. routineStateSweep      — every 15 min: materializes routine occurrence
 *                              horizons, advances Scheduled/Ongoing/Overdue,
 *                              and expires caregiver notice periods
 *  3. careRequestExpirySweep — every 15 min: expires stale PENDING care requests
 */

import Bull from 'bull';
import pool from '../db/config';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const opts = { redis: REDIS_URL };

// ─── Queue Definitions ────────────────────────────────────────────────────────

export const orientationQueue       = new Bull('daily-orientation',   opts);
export const routineSweepQueue      = new Bull('routine-sweep',       opts);
export const careRequestExpiryQueue = new Bull('care-request-expiry', opts);

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

  const { name } = user.rows[0];
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

/** Routine sweep: canonical occurrence materialization + lifecycle + notice expiry */
routineSweepQueue.process(async (_job) => {
  const { authoritativeRoutinesService } = await import('../modules/routines/authoritative-routines.service');
  const routineResult = await authoritativeRoutinesService.sweepRoutineOccurrences();

  const { caregiverRelationshipsService } = await import('../modules/care-circles/caregiver-relationships.service');
  const noticeResult = await caregiverRelationshipsService.processExpiredNotices();

  return {
    ...routineResult,
    noticesTransitioned: noticeResult.transitionedCount,
  };
});

/** Care Request Expiry sweep: marks expired PENDING requests and notifies requesters every 15 min */
careRequestExpiryQueue.process(async (_job) => {
  try {
    const { sweepExpiredCareRequests } = await import('../modules/care-requests/care-requests.service');
    const expiredCount = await sweepExpiredCareRequests();
    if (expiredCount > 0) {
      console.log(`[careRequestExpiryQueue] Automatically expired ${expiredCount} care requests`);
    }
    return { expiredCount };
  } catch (err) {
    console.error('[careRequestExpiryQueue] Failed in care request expiry sweep:', err);
    throw err;
  }
});

// ─── Schedule Jobs ────────────────────────────────────────────────────────────

export async function scheduleJobs() {
  // Clear previous repeatable schedules before re-registering
  await Promise.all([
    routineSweepQueue.removeRepeatable({ cron: '*/15 * * * *', tz: 'Asia/Kolkata' }),
    careRequestExpiryQueue.removeRepeatable({ cron: '*/15 * * * *', tz: 'Asia/Kolkata' }),
  ]).catch(() => {});

  // In V1 authoritative architecture: routine occurrence materialization and
  // state sweeps run every 15 minutes; care requests expire after 48h (Workflow 05 §4).
  await Promise.all([
    careRequestExpiryQueue.add({}, {
      repeat: { cron: '*/15 * * * *', tz: 'Asia/Kolkata' },
      jobId: 'care-request-expiry-repeat',
    }),
    routineSweepQueue.add({}, {
      repeat: { cron: '*/15 * * * *', tz: 'Asia/Kolkata' },
      jobId: 'routine-sweep-repeat',
    }),
  ]);

  console.log('[Jobs] Canonical background job queues scheduled (routine sweep + care request expiry)');
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
careRequestExpiryQueue.on('failed', (job, err) => console.error(`[careRequestExpiry:failed] ${job.id}`, err));
