import pool from '../../db/config';
import { sendToUser } from './fcm.service';

export interface CreateNotificationInput {
  userId: string;
  recipientRole?: string;
  patientId?: string;
  notificationType?: string;
  priority?: string;
  actionLink?: string;
  title: string;
  body: string;
  payload?: Record<string, any>;
  alertId?: string;
}

/**
 * Checks if current time is within quiet hours.
 * Expects times in 'HH:MM:SS' format.
 */
export function isWithinQuietHours(start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const now = new Date();
  // Get time string in HH:MM:SS format
  const timeStr = now.toTimeString().split(' ')[0];
  if (start <= end) {
    return timeStr >= start && timeStr <= end;
  } else {
    // Overlap midnight (e.g. 22:00:00 to 06:00:00)
    return timeStr >= start || timeStr <= end;
  }
}

/**
 * Get or create notification settings for a user.
 */
export async function getOrCreateNotificationSettings(userId: string): Promise<any> {
  const { rows } = await pool.query(
    'SELECT * FROM notification_settings WHERE user_id = $1',
    [userId]
  );

  if (rows[0]) return rows[0];

  // Fetch active role from users
  const roleRes = await pool.query(
    'SELECT role FROM users WHERE id = $1 LIMIT 1',
    [userId]
  );
  const role = roleRes.rows[0]?.role || 'PATIENT';

  // Create default settings based on role
  const insertRes = await pool.query(
    `INSERT INTO notification_settings (
      user_id, role,
      reminder_sounds, reminder_vibration, reminder_volume, reminder_frequency,
      alert_categories, quiet_hours_start, quiet_hours_end, escalation_pref,
      digest_frequency, critical_alert_pref
    ) VALUES (
      $1, $2,
      TRUE, TRUE, 1.0, 5,
      '["GEOFENCE", "SOS", "OFFLINE", "ROUTINE", "ASSESSMENT"]'::jsonb, NULL, NULL, 'IMMEDIATE',
      'DAILY', 'ALL'
    ) RETURNING *`,
    [userId, role]
  );

  return insertRes.rows[0];
}

/**
 * Update notification settings.
 */
export async function updateNotificationSettings(userId: string, data: any): Promise<any> {
  // Ensure default settings exist first
  const current = await getOrCreateNotificationSettings(userId);

  const allowed = [
    'reminder_sounds', 'reminder_vibration', 'reminder_volume', 'reminder_frequency',
    'alert_categories', 'quiet_hours_start', 'quiet_hours_end', 'escalation_pref',
    'digest_frequency', 'critical_alert_pref'
  ];

  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;

  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${i++}`);
      values.push(key === 'alert_categories' ? JSON.stringify(data[key]) : data[key]);
    }
  }

  if (fields.length === 0) return current;

  values.push(userId);
  const { rows } = await pool.query(
    `UPDATE notification_settings SET ${fields.join(', ')}, updated_at = NOW() WHERE user_id = $${i} RETURNING *`,
    values
  );

  return rows[0];
}

/**
 * Creates a notification log, emits a real-time WebSocket event,
 * and sends an FCM push notification to the user's devices if permitted by settings.
 */
export async function createInAppNotification(input: CreateNotificationInput): Promise<any> {
  const {
    userId,
    recipientRole = null,
    patientId = null,
    notificationType = 'GENERAL',
    priority = 'MEDIUM',
    actionLink = null,
    title,
    body,
    payload = {},
    alertId = null
  } = input;

  try {
    // 1. Fetch user's settings to check eligibility
    const settings = await getOrCreateNotificationSettings(userId);
    let shouldSendPush = true;

    // Apply settings-based rules
    if (settings.role === 'CAREGIVER') {
      // Category check (e.g. check if notificationType category is enabled)
      const categories: string[] = Array.isArray(settings.alert_categories)
        ? settings.alert_categories
        : [];
      
      const mappedCategory = notificationType.toUpperCase();
      let match = false;
      for (const cat of categories) {
        if (mappedCategory.includes(cat) || cat.includes(mappedCategory)) {
          match = true;
          break;
        }
      }
      // If we don't have matching category, but it's not custom, let's respect categories list
      if (categories.length > 0 && !match && notificationType !== 'GENERAL' && notificationType !== 'SOS') {
        shouldSendPush = false;
      }

      // Quiet hours check
      if (shouldSendPush && notificationType !== 'SOS' && priority !== 'HIGH') {
        if (isWithinQuietHours(settings.quiet_hours_start, settings.quiet_hours_end)) {
          shouldSendPush = false;
        }
      }
    } else if (settings.role === 'FAMILY') {
      // Digest checking
      if (notificationType === 'DIGEST' && settings.digest_frequency === 'NONE') {
        shouldSendPush = false;
      }
      // Critical alert preferences
      if (settings.critical_alert_pref === 'NONE') {
        shouldSendPush = false;
      } else if (settings.critical_alert_pref === 'SOS_ONLY' && notificationType !== 'SOS') {
        shouldSendPush = false;
      }
    }

    // 2. Insert into notification_logs database table
    const result = await pool.query(
      `INSERT INTO notification_logs (
        user_id, alert_id, channel, title, body, payload, delivered, delivered_at,
        recipient_role, patient_id, notification_type, priority, action_link
      ) VALUES ($1, $2, 'WEBSOCKET', $3, $4, $5, TRUE, NOW(), $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        userId,
        alertId,
        title,
        body,
        JSON.stringify(payload),
        recipientRole || settings.role,
        patientId,
        notificationType,
        priority,
        actionLink
      ]
    );
    const notification = result.rows[0];

    // 3. Broadcast via WebSocket to the user's personal namespace room
    try {
      const { io } = await import('../../server');
      if (io) {
        io.to(`user:${userId}`).emit('notification:new', notification);
        console.log(`[WebSocket] Dispatched notification:new to user:${userId}`);
      }
    } catch (wsErr) {
      console.warn('[NotificationService] WebSocket broadcast failed:', wsErr);
    }

    // 4. Send FCM Push Notification if permitted
    if (shouldSendPush) {
      try {
        const dataPayload: Record<string, string> = {
          notification_id: String(notification.id),
          notification_type: notificationType,
          priority,
        };
        if (actionLink) dataPayload.action_link = actionLink;

        Object.entries(payload).forEach(([key, val]) => {
          dataPayload[key] = typeof val === 'object' ? JSON.stringify(val) : String(val);
        });

        await sendToUser(userId, {
          title,
          body,
          data: dataPayload,
        });
      } catch (fcmErr) {
        console.warn('[NotificationService] FCM push notification dispatch failed:', fcmErr);
      }
    } else {
      console.log(`[NotificationService] FCM push skipped for user ${userId} per notification settings`);
    }

    return notification;
  } catch (err) {
    console.error('[NotificationService] Failed to create notification:', err);
    throw err;
  }
}
