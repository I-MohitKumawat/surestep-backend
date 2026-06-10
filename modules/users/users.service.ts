import pool from '../../db/config';
import { AppError } from '../../shared/errors/AppError';
import { User } from '../../shared/types';

// ─── Users ───────────────────────────────────────────────────────────────────

export async function getMe(userId: string): Promise<User> {
  const result = await pool.query(
    'SELECT * FROM users WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL',
    [userId],
  );
  if (!result.rows[0]) throw new AppError('NOT_FOUND', 'User not found', 404);
  return result.rows[0];
}

export async function updateMe(
  userId: string,
  data: {
    name?: string;
    preferred_language?: string;
    city?: string;
    date_of_birth?: string;
    gender?: string;
    photo_url?: string;
  },
): Promise<User> {
  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;

  if (data.name !== undefined)               { fields.push(`name = $${i++}`);               values.push(data.name); }
  if (data.preferred_language !== undefined) { fields.push(`preferred_language = $${i++}`); values.push(data.preferred_language); }
  if (data.city !== undefined)               { fields.push(`city = $${i++}`);               values.push(data.city); }
  if (data.date_of_birth !== undefined)      { fields.push(`date_of_birth = $${i++}`);      values.push(data.date_of_birth); }
  if (data.gender !== undefined)             { fields.push(`gender = $${i++}`);             values.push(data.gender); }
  if (data.photo_url !== undefined)          { fields.push(`photo_url = $${i++}`);          values.push(data.photo_url); }

  if (fields.length === 0) throw new AppError('VALIDATION_ERROR', 'No fields to update', 422);

  fields.push(`updated_at = NOW()`);
  values.push(userId);

  const result = await pool.query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values,
  );
  return result.rows[0];
}

// ─── Patient Profile ─────────────────────────────────────────────────────────

export async function upsertPatientProfile(userId: string, data: any) {
  const result = await pool.query(
    `INSERT INTO patient_profiles (user_id, emergency_contact_name, emergency_contact_phone,
       diagnosis, diagnosis_date, medications, known_triggers, comfort_items,
       favourite_songs, cognitive_baseline_date, nimhans_patient_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (user_id) DO UPDATE SET
       emergency_contact_name  = EXCLUDED.emergency_contact_name,
       emergency_contact_phone = EXCLUDED.emergency_contact_phone,
       diagnosis               = EXCLUDED.diagnosis,
       diagnosis_date          = EXCLUDED.diagnosis_date,
       medications             = EXCLUDED.medications,
       known_triggers          = EXCLUDED.known_triggers,
       comfort_items           = EXCLUDED.comfort_items,
       favourite_songs         = EXCLUDED.favourite_songs,
       cognitive_baseline_date = EXCLUDED.cognitive_baseline_date,
       nimhans_patient_id      = EXCLUDED.nimhans_patient_id,
       updated_at              = NOW()
     RETURNING *`,
    [
      userId,
      data.emergency_contact_name ?? null,
      data.emergency_contact_phone ?? null,
      data.diagnosis ?? null,
      data.diagnosis_date ?? null,
      JSON.stringify(data.medications ?? []),
      data.known_triggers ?? [],
      data.comfort_items ?? [],
      JSON.stringify(data.favourite_songs ?? []),
      data.cognitive_baseline_date ?? null,
      data.nimhans_patient_id ?? null,
    ],
  );

  // Mark onboarding complete
  await pool.query(
    `UPDATE users SET onboarding_complete = TRUE, updated_at = NOW() WHERE id = $1`,
    [userId],
  );

  return result.rows[0];
}

export async function getPatientProfile(patientId: string) {
  const result = await pool.query(
    `SELECT pp.*, u.name, u.photo_url, u.city, u.preferred_language
     FROM patient_profiles pp
     JOIN users u ON u.id = pp.user_id
     WHERE pp.user_id = $1`,
    [patientId],
  );
  if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Patient profile not found', 404);
  return result.rows[0];
}

// ─── Caregiver Profile ───────────────────────────────────────────────────────

export async function upsertCaregiverProfile(userId: string, data: any) {
  const result = await pool.query(
    `INSERT INTO caregiver_profiles (user_id, years_of_experience, specializations,
       languages_spoken, availability_types, service_radius_km, max_patients,
       hourly_rate, daily_rate, bio, is_discoverable)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (user_id) DO UPDATE SET
       years_of_experience = EXCLUDED.years_of_experience,
       specializations     = EXCLUDED.specializations,
       languages_spoken    = EXCLUDED.languages_spoken,
       availability_types  = EXCLUDED.availability_types,
       service_radius_km   = EXCLUDED.service_radius_km,
       max_patients        = EXCLUDED.max_patients,
       hourly_rate         = EXCLUDED.hourly_rate,
       daily_rate          = EXCLUDED.daily_rate,
       bio                 = EXCLUDED.bio,
       is_discoverable     = EXCLUDED.is_discoverable,
       updated_at          = NOW()
     RETURNING *`,
    [
      userId,
      data.years_of_experience ?? data.yearsExperience ?? 0,
      data.specializations ?? data.specs ?? [],
      data.languages_spoken ?? data.languagesSpoken ?? [],
      data.availability_types ?? data.availabilityTypes ?? [],
      data.service_radius_km ?? data.serviceRadiusKm ?? 10,
      data.max_patients ?? data.maxPatients ?? 3,
      data.hourly_rate ?? data.hourlyRate ?? null,
      data.daily_rate ?? data.dailyRate ?? null,
      data.bio ?? data.aboutMe ?? null,
      data.is_discoverable ?? data.isDiscoverable ?? true,
    ],
  );

  await pool.query(
    `UPDATE users SET onboarding_complete = TRUE, updated_at = NOW() WHERE id = $1`,
    [userId],
  );

  const row = result.rows[0];
  return {
    ...row,
    yearsExperience: row.years_of_experience,
    specializations: row.specializations,
    languagesSpoken: row.languages_spoken,
    availabilityTypes: row.availability_types,
    serviceRadiusKm: row.service_radius_km,
    maxPatients: row.max_patients,
    hourlyRate: row.hourly_rate,
    dailyRate: row.daily_rate,
    aboutMe: row.bio,
    isDiscoverable: row.is_discoverable,
  };
}

export async function getCaregiverProfile(caregiverId: string) {
  const result = await pool.query(
    `SELECT cp.*, u.name, u.photo_url, u.city, u.preferred_language
     FROM caregiver_profiles cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.user_id = $1`,
    [caregiverId],
  );
  if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Caregiver profile not found', 404);
  const row = result.rows[0];
  return {
    ...row,
    yearsExperience: row.years_of_experience,
    specializations: row.specializations,
    languagesSpoken: row.languages_spoken,
    availabilityTypes: row.availability_types,
    serviceRadiusKm: row.service_radius_km,
    maxPatients: row.max_patients,
    hourlyRate: row.hourly_rate,
    dailyRate: row.daily_rate,
    aboutMe: row.bio,
    isDiscoverable: row.is_discoverable,
  };
}

// ─── Family Profile ──────────────────────────────────────────────────────────

export async function upsertFamilyProfile(userId: string, data: any) {
  const result = await pool.query(
    `INSERT INTO family_profiles (user_id, notify_on_daily_digest, digest_frequency, whatsapp_number)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id) DO UPDATE SET
       notify_on_daily_digest = EXCLUDED.notify_on_daily_digest,
       digest_frequency            = EXCLUDED.digest_frequency,
       whatsapp_number             = EXCLUDED.whatsapp_number,
       updated_at                  = NOW()
     RETURNING *`,
    [
      userId,
      data.notify_on_daily_digest ?? data.notification_digest_enabled ?? true,
      data.digest_frequency ?? 'DAILY',
      data.whatsapp_number ?? null,
    ],
  );

  await pool.query(
    `UPDATE users SET onboarding_complete = TRUE, updated_at = NOW() WHERE id = $1`,
    [userId],
  );

  return result.rows[0];
}
