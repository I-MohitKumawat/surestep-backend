import { User } from '../../shared/types';
interface ProvisionInput {
    firebaseUid: string;
    email?: string;
    name: string;
    role?: string;
    phone?: string;
    preferred_language?: string;
}
/**
 * Creates the in-app user row after Firebase sign-in.
 * Idempotent — returns existing row if already provisioned.
 */
export declare function provisionUser(input: ProvisionInput): Promise<User>;
/**
 * Registers or updates a device FCM token for push notifications.
 */
export declare function registerDevice(userId: string, data: {
    device_type: string;
    device_token: string;
    device_name?: string;
    os_version?: string;
    app_version?: string;
}): Promise<any>;
/**
 * Lists all registered devices for a user using Drizzle ORM.
 */
export declare function getUserDevices(userId: string): Promise<{
    id: string;
    userId: string;
    deviceType: string;
    deviceToken: string;
    deviceId: string | null;
    deviceName: string | null;
    osVersion: string | null;
    appVersion: string | null;
    isPrimary: boolean;
    lastSeenAt: Date | null;
    createdAt: Date;
}[]>;
export {};
//# sourceMappingURL=auth.service.d.ts.map