"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isExpoPushToken = isExpoPushToken;
exports.sendExpoPushNotifications = sendExpoPushNotifications;
exports.checkExpoPushReceipts = checkExpoPushReceipts;
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
async function pruneInvalidTokens(invalidTokens) {
    if (invalidTokens.length === 0)
        return;
    try {
        console.log(`[ExpoPush] Pruning ${invalidTokens.length} unregistered tokens from device_registry`);
        await config_1.default.query(`DELETE FROM device_registry WHERE device_token = ANY($1)`, [invalidTokens]);
    }
    catch (pruneErr) {
        console.error('[ExpoPush] Error pruning invalid tokens:', pruneErr?.message || pruneErr);
    }
}
/**
 * Sends messages in batches (max 100 per chunk per Expo specification)
 * to https://exp.host/--/api/v2/push/send.
 * Handles immediate ticket errors separately from asynchronous delivery receipts.
 * Automatically deletes DeviceNotRegistered tokens from device_registry.
 */
async function sendExpoPushNotifications(messages) {
    const resultSummary = {
        tickets: [],
        ticketIdsByToken: {},
        invalidTokens: [],
        errors: [],
    };
    if (!messages || messages.length === 0)
        return resultSummary;
    const EXPO_API_URL = 'https://exp.host/--/api/v2/push/send';
    const CHUNK_SIZE = 100;
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
                const msg = `HTTP ${response.status}: ${errorText}`;
                console.error(`[ExpoPush] API returned ${msg}`);
                resultSummary.errors.push(msg);
                continue;
            }
            const result = (await response.json());
            const tickets = result?.data || [];
            resultSummary.tickets.push(...tickets);
            tickets.forEach((ticket, idx) => {
                const recipientToken = chunk[idx]?.to;
                if (ticket.status === 'ok' && ticket.id && recipientToken) {
                    resultSummary.ticketIdsByToken[ticket.id] = recipientToken;
                }
                else if (ticket.status === 'error') {
                    const errCode = ticket.details?.error || 'UnknownTicketError';
                    console.warn(`[ExpoPush] Ticket error (${errCode}):`, ticket.message, ticket.details);
                    resultSummary.errors.push(`${errCode}: ${ticket.message || 'Unknown error'}`);
                    if (errCode === 'DeviceNotRegistered' && recipientToken) {
                        resultSummary.invalidTokens.push(recipientToken);
                    }
                }
            });
        }
        catch (err) {
            const msg = err?.message || String(err);
            console.error('[ExpoPush] Error delivering push batch:', msg);
            resultSummary.errors.push(msg);
        }
    }
    await pruneInvalidTokens(resultSummary.invalidTokens);
    return resultSummary;
}
/**
 * Polls https://exp.host/--/api/v2/push/getReceipts for accepted ticket IDs.
 * Note: Provider ticket acceptance ('ok') does NOT guarantee device delivery;
 * downstream APNs/FCM failures (including DeviceNotRegistered) surface in receipts.
 */
async function checkExpoPushReceipts(ticketIdsByToken) {
    const receiptSummary = {
        receipts: {},
        invalidTokens: [],
        errors: [],
    };
    const ticketIds = Object.keys(ticketIdsByToken);
    if (ticketIds.length === 0)
        return receiptSummary;
    const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < ticketIds.length; i += CHUNK_SIZE) {
        const ids = ticketIds.slice(i, i + CHUNK_SIZE);
        try {
            const response = await fetch(EXPO_RECEIPTS_URL, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ids }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                const msg = `HTTP ${response.status}: ${errorText}`;
                console.error(`[ExpoPush] Receipts API returned ${msg}`);
                receiptSummary.errors.push(msg);
                continue;
            }
            const body = (await response.json());
            const receipts = body?.data || {};
            Object.assign(receiptSummary.receipts, receipts);
            for (const [ticketId, receipt] of Object.entries(receipts)) {
                if (receipt.status === 'error') {
                    const errCode = receipt.details?.error || 'UnknownReceiptError';
                    console.warn(`[ExpoPush] Receipt error for ticket ${ticketId} (${errCode}):`, receipt.message);
                    receiptSummary.errors.push(`${errCode}: ${receipt.message || 'Unknown error'}`);
                    if (errCode === 'DeviceNotRegistered') {
                        const badToken = ticketIdsByToken[ticketId];
                        if (badToken) {
                            receiptSummary.invalidTokens.push(badToken);
                        }
                    }
                }
            }
        }
        catch (err) {
            const msg = err?.message || String(err);
            console.error('[ExpoPush] Error fetching push receipts:', msg);
            receiptSummary.errors.push(msg);
        }
    }
    await pruneInvalidTokens(receiptSummary.invalidTokens);
    return receiptSummary;
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