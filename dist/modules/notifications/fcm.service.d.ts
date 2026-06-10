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
export interface FcmPayload {
    title: string;
    body: string;
    data?: Record<string, string>;
}
/**
 * Send a push notification to a single user (all their registered devices).
 * Silently ignores invalid / unregistered tokens.
 */
export declare function sendToUser(userId: string, payload: FcmPayload): Promise<void>;
/**
 * Send a push notification to the full Care Circle for a patient.
 * Routing is preference-aware per event type:
 *   SOS_TRIGGERED        → ALL confirmed relationships
 *   ZONE_EXIT / BREACH   → CAREGIVER, GUARDIAN, FAMILY_CLOSE (if notify_on_breach)
 *   TASK_MISSED_CRITICAL → CAREGIVER, GUARDIAN, FAMILY_CLOSE (if notify_on_missed_critical)
 *   FAMILY_EXTENDED      → digest-only, never real-time push
 */
export type CareCircleEventType = 'SOS_TRIGGERED' | 'ZONE_EXIT' | 'APPROACHING_BOUNDARY' | 'TASK_MISSED_CRITICAL' | 'NO_SIGNAL' | 'BATTERY_CRITICAL' | 'GENERAL';
export declare function sendToCareCircle(patientId: string, payload: FcmPayload, eventType?: CareCircleEventType): Promise<void>;
/**
 * @deprecated Use sendToCareCircle instead.
 * Kept for backward compatibility during migration.
 */
export declare function sendToPatientCaregivers(patientId: string, payload: FcmPayload): Promise<void>;
/**
 * Send a silent (data-only) push notification to the patient device.
 * Used to trigger background location updates on demand.
 */
export declare function sendSilentLocationRequest(patientId: string): Promise<void>;
/**
 * Register or update a device token for a user.
 * Called by the frontend when the app boots or FCM token refreshes.
 */
export declare function upsertDeviceToken(userId: string, deviceToken: string, deviceType: 'PHONE_IOS' | 'PHONE_ANDROID', deviceName?: string, appVersion?: string): Promise<void>;
//# sourceMappingURL=fcm.service.d.ts.map