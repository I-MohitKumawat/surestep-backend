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
export declare function isWithinQuietHours(start: string | null, end: string | null): boolean;
/**
 * Get or create notification settings for a user.
 */
export declare function getOrCreateNotificationSettings(userId: string): Promise<any>;
/**
 * Update notification settings.
 */
export declare function updateNotificationSettings(userId: string, data: any): Promise<any>;
/**
 * Creates a notification log, emits a real-time WebSocket event,
 * and sends an FCM push notification to the user's devices if permitted by settings.
 */
export declare function createInAppNotification(input: CreateNotificationInput): Promise<any>;
//# sourceMappingURL=notification.service.d.ts.map