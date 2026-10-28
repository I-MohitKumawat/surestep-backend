import pool from '../../db/config';
import { createInAppNotification } from './notification.service';

export interface CreateReminderInput {
  patientId: string;
  referenceId?: string;
  referenceType: 'ROUTINE' | 'MEDICATION' | 'APPOINTMENT' | 'CUSTOM';
  title: string;
  body?: string;
  scheduledAt: string;
}

export async function createReminder(input: CreateReminderInput) {
  const { patientId, referenceId = null, referenceType, title, body = null, scheduledAt } = input;

  const historyJson = JSON.stringify([{ state: 'SCHEDULED', changed_at: new Date().toISOString() }]);

  const { rows } = await pool.query(
    `INSERT INTO reminders (patient_id, reference_id, reference_type, title, body, scheduled_at, state, history)
     VALUES ($1, $2, $3, $4, $5, $6, 'SCHEDULED', $7)
     RETURNING *`,
    [patientId, referenceId, referenceType, title, body, scheduledAt, historyJson]
  );

  return rows[0];
}

export async function snoozeReminder(reminderId: string, snoozeMinutes = 5) {
  const now = new Date();
  const snoozedUntil = new Date(now.getTime() + snoozeMinutes * 60 * 1000);

  const { rows: existing } = await pool.query('SELECT * FROM reminders WHERE id = $1', [reminderId]);
  if (!existing[0]) throw new Error('Reminder not found');

  const reminder = existing[0];
  const history = Array.isArray(reminder.history) ? reminder.history : [];
  history.push({ state: 'SNOOZED', changed_at: now.toISOString(), snooze_minutes: snoozeMinutes });

  const { rows } = await pool.query(
    `UPDATE reminders
     SET state = 'SNOOZED',
         snooze_count = snooze_count + 1,
         snoozed_until = $2,
         history = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [reminderId, snoozedUntil, JSON.stringify(history)]
  );

  const updated = rows[0];

  // Emit ws to dismiss patient overlay
  try {
    const { io } = await import('../../server');
    if (io) {
      io.to(`patient:${updated.patient_id}`).emit('reminder:snoozed', { reminderId });
    }
  } catch (err) {
    console.warn('[RemindersService] WebSocket emit reminder:snoozed failed:', err);
  }

  return updated;
}

export async function completeReminder(reminderId: string, actorId: string) {
  const now = new Date();
  const { rows: existing } = await pool.query('SELECT * FROM reminders WHERE id = $1', [reminderId]);
  if (!existing[0]) throw new Error('Reminder not found');

  const reminder = existing[0];
  const history = Array.isArray(reminder.history) ? reminder.history : [];
  history.push({ state: 'COMPLETED', changed_at: now.toISOString(), actor_id: actorId });

  const { rows } = await pool.query(
    `UPDATE reminders
     SET state = 'COMPLETED',
         history = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [reminderId, JSON.stringify(history)]
  );

  const updated = rows[0];

  // Emit ws to dismiss patient overlay
  try {
    const { io } = await import('../../server');
    if (io) {
      io.to(`patient:${updated.patient_id}`).emit('reminder:completed', { reminderId });
    }
  } catch (err) {
    console.warn('[RemindersService] WebSocket emit reminder:completed failed:', err);
  }

  return updated;
}

export async function getActivePatientReminders(patientId: string) {
  const { rows } = await pool.query(
    `SELECT * FROM reminders
     WHERE patient_id = $1 AND state IN ('SCHEDULED', 'ACTIVE', 'SNOOZED')
     ORDER BY scheduled_at ASC`,
    [patientId]
  );
  return rows;
}

/**
 * Sweeps active/snoozed/scheduled reminders for ordinary state transitions:
 * - Activates scheduled reminders that are now due.
 * - Reactivates snoozed reminders whose snooze window has expired.
 * NOTE: Automated escalation chains and task status mutation are strictly removed per V1 architecture.
 */
export async function runReminderSweep() {
  const now = new Date();

  // 1. Find scheduled reminders that are now due
  const dueRes = await pool.query(
    `SELECT * FROM reminders
     WHERE state = 'SCHEDULED' AND scheduled_at <= NOW()`
  );

  for (const r of dueRes.rows) {
    try {
      const history = Array.isArray(r.history) ? r.history : [];
      history.push({ state: 'ACTIVE', changed_at: now.toISOString() });

      await pool.query(
        `UPDATE reminders
         SET state = 'ACTIVE', history = $2, updated_at = NOW()
         WHERE id = $1`,
        [r.id, JSON.stringify(history)]
      );

      // Trigger patient overlay via WS
      const { io } = await import('../../server');
      if (io) {
        io.to(`patient:${r.patient_id}`).emit('reminder:active', { reminder: r });
      }

      // Send FCM push to patient
      await createInAppNotification({
        userId: r.patient_id,
        notificationType: 'REMINDER_ACTIVE',
        priority: 'HIGH',
        title: r.title,
        body: r.body || 'This is a scheduled reminder.',
        payload: { reminderId: r.id, referenceId: r.reference_id, referenceType: r.reference_type }
      });
    } catch (err) {
      console.error(`[ReminderSweep] Failed to activate reminder ${r.id}:`, err);
    }
  }

  // 2. Reactivate snoozed reminders whose snooze duration has elapsed
  const snoozedRes = await pool.query(
    `SELECT * FROM reminders
     WHERE state = 'SNOOZED' AND snoozed_until <= NOW()`
  );

  for (const r of snoozedRes.rows) {
    try {
      const history = Array.isArray(r.history) ? r.history : [];
      history.push({ state: 'ACTIVE', changed_at: now.toISOString(), reason: 'SNOOZE_EXPIRED' });

      await pool.query(
        `UPDATE reminders SET state = 'ACTIVE', history = $2, updated_at = NOW() WHERE id = $1`,
        [r.id, JSON.stringify(history)]
      );

      const { io } = await import('../../server');
      if (io) {
        io.to(`patient:${r.patient_id}`).emit('reminder:active', { reminder: r });
      }
    } catch (err) {
      console.error(`[ReminderSweep] Failed to reactivate snoozed reminder ${r.id}:`, err);
    }
  }
}
