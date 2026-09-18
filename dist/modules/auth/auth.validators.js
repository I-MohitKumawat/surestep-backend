"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegisterDeviceSchema = exports.ProvisionSchema = void 0;
const zod_1 = require("zod");
/**
 * POST /auth/provision
 * Called by the frontend immediately after Firebase sign-in, if the user
 * doesn't yet exist in our database (USER_NOT_PROVISIONED).
 * The Firebase ID token is read from the Authorization header.
 */
exports.ProvisionSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    role: zod_1.z.enum(['PATIENT', 'CAREGIVER', 'FAMILY']).optional(),
    phone: zod_1.z.string().regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format').optional(),
    preferred_language: zod_1.z.string().max(10).optional().default('en'),
});
/**
 * POST /auth/devices
 * Register / update FCM device token after login.
 */
exports.RegisterDeviceSchema = zod_1.z.object({
    device_type: zod_1.z.enum(['PHONE_IOS', 'PHONE_ANDROID', 'WEARABLE', 'GLASS', 'HOME_HUB']),
    device_token: zod_1.z.string().min(1),
    device_name: zod_1.z.string().max(100).optional(),
    os_version: zod_1.z.string().max(20).optional(),
    app_version: zod_1.z.string().max(20).optional(),
});
//# sourceMappingURL=auth.validators.js.map