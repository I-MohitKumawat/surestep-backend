"use strict";
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
exports.createInAppNotification = createInAppNotification;
const config_1 = __importDefault(require("../../db/config"));
const fcm_service_1 = require("./fcm.service");
/**
 * Creates a notification log, emits a real-time WebSocket event,
 * and sends an FCM push notification to the user's devices.
 */
async function createInAppNotification(input) {
    const { userId, title, body, payload = {}, alertId = null } = input;
    try {
        // 1. Insert into notification_logs database table
        const result = await config_1.default.query(`INSERT INTO notification_logs (user_id, alert_id, channel, title, body, payload, delivered, delivered_at)
       VALUES ($1, $2, 'WEBSOCKET', $3, $4, $5, TRUE, NOW())
       RETURNING *`, [userId, alertId, title, body, JSON.stringify(payload)]);
        const notification = result.rows[0];
        // 2. Broadcast via WebSocket to the user's personal namespace room
        try {
            const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
            if (io) {
                io.to(`user:${userId}`).emit('notification:new', notification);
                console.log(`[WebSocket] Dispatched notification:new to user:${userId}`);
            }
        }
        catch (wsErr) {
            console.warn('[NotificationService] WebSocket broadcast failed:', wsErr);
        }
        // 3. Send FCM Push Notification
        try {
            // Convert payload record values to string for FCM data payload compatibility
            const dataPayload = {};
            Object.entries(payload).forEach(([key, val]) => {
                dataPayload[key] = typeof val === 'object' ? JSON.stringify(val) : String(val);
            });
            await (0, fcm_service_1.sendToUser)(userId, {
                title,
                body,
                data: dataPayload,
            });
        }
        catch (fcmErr) {
            console.warn('[NotificationService] FCM push notification dispatch failed:', fcmErr);
        }
        return notification;
    }
    catch (err) {
        console.error('[NotificationService] Failed to create notification:', err);
        throw err;
    }
}
//# sourceMappingURL=notification.service.js.map