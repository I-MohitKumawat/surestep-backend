import pool from '../../db/config';
import { db, deviceRegistry } from '../../db/drizzle';
import { eq, desc } from 'drizzle-orm';
import { AppError } from '../../shared/errors/AppError';
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
export async function provisionUser(input: ProvisionInput): Promise<User> {
  const { firebaseUid, email, name, role, phone, preferred_language } = input;
  const effectiveRole = role || 'PATIENT';

  // Idempotent: return existing active row if already provisioned
  const existing = await pool.query(
    'SELECT * FROM users WHERE firebase_uid = $1 AND is_active = TRUE AND deleted_at IS NULL',
    [firebaseUid],
  );
  if (existing.rows[0]) return existing.rows[0];

  // Phone uniqueness check for active accounts
  if (phone) {
    const phoneCheck = await pool.query(
      'SELECT * FROM users WHERE phone = $1 AND is_active = TRUE AND deleted_at IS NULL',
      [phone],
    );
    if (phoneCheck.rows[0]) {
      const existingUser = phoneCheck.rows[0];
      console.log(`[AuthService] Linking existing phone user ${existingUser.id} to new firebase_uid ${firebaseUid}`);
      
      // Preserve existing role if user already has an established role; otherwise assign effectiveRole
      const targetRole = existingUser.role || effectiveRole;

      const updateResult = await pool.query(
        `UPDATE users 
         SET firebase_uid = $1, role = $2, name = COALESCE(NULLIF(name, ''), $3), email = COALESCE(email, $4), updated_at = NOW() 
         WHERE id = $5 
         RETURNING *`,
        [firebaseUid, targetRole, name, email ?? null, existingUser.id],
      );
      
      const user = updateResult.rows[0] as User;
      
      // Seed empty profile rows for the user's role
      if (targetRole === 'PATIENT') {
        await pool.query('INSERT INTO patient_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
        await pool.query('INSERT INTO patient_states (patient_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
        await pool.query('INSERT INTO patient_threads (patient_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
      } else if (targetRole === 'CAREGIVER') {
        await pool.query('INSERT INTO caregiver_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
      } else if (targetRole === 'FAMILY') {
        await pool.query('INSERT INTO family_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
      }
      
      return user;
    }
  }

  const result = await pool.query(
    `INSERT INTO users (firebase_uid, email, name, role, phone, preferred_language)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [firebaseUid, email ?? null, name, effectiveRole, phone ?? null, preferred_language ?? 'en'],
  );

  const user = result.rows[0] as User;

  // Seed empty profile rows for the user's role
  if (effectiveRole === 'PATIENT') {
    await pool.query('INSERT INTO patient_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
    await pool.query('INSERT INTO patient_states (patient_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
    await pool.query('INSERT INTO patient_threads (patient_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
  } else if (effectiveRole === 'CAREGIVER') {
    await pool.query('INSERT INTO caregiver_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
  } else if (effectiveRole === 'FAMILY') {
    await pool.query('INSERT INTO family_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
  }

  return user;
}

/**
 * Registers or updates a device FCM token for push notifications.
 */
export async function registerDevice(
  userId: string,
  data: {
    device_type: string;
    device_token: string;
    device_name?: string;
    os_version?: string;
    app_version?: string;
  },
) {
  const result = await pool.query(
    `INSERT INTO device_registry (user_id, device_type, device_token, device_name, os_version, app_version, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (user_id, device_token) DO UPDATE
       SET last_seen_at = NOW(),
           app_version  = EXCLUDED.app_version,
           os_version   = EXCLUDED.os_version
     RETURNING *`,
    [userId, data.device_type, data.device_token, data.device_name ?? null, data.os_version ?? null, data.app_version ?? null],
  );
  return result.rows[0];
}

/**
 * Lists all registered devices for a user using Drizzle ORM.
 */
export async function getUserDevices(userId: string) {
  return db
    .select()
    .from(deviceRegistry)
    .where(eq(deviceRegistry.userId, userId))
    .orderBy(desc(deviceRegistry.lastSeenAt));
}
