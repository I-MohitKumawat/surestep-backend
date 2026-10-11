"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendToUser = sendToUser;
exports.sendToCareCircle = sendToCareCircle;
exports.sendToPatientCaregivers = sendToPatientCaregivers;
exports.sendSilentLocationRequest = sendSilentLocationRequest;
exports.upsertDeviceToken = upsertDeviceToken;
const firebase_1 = __importDefault(require("../../config/firebase"));
const config_1 = __importDefault(require("../../db/config"));
const expoPush_service_1 = require("./expoPush.service");
// ─── Fetch device tokens for a user ──────────────────────────────────────────
async function getDeviceTokens(userId) {
    const result = await config_1.default.query(`SELECT device_token FROM device_registry
     WHERE user_id = $1 AND device_token IS NOT NULL
     ORDER BY last_seen_at DESC NULLS LAST`, [userId]);
    return result.rows.map((r) => r.device_token).filter(Boolean);
}
// ─── Core send function ───────────────────────────────────────────────────────
/**
 * Send a push notification to a single user (all their registered devices).
 * Silently ignores invalid / unregistered tokens.
 */
async function sendToUser(userId, payload) {
    const tokens = await getDeviceTokens(userId);
    if (!tokens.length)
        return;
    const expoTokens = tokens.filter(expoPush_service_1.isExpoPushToken);
    const fcmTokens = tokens.filter((t) => !(0, expoPush_service_1.isExpoPushToken)(t));
    // 1. Deliver to Expo devices via Expo Push Service
    if (expoTokens.length > 0) {
        const isCritical = payload.data?.priority === 'HIGH' || payload.data?.notification_type === 'SOS';
        const expoMessages = expoTokens.map((to) => ({
            to,
            title: payload.title,
            body: payload.body,
            data: payload.data,
            sound: 'default',
            priority: isCritical ? 'high' : 'normal',
            channelId: isCritical ? 'alarms' : 'default',
        }));
        await (0, expoPush_service_1.sendExpoPushNotifications)(expoMessages);
    }
    // 2. Deliver to native Firebase FCM devices
    if (fcmTokens.length > 0) {
        const invalidTokens = [];
        const messages = fcmTokens.map((token) => ({
            token,
            notification: {
                title: payload.title,
                body: payload.body,
            },
            data: {
                ...payload.data,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
            },
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    priority: 'high',
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
            const batchResponse = await firebase_1.default.messaging().sendEach(messages);
            // Collect tokens that need to be cleaned up
            batchResponse.responses.forEach((response, idx) => {
                if (!response.success) {
                    const errCode = response.error?.code ?? '';
                    if (errCode === 'messaging/invalid-registration-token' ||
                        errCode === 'messaging/registration-token-not-registered') {
                        invalidTokens.push(fcmTokens[idx]);
                    }
                }
            });
            if (invalidTokens.length > 0) {
                await config_1.default.query(`DELETE FROM device_registry WHERE device_token = ANY($1)`, [invalidTokens]);
            }
        }
        catch (err) {
            console.error('[FCM] sendToUser error:', err);
        }
    }
}
async function sendToCareCircle(patientId, payload, eventType = 'GENERAL') {
    // Fetch all confirmed relationships with family preference data
    const result = await config_1.default.query(`SELECT pr.related_user_id, pr.relationship_type,
            fp.notify_on_breach, fp.notify_on_missed_critical, fp.notify_on_sos
     FROM patient_relationships pr
     LEFT JOIN family_profiles fp ON fp.user_id = pr.related_user_id
     WHERE pr.patient_user_id = $1 AND pr.status = 'CONFIRMED'`, [patientId]);
    if (!result.rows.length)
        return;
    const recipients = [];
    for (const row of result.rows) {
        const rel = row.relationship_type;
        const isCaregiverTier = rel === 'CAREGIVER' || rel === 'GUARDIAN';
        const isFamilyClose = rel === 'FAMILY_CLOSE';
        const isFamilyExtended = rel === 'FAMILY_EXTENDED';
        // FAMILY_EXTENDED never gets real-time push regardless of event
        if (isFamilyExtended)
            continue;
        if (isCaregiverTier) {
            // Caregivers and guardians always receive real-time notifications
            recipients.push(row.related_user_id);
            continue;
        }
        if (isFamilyClose) {
            switch (eventType) {
                case 'SOS_TRIGGERED':
                    // SOS always goes to everyone — check notify_on_sos pref
                    if (row.notify_on_sos !== false)
                        recipients.push(row.related_user_id);
                    break;
                case 'ZONE_EXIT':
                case 'APPROACHING_BOUNDARY':
                    if (row.notify_on_breach !== false)
                        recipients.push(row.related_user_id);
                    break;
                case 'TASK_MISSED_CRITICAL':
                    if (row.notify_on_missed_critical !== false)
                        recipients.push(row.related_user_id);
                    break;
                case 'NO_SIGNAL':
                case 'BATTERY_CRITICAL':
                case 'GENERAL':
                    // Always notify family close for these
                    recipients.push(row.related_user_id);
                    break;
            }
        }
    }
    if (!recipients.length)
        return;
    const { createInAppNotification } = await Promise.resolve().then(() => __importStar(require('./notification.service')));
    await Promise.allSettled(recipients.map((userId) => createInAppNotification({
        userId,
        title: payload.title,
        body: payload.body,
        payload: payload.data || {},
    })));
}
/**
 * @deprecated Use sendToCareCircle instead.
 * Kept for backward compatibility during migration.
 */
async function sendToPatientCaregivers(patientId, payload) {
    return sendToCareCircle(patientId, payload, 'GENERAL');
}
/**
 * Send a silent (data-only) push notification to the patient device.
 * Used to trigger background location updates on demand.
 */
async function sendSilentLocationRequest(patientId) {
    const tokens = await getDeviceTokens(patientId);
    if (!tokens.length) {
        console.log(`[FCM] No registered device tokens for patient: ${patientId}`);
        return;
    }
    const expoTokens = tokens.filter(expoPush_service_1.isExpoPushToken);
    const fcmTokens = tokens.filter((t) => !(0, expoPush_service_1.isExpoPushToken)(t));
    if (expoTokens.length > 0) {
        const expoMessages = expoTokens.map((to) => ({
            to,
            data: {
                type: 'LOCATION_REQUEST',
                patientId,
            },
            priority: 'high',
            channelId: 'default',
        }));
        await (0, expoPush_service_1.sendExpoPushNotifications)(expoMessages);
    }
    if (fcmTokens.length > 0) {
        const messages = fcmTokens.map((token) => ({
            token,
            data: {
                type: 'LOCATION_REQUEST',
                patientId,
            },
            android: {
                priority: 'high',
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
            const batchResponse = await firebase_1.default.messaging().sendEach(messages);
            console.log(`[FCM] Silent location request dispatched to ${messages.length} device(s)`);
        }
        catch (err) {
            console.error('[FCM] sendSilentLocationRequest failed:', err);
        }
    }
}
/**
 * Register or update a device token for a user.
 * Called by the frontend when the app boots or FCM token refreshes.
 */
async function upsertDeviceToken(userId, deviceToken, deviceType, deviceName, appVersion) {
    await config_1.default.query(`INSERT INTO device_registry
       (user_id, device_type, device_token, device_name, app_version, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id, device_token)
       DO UPDATE SET last_seen_at = NOW(), app_version = EXCLUDED.app_version`, [userId, deviceType, deviceToken, deviceName ?? null, appVersion ?? null]);
}
//# sourceMappingURL=fcm.service.js.map