import { Request, Response } from 'express';
import { verifyToken } from '@clerk/backend';
import { ProvisionSchema, RegisterDeviceSchema } from './auth.validators';
import { provisionUser, registerDevice, getUserDevices } from './auth.service';
import { ok, created } from '../../shared/utils/response';
import { AppError } from '../../shared/errors/AppError';

/**
 * POST /auth/provision
 * Called once by the frontend right after Clerk sign-in when our DB has no row.
 * Reads the Clerk JWT from the Authorization header to get clerk_id.
 */
export async function provision(req: Request, res: Response): Promise<void> {
  const body = ProvisionSchema.parse(req.body);

  // Extract Clerk ID from the token (we don't use authenticate here since user doesn't exist yet)
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError('UNAUTHORIZED', 'Missing Bearer token', 401);
  }
  const token = authHeader.split(' ')[1];
  const verified = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
  const clerkId = verified.sub;

  const user = await provisionUser({
    clerkId,
    name: body.name,
    role: body.role,
    phone: body.phone,
    preferred_language: body.preferred_language,
  });

  created(res, { user });
}

/**
 * POST /auth/device
 * Register FCM device token. Requires authenticate middleware.
 */
export async function addDevice(req: Request, res: Response): Promise<void> {
  const body = RegisterDeviceSchema.parse(req.body);
  const device = await registerDevice(req.user!.id, body);
  created(res, { device });
}

/**
 * GET /auth/devices
 * List registered devices for the authenticated user.
 */
export async function listDevices(req: Request, res: Response): Promise<void> {
  const devices = await getUserDevices(req.user!.id);
  ok(res, { devices });
}

/**
 * DELETE /auth/devices/:deviceId
 * Remove a device registration.
 */
export async function removeDevice(req: Request, res: Response): Promise<void> {
  const pool = await import('../../db/config');
  await pool.default.query(
    'DELETE FROM device_registry WHERE id = $1 AND user_id = $2',
    [req.params.deviceId, req.user!.id],
  );
  ok(res, { message: 'Device removed' });
}
