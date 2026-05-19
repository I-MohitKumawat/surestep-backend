import pool from '../../db/config';
import { evaluateGeofence } from '../location/location.service';
import { AppError } from '../../shared/errors/AppError';

/**
 * Core Awareness Engine — evaluates all 4 state dimensions for a patient
 * on every location ping. Writes result to patient_states (upsert).
 *
 * Called asynchronously from location.controller.ping — never blocks HTTP.
 */
export async function evaluateAwareness(
  patientId: string,
  lat: number,
  lng: number,
  speed_kmh: number,
): Promise<void> {
  // ─── 1. Location State ────────────────────────────────────────────────────
  const { state: safetyEval, breachedZones } = await evaluateGeofence(patientId, lat, lng);

  // Get last 3 pings to evaluate speed trend
  const recentPings = await pool.query(
    `SELECT speed_kmh, recorded_at FROM location_pings
     WHERE patient_id = $1
     ORDER BY recorded_at DESC LIMIT 3`,
    [patientId],
  );

  const avgSpeed = recentPings.rows.reduce((sum, r) => sum + (r.speed_kmh || 0), 0)
    / Math.max(recentPings.rows.length, 1);

  // Current patient state for stationary tracking
  const current = await pool.query(
    'SELECT * FROM patient_states WHERE patient_id = $1',
    [patientId],
  );
  const prev = current.rows[0];

  let location_state: string;
  let stationary_since = prev?.stationary_since ?? null;

  if (avgSpeed > 0.5) {
    location_state = 'MOVING';
    stationary_since = null;
  } else if (safetyEval !== 'BREACH') {
    location_state = 'STATIONARY_KNOWN';
    stationary_since = stationary_since ?? new Date().toISOString();
  } else {
    location_state = 'STATIONARY_UNKNOWN';
    stationary_since = stationary_since ?? new Date().toISOString();
  }

  // ─── 2. Safety State ─────────────────────────────────────────────────────
  let safety_state = safetyEval;

  // Escalate to CRITICAL if breach + stationary unknown for > 10 min with no engagement
  if (
    safetyEval === 'BREACH' &&
    location_state === 'STATIONARY_UNKNOWN' &&
    prev?.engagement_state === 'NO_INTERACTION'
  ) {
    const stationaryMs = stationary_since
      ? Date.now() - new Date(stationary_since).getTime()
      : 0;
    if (stationaryMs > 10 * 60 * 1000) {
      safety_state = 'CRITICAL';
    }
  }

  // ─── 3. Routine State ─────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();

  const tasks = await pool.query(
    `SELECT status, is_critical, scheduled_time FROM tasks
     WHERE patient_id = $1 AND scheduled_date = $2`,
    [patientId, today],
  );

  let routine_state = 'ON_TRACK';
  if (tasks.rows.every((t: any) => t.status === 'DONE')) {
    routine_state = 'ALL_DONE';
  } else {
    const missedCritical = tasks.rows.some((t: any) => {
      if (t.status !== 'PENDING') return false;
      const [h, m] = t.scheduled_time.split(':').map(Number);
      const scheduled = new Date(today);
      scheduled.setHours(h, m, 0, 0);
      const overdueMs = now.getTime() - scheduled.getTime();
      return t.is_critical && overdueMs > 15 * 60 * 1000;
    });

    const anyBehind = tasks.rows.some((t: any) => {
      if (t.status !== 'PENDING') return false;
      const [h, m] = t.scheduled_time.split(':').map(Number);
      const scheduled = new Date(today);
      scheduled.setHours(h, m, 0, 0);
      return now > scheduled;
    });

    if (missedCritical) routine_state = 'MISSED_CRITICAL';
    else if (anyBehind) routine_state = 'BEHIND';
  }

  // ─── 4. Engagement State ──────────────────────────────────────────────────
  // Preserved from previous state — updated by dedicated engagement events
  const engagement_state = prev?.engagement_state ?? 'NO_INTERACTION';

  // ─── 5. Upsert patient_states ─────────────────────────────────────────────
  await pool.query(
    `INSERT INTO patient_states
       (patient_id, location_state, safety_state, routine_state, engagement_state,
        last_known_lat, last_known_lng, last_ping_at, stationary_since, computed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8,NOW())
     ON CONFLICT (patient_id) DO UPDATE SET
       location_state   = EXCLUDED.location_state,
       safety_state     = EXCLUDED.safety_state,
       routine_state    = EXCLUDED.routine_state,
       last_known_lat   = EXCLUDED.last_known_lat,
       last_known_lng   = EXCLUDED.last_known_lng,
       last_ping_at     = EXCLUDED.last_ping_at,
       stationary_since = EXCLUDED.stationary_since,
       computed_at      = NOW()`,
    [patientId, location_state, safety_state, routine_state, engagement_state, lat, lng, stationary_since],
  );

  // ─── 6. Create geofence alerts for breaches ───────────────────────────────
  for (const zone of breachedZones) {
    const severity = safety_state === 'CRITICAL' ? 'CRITICAL' : 'WARNING';
    const dedupKey = `${patientId}_${zone.id}_${today}`;
    await pool.query(
      `INSERT INTO geofence_alerts
         (patient_id, zone_id, alert_type, severity, lat, lng, distance_from_zone_m, dedup_key)
       VALUES ($1,$2,'ZONE_EXIT',$3,$4,$5,$6,$7)
       ON CONFLICT (dedup_key) DO NOTHING`,
      [patientId, zone.id, severity, lat, lng, Math.round(zone.distance_m), dedupKey],
    );
  }
}

// ─── Engagement update (called by patient app interactions) ──────────────────

export async function updateEngagement(patientId: string, state: string) {
  await pool.query(
    `UPDATE patient_states SET engagement_state = $1, computed_at = NOW() WHERE patient_id = $2`,
    [state, patientId],
  );
}

// ─── State queries ────────────────────────────────────────────────────────────

export async function getPatientState(patientId: string) {
  const result = await pool.query(
    'SELECT * FROM patient_states WHERE patient_id = $1',
    [patientId],
  );
  if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Patient state not found', 404);
  return result.rows[0];
}

export async function getAllPatientStates(caregiverId: string) {
  const result = await pool.query(
    `SELECT ps.*, u.name, u.photo_url
     FROM patient_states ps
     JOIN users u ON u.id = ps.patient_id
     WHERE ps.patient_id IN (
       SELECT patient_user_id FROM patient_relationships
       WHERE related_user_id = $1 AND status = 'CONFIRMED' AND relationship_type = 'CAREGIVER'
     )
     ORDER BY
       CASE ps.safety_state WHEN 'CRITICAL' THEN 0 WHEN 'BREACH' THEN 1 WHEN 'APPROACHING' THEN 2 ELSE 3 END,
       ps.computed_at DESC`,
    [caregiverId],
  );
  return result.rows;
}

export async function triggerSOS(patientId: string) {
  await pool.query(
    `UPDATE patient_states SET sos_active = TRUE, safety_state = 'CRITICAL', computed_at = NOW()
     WHERE patient_id = $1`,
    [patientId],
  );

  // Record SOS alert
  const state = await pool.query('SELECT last_known_lat, last_known_lng FROM patient_states WHERE patient_id = $1', [patientId]);
  const { last_known_lat = 0, last_known_lng = 0 } = state.rows[0] ?? {};

  await pool.query(
    `INSERT INTO geofence_alerts (patient_id, alert_type, severity, lat, lng)
     VALUES ($1,'SOS_TRIGGERED','CRITICAL',$2,$3)`,
    [patientId, last_known_lat, last_known_lng],
  );
}
