import { z } from 'zod';
/**
 * POST /auth/provision
 * Called by the frontend immediately after Firebase sign-in, if the user
 * doesn't yet exist in our database (USER_NOT_PROVISIONED).
 * The Firebase ID token is read from the Authorization header.
 */
export declare const ProvisionSchema: z.ZodObject<{
    name: z.ZodString;
    role: z.ZodOptional<z.ZodEnum<{
        PATIENT: "PATIENT";
        CAREGIVER: "CAREGIVER";
        FAMILY: "FAMILY";
    }>>;
    phone: z.ZodOptional<z.ZodString>;
    preferred_language: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
/**
 * POST /auth/devices
 * Register / update FCM device token after login.
 */
export declare const RegisterDeviceSchema: z.ZodObject<{
    device_type: z.ZodEnum<{
        WEARABLE: "WEARABLE";
        GLASS: "GLASS";
        PHONE_IOS: "PHONE_IOS";
        PHONE_ANDROID: "PHONE_ANDROID";
        HOME_HUB: "HOME_HUB";
    }>;
    device_token: z.ZodString;
    device_name: z.ZodOptional<z.ZodString>;
    os_version: z.ZodOptional<z.ZodString>;
    app_version: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
//# sourceMappingURL=auth.validators.d.ts.map