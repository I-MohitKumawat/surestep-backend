import { Request, Response } from 'express';
/**
 * POST /auth/provision
 * Called once by the frontend right after Firebase sign-in when our DB has no row.
 * Reads the Firebase ID token from the Authorization header to get firebase_uid.
 */
export declare function provision(req: Request, res: Response): Promise<void>;
/**
 * POST /auth/devices
 * Register FCM device token. Requires authenticate middleware.
 */
export declare function addDevice(req: Request, res: Response): Promise<void>;
/**
 * GET /auth/devices
 * List registered devices for the authenticated user.
 */
export declare function listDevices(req: Request, res: Response): Promise<void>;
/**
 * DELETE /auth/devices/:deviceId
 * Remove a device registration.
 */
export declare function removeDevice(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=auth.controller.d.ts.map