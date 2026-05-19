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
