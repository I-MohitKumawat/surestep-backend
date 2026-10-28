/**
 * SureStep — FCM Push Notification Service
 *
 * Sends Firebase Cloud Messaging push notifications to users via their
 * registered device tokens in `device_registry`.
 *
 * Used by:
 *  - awareness.service.ts  — geofence breach, approaching, re-entry alerts
 *  - notifications.router.ts — SOS broadcasts
 *  - jobs/queues.ts         — no-signal escalation
 */

import admin from '../../config/firebase';
import pool from '../../db/config';
import {
  isExpoPushToken,
  sendExpoPushNotifications,
  type ExpoPushMessage,
} from './expoPush.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FcmPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

// ─── Fetch device tokens for a user ──────────────────────────────────────────

async function getDeviceTokens(userId: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT device_token FROM device_registry
     WHERE user_id = $1 AND device_token IS NOT NULL
     ORDER BY last_seen_at DESC NULLS LAST`,
    [userId],
  );
  return result.rows.map((r: any) => r.device_token).filter(Boolean);
}

// ─── Core send function ───────────────────────────────────────────────────────

/**
 * Send a push notification to a single user (all their registered devices).
 * Silently ignores invalid / unregistered tokens.
 */
export async function sendToUser(userId: string, payload: FcmPayload): Promise<void> {
  const tokens = await getDeviceTokens(userId);
  if (!tokens.length) return;

  const expoTokens = tokens.filter(isExpoPushToken);
  const fcmTokens = tokens.filter((t) => !isExpoPushToken(t));

  // 1. Deliver to Expo devices via Expo Push Service
  if (expoTokens.length > 0) {
    const isCritical = payload.data?.priority === 'HIGH' || payload.data?.notification_type === 'SOS';
    const expoMessages: ExpoPushMessage[] = expoTokens.map((to) => ({
      to,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      sound: 'default',
      priority: isCritical ? 'high' : 'normal',
      channelId: isCritical ? 'alarms' : 'default',
    }));
    await sendExpoPushNotifications(expoMessages);
  }

  // 2. Deliver to native Firebase FCM devices
  if (fcmTokens.length > 0) {
    const invalidTokens: string[] = [];

    const messages = fcmTokens.map((token) => ({
      token,
      notification: {
        title: payload.title,
        body:  payload.body,
      },
      data: {
        ...payload.data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high' as const,
        notification: {
          sound: 'default',
          priority: 'high' as const,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    }));

    try {
      const batchResponse = await admin.messaging().sendEach(messages);

      // Collect tokens that need to be cleaned up
      batchResponse.responses.forEach((response, idx) => {
        if (!response.success) {
          const errCode = (response.error as any)?.code ?? '';
          if (
            errCode === 'messaging/invalid-registration-token' ||
            errCode === 'messaging/registration-token-not-registered'
          ) {
            invalidTokens.push(fcmTokens[idx]!);
          }
        }
      });

      if (invalidTokens.length > 0) {
        await pool.query(
          `DELETE FROM device_registry WHERE device_token = ANY($1)`,
          [invalidTokens],
        );
      }
    } catch (err) {
      console.error('[FCM] sendToUser error:', err);
    }
  }
}

/**
 * Send a push notification to the full Care Circle for a patient.
 * Routing is preference-aware per event type:
 *   SOS_TRIGGERED        → ALL confirmed relationships
 *   ZONE_EXIT / BREACH   → CAREGIVER, GUARDIAN, FAMILY_CLOSE (if notify_on_breach)
 *   TASK_MISSED_CRITICAL → CAREGIVER, GUARDIAN, FAMILY_CLOSE (if notify_on_missed_critical)
 *   FAMILY_EXTENDED      → digest-only, never real-time push
 */
export type CareCircleEventType =
  | 'SOS_TRIGGERED'
  | 'ZONE_EXIT'
  | 'APPROACHING_BOUNDARY'
  | 'TASK_MISSED_CRITICAL'
  | 'NO_SIGNAL'
  | 'BATTERY_CRITICAL'
  | 'GENERAL';

export async function sendToCareCircle(
  patientId: string,
  payload: FcmPayload,
  eventType: CareCircleEventType = 'GENERAL',
): Promise<void> {
  // Fetch Care Circle Owner, active members, and assigned caregivers with notification preferences
  const result = await pool.query(
    `SELECT c.owner_id as related_user_id, 'OWNER' as role_in_circle,
            fp.notify_on_breach, fp.notify_on_missed_critical, fp.notify_on_sos
     FROM patient_circle_associations pca
     JOIN care_circles c ON pca.circle_id = c.id
     LEFT JOIN family_profiles fp ON fp.user_id = c.owner_id
     WHERE pca.patient_id = $1 AND c.terminated_at IS NULL
     UNION
     SELECT ccm.user_id as related_user_id, ccm.role_in_circle,
            fp.notify_on_breach, fp.notify_on_missed_critical, fp.notify_on_sos
     FROM patient_circle_associations pca
     JOIN care_circles c ON pca.circle_id = c.id
     JOIN care_circle_members ccm ON ccm.circle_id = c.id
     LEFT JOIN family_profiles fp ON fp.user_id = ccm.user_id
     WHERE pca.patient_id = $1 AND c.terminated_at IS NULL
     UNION
     SELECT cr.caregiver_id as related_user_id, 'CAREGIVER' as role_in_circle,
            TRUE as notify_on_breach, TRUE as notify_on_missed_critical, TRUE as notify_on_sos
     FROM patient_assignments pa
     JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
     JOIN care_circles c ON cr.circle_id = c.id
     WHERE pa.patient_id = $1 AND pa.is_active = TRUE AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD') AND c.terminated_at IS NULL`,
    [patientId],
  );

  if (!result.rows.length) return;

  const recipients: string[] = [];

  for (const row of result.rows) {
    const role = row.role_in_circle as string;

    if (role === 'CAREGIVER') {
      recipients.push(row.related_user_id);
      continue;
    }

    switch (eventType) {
      case 'SOS_TRIGGERED':
        if (row.notify_on_sos !== false) recipients.push(row.related_user_id);
        break;
      case 'ZONE_EXIT':
      case 'APPROACHING_BOUNDARY':
        if (row.notify_on_breach !== false) recipients.push(row.related_user_id);
        break;
      case 'TASK_MISSED_CRITICAL':
        if (row.notify_on_missed_critical !== false) recipients.push(row.related_user_id);
        break;
      case 'NO_SIGNAL':
      case 'BATTERY_CRITICAL':
      case 'GENERAL':
      default:
        recipients.push(row.related_user_id);
        break;
    }
  }

  if (!recipients.length) return;

  const { createInAppNotification } = await import('./notification.service');
  await Promise.allSettled(
    recipients.map((userId) =>
      createInAppNotification({
        userId,
        title: payload.title,
        body: payload.body,
        payload: payload.data || {},
      })
    )
  );
}

/**
 * @deprecated Use sendToCareCircle instead.
 * Kept for backward compatibility during migration.
 */
export async function sendToPatientCaregivers(
  patientId: string,
  payload: FcmPayload,
): Promise<void> {
  return sendToCareCircle(patientId, payload, 'GENERAL');
}


/**
 * Send a silent (data-only) push notification to the patient device.
 * Used to trigger background location updates on demand.
 */
export async function sendSilentLocationRequest(patientId: string): Promise<void> {
  const tokens = await getDeviceTokens(patientId);
  if (!tokens.length) {
    console.log(`[FCM] No registered device tokens for patient: ${patientId}`);
    return;
  }

  const expoTokens = tokens.filter(isExpoPushToken);
  const fcmTokens = tokens.filter((t) => !isExpoPushToken(t));

  if (expoTokens.length > 0) {
    const expoMessages: ExpoPushMessage[] = expoTokens.map((to) => ({
      to,
      data: {
        type: 'LOCATION_REQUEST',
        patientId,
      },
      priority: 'high',
      channelId: 'default',
    }));
    await sendExpoPushNotifications(expoMessages);
  }

  if (fcmTokens.length > 0) {
    const messages = fcmTokens.map((token) => ({
      token,
      data: {
        type: 'LOCATION_REQUEST',
        patientId,
      },
      android: {
        priority: 'high' as const,
      },
      apns: {
        payload: {
          aps: {
            'content-available': 1,
          },
        },
      },
    }));

    try {
      const batchResponse = await admin.messaging().sendEach(messages);
      console.log(`[FCM] Silent location request dispatched to ${messages.length} device(s)`);
    } catch (err) {
      console.error('[FCM] sendSilentLocationRequest failed:', err);
    }
  }
}

/**
 * Register or update a device token for a user.
 * Called by the frontend when the app boots or FCM token refreshes.
 */
export async function upsertDeviceToken(
  userId: string,
  deviceToken: string,
  deviceType: 'PHONE_IOS' | 'PHONE_ANDROID',
  deviceName?: string,
  appVersion?: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO device_registry
       (user_id, device_type, device_token, device_name, app_version, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id, device_token)
       DO UPDATE SET last_seen_at = NOW(), app_version = EXCLUDED.app_version`,
    [userId, deviceType, deviceToken, deviceName ?? null, appVersion ?? null],
  );
}
