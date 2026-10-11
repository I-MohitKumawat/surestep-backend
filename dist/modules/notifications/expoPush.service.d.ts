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
export declare function isExpoPushToken(token: string): boolean;
/**
 * Sends messages in batches (max 100 per chunk per Expo specification)
 * to https://exp.host/--/api/v2/push/send.
 * Automatically deletes DeviceNotRegistered tokens from device_registry.
 */
export declare function sendExpoPushNotifications(messages: ExpoPushMessage[]): Promise<void>;
/**
 * Sends an Expo push notification directly to all Expo devices registered for a user.
 */
export declare function sendExpoToUser(userId: string, payload: {
    title: string;
    body: string;
    data?: Record<string, any>;
    channelId?: string;
    priority?: 'high' | 'normal';
}): Promise<void>;
//# sourceMappingURL=expoPush.service.d.ts.map