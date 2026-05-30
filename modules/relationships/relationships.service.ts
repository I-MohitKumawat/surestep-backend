import pool from '../../db/config';
import { AppError } from '../../shared/errors/AppError';
import { generateToken } from '../../shared/utils/helpers';

// ─── Caregiver Request ────────────────────────────────────────────────────────

export async function sendCaregiverRequest(patientId: string, caregiverPhone: string) {
  // Resolve caregiver by phone
  const cgResult = await pool.query(
    `SELECT id FROM users WHERE phone = $1 AND role = 'CAREGIVER' AND is_active = TRUE`,
    [caregiverPhone],
  );
  if (!cgResult.rows[0]) throw new AppError('NOT_FOUND', 'No active caregiver found with this phone number', 404);

  const caregiverId = cgResult.rows[0].id;

  // Check for existing active link
  const existing = await pool.query(
    `SELECT id, status FROM patient_relationships
     WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER'`,
    [patientId, caregiverId],
  );
  if (existing.rows[0]) {
    const s = existing.rows[0].status;
    if (s === 'CONFIRMED') throw new AppError('CONFLICT', 'Already linked with this caregiver', 409);
    if (s === 'PENDING')   throw new AppError('CONFLICT', 'Request already pending', 409);
  }

  const result = await pool.query(
    `INSERT INTO patient_relationships (patient_user_id, related_user_id, relationship_type, status)
     VALUES ($1, $2, 'CAREGIVER', 'PENDING')
     ON CONFLICT (patient_user_id, related_user_id, relationship_type) DO UPDATE
       SET status = 'PENDING'
     RETURNING *`,
    [patientId, caregiverId],
  );
  return result.rows[0];
}

// ─── Family Invite ─────────────────────────────────────────────────────────────

export async function createFamilyInvite(
  guardianId: string,
  patientId: string,
  data: { relationship_type: string; notes?: string },
) {
  // Verify guardian has GUARDIAN or CAREGIVER relationship with patient
  const guardianCheck = await pool.query(
    `SELECT id FROM patient_relationships
     WHERE patient_user_id = $1 AND related_user_id = $2
       AND status = 'CONFIRMED'
       AND relationship_type IN ('GUARDIAN','CAREGIVER')`,
    [patientId, guardianId],
  );
  if (!guardianCheck.rows[0]) throw new AppError('RELATIONSHIP_REQUIRED', 'Only guardians or caregivers can invite family', 403);

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const result = await pool.query(
    `INSERT INTO patient_relationships
       (patient_user_id, related_user_id, relationship_type, status, invited_by, invite_token, invite_expires_at, notes)
     VALUES ($1, $1, $2, 'PENDING', $3, $4, $5, $6)
     RETURNING *`,
    // Note: related_user_id = patient for now; gets updated on accept
    [patientId, data.relationship_type, guardianId, token, expiresAt, data.notes ?? null],
  );
  return { invite_token: token, expires_at: expiresAt, relationship: result.rows[0] };
}

// ─── Accept Invite ─────────────────────────────────────────────────────────────

export async function acceptInvite(token: string, userId: string) {
  const result = await pool.query(
    `SELECT * FROM patient_relationships
     WHERE invite_token = $1 AND status = 'PENDING' AND invite_expires_at > NOW()`,
    [token],
  );
  const rel = result.rows[0];
  if (!rel) throw new AppError('NOT_FOUND', 'Invite not found or expired', 404);

  const updated = await pool.query(
    `UPDATE patient_relationships
     SET related_user_id = $1, status = 'CONFIRMED', confirmed_at = NOW(), invite_token = NULL
     WHERE id = $2
     RETURNING *`,
    [userId, rel.id],
  );
  return updated.rows[0];
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getMyPatients(caregiverId: string) {
  const result = await pool.query(
    `SELECT u.id, u.name, u.photo_url, u.city, u.preferred_language,
            pr.id as relationship_id, pr.relationship_type, pr.confirmed_at,
            ps.location_state, ps.safety_state, ps.routine_state, ps.engagement_state,
            ps.last_ping_at, ps.sos_active, ps.computed_at
     FROM patient_relationships pr
     JOIN users u ON u.id = pr.patient_user_id
     LEFT JOIN patient_states ps ON ps.patient_id = pr.patient_user_id
     WHERE pr.related_user_id = $1 AND pr.status = 'CONFIRMED'
     ORDER BY
       CASE ps.safety_state WHEN 'CRITICAL' THEN 0 WHEN 'BREACH' THEN 1 WHEN 'APPROACHING' THEN 2 ELSE 3 END,
       u.name`,
    [caregiverId],
  );
  return result.rows;
}

export async function getMyCaregivers(patientId: string) {
  const result = await pool.query(
    `SELECT u.id, u.name, u.photo_url, pr.id as relationship_id,
            pr.relationship_type, pr.status, pr.confirmed_at
     FROM patient_relationships pr
     JOIN users u ON u.id = pr.related_user_id
     WHERE pr.patient_user_id = $1 AND pr.relationship_type = 'CAREGIVER' AND pr.status = 'CONFIRMED'
     ORDER BY pr.confirmed_at`,
    [patientId],
  );
  return result.rows;
}

export async function getMyFamily(userId: string, role: string) {
  let patientId = userId;
  // If FAMILY, find their linked patient
  if (role === 'FAMILY') {
    const r = await pool.query(
      `SELECT patient_user_id FROM patient_relationships WHERE related_user_id = $1 AND status = 'CONFIRMED' LIMIT 1`,
      [userId],
    );
    if (!r.rows[0]) return [];
    patientId = r.rows[0].patient_user_id;
  }

  const result = await pool.query(
    `SELECT u.id, u.name, u.photo_url, pr.relationship_type, pr.status, pr.confirmed_at
     FROM patient_relationships pr
     JOIN users u ON u.id = pr.related_user_id
     WHERE pr.patient_user_id = $1 AND pr.status = 'CONFIRMED'
       AND pr.relationship_type IN ('FAMILY_CLOSE','FAMILY_EXTENDED','GUARDIAN')
     ORDER BY pr.relationship_type, u.name`,
    [patientId],
  );
  return result.rows;
}

export async function updateRelationshipStatus(
  relId: string,
  userId: string,
  status: string,
) {
  const allowedTransitions = ['CONFIRMED', 'SUSPENDED', 'ENDED'];
  if (!allowedTransitions.includes(status)) {
    throw new AppError('VALIDATION_ERROR', `Status must be one of: ${allowedTransitions.join(', ')}`, 422);
  }

  const extra = status === 'CONFIRMED' ? ', confirmed_at = NOW()' : status === 'ENDED' ? ', ended_at = NOW()' : '';
  const result = await pool.query(
    `UPDATE patient_relationships
     SET status = $1${extra}
     WHERE id = $2 AND (patient_user_id = $3 OR related_user_id = $3)
     RETURNING *`,
    [status, relId, userId],
  );
  if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Relationship not found', 404);
  return result.rows[0];
}

export async function deleteRelationship(relId: string, userId: string) {
  const result = await pool.query(
    `DELETE FROM patient_relationships
     WHERE id = $1 AND (patient_user_id = $2 OR related_user_id = $2)
     RETURNING id`,
    [relId, userId],
  );
  if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Relationship not found', 404);
}

// ─── Caregiver Search & Linkage Operations ───────────────────────────────────

export async function getConfirmedCaregiverForPatient(patientId: string) {
  const result = await pool.query(
    `SELECT 
       u.id, 
       u.name, 
       u.phone,
       u.city,
       u.photo_url,
       c.bio,
       c.years_of_experience,
       c.specializations,
       c.languages_spoken,
       c.availability_types,
       c.service_radius_km,
       c.max_patients,
       c.hourly_rate_inr,
       c.daily_rate_inr,
       c.rating,
       c.rating_count,
       pr.id as relationship_id,
       pr.status
     FROM patient_relationships pr
     JOIN users u ON u.id = pr.related_user_id
     JOIN caregiver_profiles c ON c.user_id = pr.related_user_id
     WHERE pr.patient_user_id = $1 
       AND pr.relationship_type = 'CAREGIVER' 
       AND pr.status = 'CONFIRMED'
     LIMIT 1`,
    [patientId],
  );
  return result.rows[0] || null;
}

export async function confirmCaregiverRelationship(patientId: string, caregiverId: string) {
  const result = await pool.query(
    `INSERT INTO patient_relationships (patient_user_id, related_user_id, relationship_type, status, confirmed_at)
     VALUES ($1, $2, 'CAREGIVER', 'CONFIRMED', NOW())
     ON CONFLICT (patient_user_id, related_user_id) 
     DO UPDATE SET status = 'CONFIRMED', confirmed_at = NOW(), ended_at = NULL
     RETURNING *`,
    [patientId, caregiverId],
  );
  return result.rows[0];
}

export async function removeCaregiverRelationship(patientId: string) {
  const result = await pool.query(
    `DELETE FROM patient_relationships
     WHERE patient_user_id = $1 AND relationship_type = 'CAREGIVER'
     RETURNING id`,
    [patientId],
  );
  if (!result.rows[0]) throw new AppError('NOT_FOUND', 'No active caregiver relationship found', 404);
}

export async function getPendingRequestsForCaregiver(caregiverId: string) {
  const result = await pool.query(
    `SELECT 
       u.phone as patient_phone, 
       u.name as patient_name, 
       pr.created_at as confirmed_at
     FROM patient_relationships pr
     JOIN users u ON u.id = pr.patient_user_id
     WHERE pr.related_user_id = $1 AND pr.status = 'PENDING'
     ORDER BY pr.created_at DESC`,
    [caregiverId],
  );
  return result.rows;
}

export async function respondToCaregiverRequest(caregiverId: string, patientPhone: string, action: 'confirmed' | 'rejected') {
  // Resolve patient user ID from phone
  const ptResult = await pool.query(
    `SELECT id FROM users WHERE phone = $1 AND role = 'PATIENT' AND is_active = TRUE`,
    [patientPhone],
  );
  if (!ptResult.rows[0]) throw new AppError('NOT_FOUND', 'No patient found with this phone number', 404);
  const patientId = ptResult.rows[0].id;

  if (action === 'rejected') {
    await pool.query(
      `DELETE FROM patient_relationships 
       WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER'`,
      [patientId, caregiverId],
    );
  } else {
    await pool.query(
      `UPDATE patient_relationships
       SET status = 'CONFIRMED', confirmed_at = NOW()
       WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER'`,
      [patientId, caregiverId],
    );
  }
}

export async function searchCaregivers(patientId: string, query: string) {
  // 1. Get patient's city
  const patientRes = await pool.query(`SELECT city FROM users WHERE id = $1`, [patientId]);
  const patientCity = patientRes.rows[0]?.city || '';

  if (!patientCity) {
    // If patient has no city set, return empty results (since location filter is strict)
    return [];
  }

  // 2. Query discoverable caregivers in the same city
  const sqlQuery = `%${query}%`;
  const result = await pool.query(
    `SELECT 
       u.id, 
       u.name, 
       u.phone,
       u.city,
       u.photo_url,
       c.bio,
       c.years_of_experience,
       c.specializations,
       c.languages_spoken,
       c.availability_types,
       c.service_radius_km,
       c.max_patients,
       c.hourly_rate_inr,
       c.daily_rate_inr,
       c.rating,
       c.rating_count
     FROM users u
     JOIN caregiver_profiles c ON u.id = c.user_id
     WHERE u.role = 'CAREGIVER'
       AND c.is_discoverable = TRUE
       AND u.deleted_at IS NULL
       AND LOWER(u.city) = LOWER($1)
       AND (
         $2 = '%%' OR
         u.name ILIKE $2 OR
         c.bio ILIKE $2 OR
         array_to_string(c.specializations, ', ') ILIKE $2 OR
         array_to_string(c.languages_spoken, ', ') ILIKE $2
       )
     ORDER BY COALESCE(c.rating, 5.0) DESC, u.name ASC`,
    [patientCity, sqlQuery],
  );
  return result.rows;
}

