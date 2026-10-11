/**
 * SureStep — Expo Push Notification Service
 *
 * Sends push notifications to Expo Push tokens (ExponentPushToken[...])
 * via Expo's official Push API: https://exp.host/--/api/v2/push/send
 * Automatically prunes invalid/unregistered device tokens (DeviceNotRegistered).
 */
import pool from '../../db/config';

export interface ExpoPushMessage {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
  badge?: number;
}

export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: {
    error?: 'DeviceNotRegistered' | 'MessageTooBig' | 'MessageRateExceeded' | string;
    [key: string]: any;
  };
}

/**
 * Validates if a token is a valid Expo Push token format.
 */
export function isExpoPushToken(token: string): boolean {
  return (
    typeof token === 'string' &&
    (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['))
  );
}

/**
 * Sends messages in batches (max 100 per chunk per Expo specification)
 * to https://exp.host/--/api/v2/push/send.
 * Automatically deletes DeviceNotRegistered tokens from device_registry.
 */
export async function sendExpoPushNotifications(messages: ExpoPushMessage[]): Promise<void> {
  if (!messages || messages.length === 0) return;

  const EXPO_API_URL = 'https://exp.host/--/api/v2/push/send';
  const CHUNK_SIZE = 100;
  const invalidTokens: string[] = [];

  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);

    try {
      const response = await fetch(EXPO_API_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ExpoPush] API returned HTTP ${response.status}:`, errorText);
        continue;
      }

      const result = (await response.json()) as { data: ExpoPushTicket[] };
      const tickets = result?.data || [];

      tickets.forEach((ticket, idx) => {
        if (ticket.status === 'error') {
          console.warn(`[ExpoPush] Delivery error for recipient:`, ticket.message, ticket.details);
          if (ticket.details?.error === 'DeviceNotRegistered') {
            const badToken = chunk[idx]?.to;
            if (badToken) {
              invalidTokens.push(badToken);
            }
          }
        }
      });
    } catch (err: any) {
      console.error('[ExpoPush] Error delivering push batch:', err?.message || err);
    }
  }

  // Prune unregistered tokens from device_registry
  if (invalidTokens.length > 0) {
    try {
      console.log(`[ExpoPush] Pruning ${invalidTokens.length} unregistered tokens from device_registry`);
      await pool.query(
        `DELETE FROM device_registry WHERE device_token = ANY($1)`,
        [invalidTokens],
      );
    } catch (pruneErr: any) {
      console.error('[ExpoPush] Error pruning invalid tokens:', pruneErr?.message || pruneErr);
    }
  }
}

/**
 * Sends an Expo push notification directly to all Expo devices registered for a user.
 */
export async function sendExpoToUser(
  userId: string,
  payload: {
    title: string;
    body: string;
    data?: Record<string, any>;
    channelId?: string;
    priority?: 'high' | 'normal';
  },
): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT device_token FROM device_registry
       WHERE user_id = $1 AND device_token IS NOT NULL`,
      [userId],
    );

    const expoTokens = result.rows
      .map((r: any) => r.device_token)
      .filter((token: string) => isExpoPushToken(token));

    if (expoTokens.length === 0) return;

    const messages: ExpoPushMessage[] = expoTokens.map((to: string) => ({
      to,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      sound: 'default',
      priority: payload.priority === 'high' ? 'high' : 'normal',
      channelId: payload.channelId || 'default',
    }));

    await sendExpoPushNotifications(messages);
  } catch (err: any) {
    console.error(`[ExpoPush] sendExpoToUser error for user ${userId}:`, err?.message || err);
  }
}

