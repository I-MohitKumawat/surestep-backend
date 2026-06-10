import pool from '../../db/config';
import { sendToUser } from './fcm.service';

export interface CreateNotificationInput {
  userId: string;
  title: string;
  body: string;
  payload?: Record<string, any>;
  alertId?: string;
}

/**
 * Creates a notification log, emits a real-time WebSocket event,
 * and sends an FCM push notification to the user's devices.
 */
export async function createInAppNotification(input: CreateNotificationInput): Promise<any> {
  const { userId, title, body, payload = {}, alertId = null } = input;

  try {
    // 1. Insert into notification_logs database table
    const result = await pool.query(
      `INSERT INTO notification_logs (user_id, alert_id, channel, title, body, payload, delivered, delivered_at)
       VALUES ($1, $2, 'WEBSOCKET', $3, $4, $5, TRUE, NOW())
       RETURNING *`,
      [userId, alertId, title, body, JSON.stringify(payload)]
    );
    const notification = result.rows[0];

    // 2. Broadcast via WebSocket to the user's personal namespace room
    try {
      const { io } = await import('../../server');
      if (io) {
        io.to(`user:${userId}`).emit('notification:new', notification);
        console.log(`[WebSocket] Dispatched notification:new to user:${userId}`);
      }
    } catch (wsErr) {
      console.warn('[NotificationService] WebSocket broadcast failed:', wsErr);
    }

    // 3. Send FCM Push Notification
    try {
      // Convert payload record values to string for FCM data payload compatibility
      const dataPayload: Record<string, string> = {};
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

    return notification;
  } catch (err) {
    console.error('[NotificationService] Failed to create notification:', err);
    throw err;
  }
}
