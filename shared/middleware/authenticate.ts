import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@clerk/backend';
import pool from '../../db/config';
import { AppError } from '../errors/AppError';
import { UserRole } from '../types';

// ─── authenticate ─────────────────────────────────────────────────────────────
// Verifies Clerk JWT, resolves the row in our `users` table, and attaches it
// to req.user so every downstream handler has a typed, DB-backed user.
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

    const token = authHeader.split(' ')[1];
    const verified = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    const clerkId = verified.sub;

    const result = await pool.query(
      'SELECT * FROM users WHERE clerk_id = $1 AND is_active = TRUE AND deleted_at IS NULL',
      [clerkId],
    );

    if (!result.rows[0]) {
      // User authenticated with Clerk but hasn't completed in-app provisioning yet.
      // The frontend should call POST /auth/provision to create the DB row.
      throw new AppError('USER_NOT_PROVISIONED', 'Complete profile setup to continue.', 404);
    }

    req.user = result.rows[0];
    next();
  } catch (err: any) {
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
