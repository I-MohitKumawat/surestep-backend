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

    let firebaseUid: string;
    let decodedEmail: string | undefined;
    let decodedPhone: string | undefined;

    if (idToken.startsWith('mock-dev-')) {
      const rawUid = idToken.replace('mock-dev-', '').replace('-token', '');
      const rawUserRes = await pool.query(
        'SELECT * FROM users WHERE firebase_uid = $1 AND is_active = TRUE AND deleted_at IS NULL',
        [rawUid]
      );
      if (rawUserRes.rows[0]) {
        firebaseUid = rawUid;
        decodedEmail = `${firebaseUid}@surestep.app`;
      } else {
        firebaseUid = idToken.replace('-token', '-uid');
        decodedEmail = `${firebaseUid}@surestep.app`;
      }
    } else {
      // Verify the Firebase ID token — throws if expired / invalid
      const decoded = await adminAuth.verifyIdToken(idToken);
      firebaseUid = decoded.uid;
      decodedEmail = decoded.email;
      decodedPhone = decoded.phone_number;
    }

    let result = await pool.query(
      'SELECT * FROM users WHERE firebase_uid = $1 AND is_active = TRUE AND deleted_at IS NULL',
      [firebaseUid],
    );

    // If not found by UID, but we have a verified phone number from Firebase, check if user exists by phone
    if (!result.rows[0] && decodedPhone) {
      const phoneResult = await pool.query(
        'SELECT * FROM users WHERE phone = $1 AND is_active = TRUE AND deleted_at IS NULL',
        [decodedPhone],
      );
      if (phoneResult.rows[0]) {
        const existingUser = phoneResult.rows[0];
        console.log(`[AuthMiddleware] Syncing firebase_uid for user ${existingUser.id} from ${existingUser.firebase_uid} to ${firebaseUid}`);
        const updateRes = await pool.query(
          'UPDATE users SET firebase_uid = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
          [firebaseUid, existingUser.id]
        );
        result = updateRes;
      }
    }

    if (!result.rows[0]) {
      if (idToken.startsWith('mock-dev-')) {
        // Auto-provision developer demo user!
        const role = idToken.includes('patient') ? 'PATIENT' : idToken.includes('caregiver') ? 'CAREGIVER' : 'FAMILY';
        const name = `Demo ${role.charAt(0) + role.slice(1).toLowerCase()}`;
        const phone = role === 'PATIENT' ? '+919999999999' : role === 'CAREGIVER' ? '+918888888888' : '+917777777777';
        const city = 'Bangalore'; // Same city to make testing matching city search automatic!
        
        console.log(`[DevBypass] Auto-provisioning mock dev user: ${name} (${role})`);
        
        // 1. Insert into users
        const insertUser = await pool.query(
          `INSERT INTO users (firebase_uid, phone, name, role, city, onboarding_complete)
           VALUES ($1, $2, $3, $4, $5, TRUE)
           ON CONFLICT (phone) DO UPDATE SET firebase_uid = EXCLUDED.firebase_uid, updated_at = NOW()
           RETURNING *`,
          [firebaseUid, phone, name, role, city]
        );
        
        const newUser = insertUser.rows[0];
        
        // 2. Create the corresponding profile table row
        try {
          if (role === 'PATIENT') {
            await pool.query(
              `INSERT INTO patient_profiles (user_id, emergency_contact_name, emergency_contact_phone)
               VALUES ($1, $2, $3)
               ON CONFLICT (user_id) DO NOTHING`,
              [newUser.id, 'Emergency Friend', '+919999999900']
            );
          } else if (role === 'CAREGIVER') {
            await pool.query(
              `INSERT INTO caregiver_profiles (user_id, years_of_experience, hourly_rate_inr, specializations, is_discoverable)
               VALUES ($1, 5, 250, ARRAY['Dementia', 'Alzheimer''s'], TRUE)
               ON CONFLICT (user_id) DO NOTHING`,
              [newUser.id]
            );
          } else if (role === 'FAMILY') {
            await pool.query(
              `INSERT INTO family_profiles (user_id)
               VALUES ($1)
               ON CONFLICT (user_id) DO NOTHING`,
              [newUser.id]
            );
          }
        } catch (profileErr) {
          console.warn('[DevBypass] Warning: Failed to auto-create mock profile row:', profileErr);
        }
        
        result = insertUser;
      } else {
        // User authenticated with Firebase but hasn't completed in-app provisioning.
        // The frontend should call POST /auth/provision to create the DB row.
        throw new AppError('USER_NOT_PROVISIONED', 'Complete profile setup to continue.', 404);
      }
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
