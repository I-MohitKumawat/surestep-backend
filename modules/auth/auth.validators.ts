import { z } from 'zod';

/**
 * POST /auth/provision
 * Called by the frontend immediately after Firebase sign-in, if the user
 * doesn't yet exist in our database (USER_NOT_PROVISIONED).
 * The Firebase ID token is read from the Authorization header.
 */
export const ProvisionSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.enum(['PATIENT', 'CAREGIVER', 'FAMILY']),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format').optional(),
  preferred_language: z.string().max(10).optional().default('en'),
});

/**
 * POST /auth/devices
 * Register / update FCM device token after login.
 */
export const RegisterDeviceSchema = z.object({
  device_type: z.enum(['PHONE_IOS', 'PHONE_ANDROID', 'WEARABLE', 'GLASS', 'HOME_HUB']),
  device_token: z.string().min(1),
  device_name: z.string().max(100).optional(),
  os_version: z.string().max(20).optional(),
  app_version: z.string().max(20).optional(),
});
