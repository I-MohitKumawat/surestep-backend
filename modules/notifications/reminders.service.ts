import pool from '../../db/config';
import { sendToCareCircle } from './fcm.service';
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

export async function skipReminder(reminderId: string, actorId: string) {
  const now = new Date();
  const { rows: existing } = await pool.query('SELECT * FROM reminders WHERE id = $1', [reminderId]);
  if (!existing[0]) throw new Error('Reminder not found');

  const reminder = existing[0];
  const history = Array.isArray(reminder.history) ? reminder.history : [];
  history.push({ state: 'SKIPPED', changed_at: now.toISOString(), actor_id: actorId });

  const { rows } = await pool.query(
    `UPDATE reminders
     SET state = 'SKIPPED',
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
      io.to(`patient:${updated.patient_id}`).emit('reminder:skipped', { reminderId });
    }
  } catch (err) {
    console.warn('[RemindersService] WebSocket emit reminder:skipped failed:', err);
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
 * Sweeps active/snoozed/scheduled reminders and triggers state transitions
 * and notifications/escalations. Designed to run every 1 minute.
 */
export async function runReminderSweep() {
  const now = new Date();
  console.log(`[ReminderSweep] Starting sweep at ${now.toISOString()}`);

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

  // 2. Process escalations for ACTIVE or SNOOZED reminders
  const activeRes = await pool.query(
    `SELECT * FROM reminders
     WHERE state IN ('ACTIVE', 'SNOOZED')`
  );

  for (const r of activeRes.rows) {
    try {
      // Calculate elapsed minutes since scheduled_at
      const schedTime = new Date(r.scheduled_at).getTime();
      const elapsedMs = now.getTime() - schedTime;
      const elapsedMins = Math.floor(elapsedMs / 60000);

      // If snoozed, check if snooze window is over
      if (r.state === 'SNOOZED' && r.snoozed_until) {
        const snoozeTime = new Date(r.snoozed_until).getTime();
        if (now.getTime() >= snoozeTime) {
          // Reactivate snooze!
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
          continue;
        }
      }

      // 3. Load dynamic escalation rules for the patient
      const settingsRes = await pool.query(
        `SELECT escalation_rules FROM notification_settings WHERE user_id = $1`,
        [r.patient_id]
      );
      const rules = settingsRes.rows[0]?.escalation_rules || [
        { level: 1, offset_minutes: 10, action: 'NOTIFY_PATIENT_REPEAT' },
        { level: 2, offset_minutes: 20, action: 'NOTIFY_PATIENT_REPEAT' },
        { level: 3, offset_minutes: 30, action: 'MARK_MISSED' },
        { level: 4, offset_minutes: 45, action: 'NOTIFY_CAREGIVER' },
        { level: 5, offset_minutes: 60, action: 'NOTIFY_FAMILY' }
      ];

      // Sort rules by level ASC
      const sortedRules = [...rules].sort((a: any, b: any) => a.level - b.level);

      for (const rule of sortedRules) {
        if (elapsedMins >= rule.offset_minutes && r.escalation_level < rule.level) {
          const history = Array.isArray(r.history) ? r.history : [];

          if (rule.action === 'NOTIFY_PATIENT_REPEAT') {
            history.push({ escalation_level: rule.level, action: 'NOTIFY_PATIENT_REPEAT', changed_at: now.toISOString() });
            await pool.query(
              `UPDATE reminders SET escalation_level = $2, last_escalated_at = NOW(), history = $3 WHERE id = $1`,
              [r.id, rule.level, JSON.stringify(history)]
            );

            const { io } = await import('../../server');
            if (io) {
              io.to(`patient:${r.patient_id}`).emit('reminder:active', { reminder: r });
            }
          }
          else if (rule.action === 'MARK_MISSED') {
            history.push({ state: 'MISSED', escalation_level: rule.level, action: 'MARK_MISSED', changed_at: now.toISOString() });
            await pool.query(
              `UPDATE reminders SET state = 'MISSED', escalation_level = $2, last_escalated_at = NOW(), history = $3 WHERE id = $1`,
              [r.id, rule.level, JSON.stringify(history)]
            );

            const { io } = await import('../../server');
            if (io) {
              io.to(`patient:${r.patient_id}`).emit('reminder:missed', { reminderId: r.id });
            }

            await sendToCareCircle(r.patient_id, {
              title: `Critical Alert: Missed Task`,
              body: `Critical routine task '${r.title}' has been missed.`,
              data: { reminderId: r.id }
            }, 'TASK_MISSED_CRITICAL');
          }
          else if (rule.action === 'NOTIFY_CAREGIVER') {
            history.push({ escalation_level: rule.level, action: 'NOTIFY_CAREGIVER', changed_at: now.toISOString() });
            await pool.query(
              `UPDATE reminders SET escalation_level = $2, last_escalated_at = NOW(), history = $3 WHERE id = $1`,
              [r.id, rule.level, JSON.stringify(history)]
            );

            await sendToCareCircle(r.patient_id, {
              title: `Escalation: Overdue task ${rule.offset_minutes}m`,
              body: `Escalation: Patient has not completed critical task '${r.title}' for over ${rule.offset_minutes} minutes.`,
              data: { reminderId: r.id }
            }, 'TASK_MISSED_CRITICAL');
          }
          else if (rule.action === 'NOTIFY_FAMILY') {
            history.push({ escalation_level: rule.level, action: 'NOTIFY_FAMILY', changed_at: now.toISOString() });
            await pool.query(
              `UPDATE reminders SET escalation_level = $2, last_escalated_at = NOW(), history = $3 WHERE id = $1`,
              [r.id, rule.level, JSON.stringify(history)]
            );

            await sendToCareCircle(r.patient_id, {
              title: `Critical Escalation: Missed task ${rule.offset_minutes}m`,
              body: `Overdue task Escalation: Patient has not completed critical task '${r.title}' for over ${rule.offset_minutes} minutes.`,
              data: { reminderId: r.id }
            }, 'TASK_MISSED_CRITICAL');
          }

          r.escalation_level = rule.level;
        }
      }
    } catch (err) {
      console.error(`[ReminderSweep] Failed to escalate reminder ${r.id}:`, err);
    }
  }
}
