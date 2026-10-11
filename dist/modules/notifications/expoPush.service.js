"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isExpoPushToken = isExpoPushToken;
exports.sendExpoPushNotifications = sendExpoPushNotifications;
exports.sendExpoToUser = sendExpoToUser;
/**
 * SureStep — Expo Push Notification Service
 *
 * Sends push notifications to Expo Push tokens (ExponentPushToken[...])
 * via Expo's official Push API: https://exp.host/--/api/v2/push/send
 * Automatically prunes invalid/unregistered device tokens (DeviceNotRegistered).
 */
const config_1 = __importDefault(require("../../db/config"));
/**
 * Validates if a token is a valid Expo Push token format.
 */
function isExpoPushToken(token) {
    return (typeof token === 'string' &&
        (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[')));
}
/**
 * Sends messages in batches (max 100 per chunk per Expo specification)
 * to https://exp.host/--/api/v2/push/send.
 * Automatically deletes DeviceNotRegistered tokens from device_registry.
 */
async function sendExpoPushNotifications(messages) {
    if (!messages || messages.length === 0)
        return;
    const EXPO_API_URL = 'https://exp.host/--/api/v2/push/send';
    const CHUNK_SIZE = 100;
    const invalidTokens = [];
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
            const result = (await response.json());
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
        }
        catch (err) {
            console.error('[ExpoPush] Error delivering push batch:', err?.message || err);
        }
    }
    // Prune unregistered tokens from device_registry
    if (invalidTokens.length > 0) {
        try {
            console.log(`[ExpoPush] Pruning ${invalidTokens.length} unregistered tokens from device_registry`);
            await config_1.default.query(`DELETE FROM device_registry WHERE device_token = ANY($1)`, [invalidTokens]);
        }
        catch (pruneErr) {
            console.error('[ExpoPush] Error pruning invalid tokens:', pruneErr?.message || pruneErr);
        }
    }
}
/**
 * Sends an Expo push notification directly to all Expo devices registered for a user.
 */
async function sendExpoToUser(userId, payload) {
    try {
        const result = await config_1.default.query(`SELECT device_token FROM device_registry
       WHERE user_id = $1 AND device_token IS NOT NULL`, [userId]);
        const expoTokens = result.rows
            .map((r) => r.device_token)
            .filter((token) => isExpoPushToken(token));
        if (expoTokens.length === 0)
            return;
        const messages = expoTokens.map((to) => ({
            to,
            title: payload.title,
            body: payload.body,
            data: payload.data,
            sound: 'default',
            priority: payload.priority === 'high' ? 'high' : 'normal',
            channelId: payload.channelId || 'default',
        }));
        await sendExpoPushNotifications(messages);
    }
    catch (err) {
        console.error(`[ExpoPush] sendExpoToUser error for user ${userId}:`, err?.message || err);
    }
}
//# sourceMappingURL=expoPush.service.js.map