import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../../config/firebase';
import pool from '../../db/config';
import { AppError } from '../errors/AppError';
import { UserRole } from '../types';

// ─── authenticate ─────────────────────────────────────────────────────────────
// Verifies Firebase ID token, resolves the row in our `users` table, and
// attaches it to req.user so every downstream handler has a typed, DB-backed user.
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError('UNAUTHORIZED', 'Missing Bearer token', 401);
    }

    const idToken = authHeader.split(' ')[1];

    // Verify the Firebase ID token — throws if expired / invalid
    const decoded = await adminAuth.verifyIdToken(idToken);
    const firebaseUid = decoded.uid;

    const result = await pool.query(
      'SELECT * FROM users WHERE firebase_uid = $1 AND is_active = TRUE AND deleted_at IS NULL',
      [firebaseUid],
    );

    if (!result.rows[0]) {
      // User authenticated with Firebase but hasn't completed in-app provisioning.
      // The frontend should call POST /auth/provision to create the DB row.
      throw new AppError('USER_NOT_PROVISIONED', 'Complete profile setup to continue.', 404);
    }

    req.user = result.rows[0];
    next();
  } catch (err: any) {
    // Re-wrap Firebase token errors as UNAUTHORIZED
    if (err?.code?.startsWith?.('auth/')) {
      return next(new AppError('UNAUTHORIZED', 'Invalid or expired token', 401));
    }
    next(err);
  }
};

// ─── requireRoles ─────────────────────────────────────────────────────────────
// Role guard — call after authenticate. Rejects if user.role not in allowed list.
export const requireRoles = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError('UNAUTHORIZED', 'Authentication required', 401));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError('ROLE_NOT_PERMITTED', `This action requires role: ${roles.join(' or ')}`, 403));
      return;
    }
    next();
  };
};
