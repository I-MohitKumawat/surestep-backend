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
export interface ExpoPushReceipt {
    status: 'ok' | 'error';
    message?: string;
    details?: {
        error?: 'DeviceNotRegistered' | 'MessageTooBig' | 'MessageRateExceeded' | 'InvalidCredentials' | string;
        [key: string]: any;
    };
}
export interface ExpoPushSendResult {
    tickets: ExpoPushTicket[];
    /** Maps accepted ticket ID -> recipient push token for asynchronous receipt polling */
    ticketIdsByToken: Record<string, string>;
    invalidTokens: string[];
    errors: string[];
}
export interface ExpoPushReceiptResult {
    receipts: Record<string, ExpoPushReceipt>;
    invalidTokens: string[];
    errors: string[];
}
/**
 * Validates if a token is a valid Expo Push token format.
 */
export declare function isExpoPushToken(token: string): boolean;
/**
 * Sends messages in batches (max 100 per chunk per Expo specification)
 * to https://exp.host/--/api/v2/push/send.
 * Handles immediate ticket errors separately from asynchronous delivery receipts.
 * Automatically deletes DeviceNotRegistered tokens from device_registry.
 */
export declare function sendExpoPushNotifications(messages: ExpoPushMessage[]): Promise<ExpoPushSendResult>;
/**
 * Polls https://exp.host/--/api/v2/push/getReceipts for accepted ticket IDs.
 * Note: Provider ticket acceptance ('ok') does NOT guarantee device delivery;
 * downstream APNs/FCM failures (including DeviceNotRegistered) surface in receipts.
 */
export declare function checkExpoPushReceipts(ticketIdsByToken: Record<string, string>): Promise<ExpoPushReceiptResult>;
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