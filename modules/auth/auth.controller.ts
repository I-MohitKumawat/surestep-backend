import { Request, Response } from 'express';
import { adminAuth } from '../../config/firebase';
import { ProvisionSchema, RegisterDeviceSchema } from './auth.validators';
import { provisionUser, registerDevice, getUserDevices } from './auth.service';
import { ok, created } from '../../shared/utils/response';
import { AppError } from '../../shared/errors/AppError';
import pool from '../../db/config';

/**
 * POST /auth/provision
 * Called once by the frontend right after Firebase sign-in when our DB has no row.
 * Reads the Firebase ID token from the Authorization header to get firebase_uid.
 */
export async function provision(req: Request, res: Response): Promise<void> {
  const body = ProvisionSchema.parse(req.body);

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError('UNAUTHORIZED', 'Missing Bearer token', 401);
  }
  const idToken = authHeader.split(' ')[1];

  let firebaseUid: string;
  let firebaseEmail: string | undefined;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    firebaseUid   = decoded.uid;
    firebaseEmail = decoded.email;
  } catch {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired Firebase token', 401);
  }

  const user = await provisionUser({
    firebaseUid,
    email: firebaseEmail,
    name: body.name,
    role: body.role,
    phone: body.phone,
    preferred_language: body.preferred_language,
  });

  created(res, { user });
}

/**
 * POST /auth/devices
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
  await pool.query(
    'DELETE FROM device_registry WHERE id = $1 AND user_id = $2',
    [req.params.deviceId, req.user!.id],
  );
  ok(res, { message: 'Device removed' });
}
