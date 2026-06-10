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
export declare function createInAppNotification(input: CreateNotificationInput): Promise<any>;
//# sourceMappingURL=notification.service.d.ts.map