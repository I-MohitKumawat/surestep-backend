import pool from '../../db/config';
import { AppError } from '../../shared/errors/AppError';
import { User } from '../../shared/types';

interface ProvisionInput {
  firebaseUid: string;
  email?: string;
  name: string;
  role: string;
  phone?: string;
  preferred_language?: string;
}

/**
 * Creates the in-app user row after Firebase sign-in.
 * Idempotent — returns existing row if already provisioned.
 */
export async function provisionUser(input: ProvisionInput): Promise<User> {
  const { firebaseUid, email, name, role, phone, preferred_language } = input;

  // Idempotent: return existing row if already provisioned
  const existing = await pool.query(
    'SELECT * FROM users WHERE firebase_uid = $1',
    [firebaseUid],
  );
  if (existing.rows[0]) return existing.rows[0];

  // Phone uniqueness check (optional field)
  if (phone) {
    const phoneCheck = await pool.query(
      'SELECT id FROM users WHERE phone = $1',
      [phone],
    );
    if (phoneCheck.rows[0]) {
      throw new AppError('PHONE_TAKEN', 'This phone number is already registered', 409);
    }
  }

  const result = await pool.query(
    `INSERT INTO users (firebase_uid, email, name, role, phone, preferred_language)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [firebaseUid, email ?? null, name, role, phone ?? null, preferred_language ?? 'en'],
  );

  const user = result.rows[0] as User;

  // Seed empty profile rows for the user's role
  if (role === 'PATIENT') {
    await pool.query('INSERT INTO patient_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
    await pool.query('INSERT INTO patient_states (patient_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
    await pool.query('INSERT INTO patient_threads (patient_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
  } else if (role === 'CAREGIVER') {
    await pool.query('INSERT INTO caregiver_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
  } else if (role === 'FAMILY') {
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
 * Lists all registered devices for a user.
 */
export async function getUserDevices(userId: string) {
  const result = await pool.query(
    'SELECT * FROM device_registry WHERE user_id = $1 ORDER BY last_seen_at DESC',
    [userId],
  );
  return result.rows;
}
