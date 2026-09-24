import pool from '../../db/config';
import { AppError } from '../../shared/errors/AppError';
import { generateToken } from '../../shared/utils/helpers';
import * as discoveryService from '../discovery/discovery.service';

// ─── Caregiver Request ────────────────────────────────────────────────────────

export async function sendCaregiverRequest(patientId: string, caregiverPhone: string) {
  let cleanPhone = caregiverPhone.replace(/[^\d+]/g, '');
  if (!cleanPhone.startsWith('+') && cleanPhone.length === 10) {
    cleanPhone = '+91' + cleanPhone;
  }
  // Resolve caregiver by phone
  const cgResult = await pool.query(
    `SELECT id FROM users 
     WHERE (phone = $1 OR regexp_replace(phone, '[^\\d+]', '', 'g') = $1)
       AND role = 'CAREGIVER' 
       AND is_active = TRUE`,
    [cleanPhone],
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

  const patientRow = await pool.query('SELECT name FROM users WHERE id = $1', [patientId]);
  const patientName = patientRow.rows[0]?.name || 'A patient';

  try {
    const { createInAppNotification } = await import('../notifications/notification.service');
    await createInAppNotification({
      userId: caregiverId,
      notificationType: 'CAREGIVER_REQUEST_RECEIVED',
      priority: 'HIGH',
      title: 'New Caregiver Request',
      body: `${patientName} has requested you as their caregiver.`,
      payload: { patientId, action: 'caregiver_request_received' }
    });
  } catch (err) {
    console.error('[relationships.service] Failed to create in-app notification:', err);
  }

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
    `SELECT u.id, u.name, u.photo_url, u.city, u.preferred_language, u.date_of_birth, u.phone,
            pr.id as relationship_id, pr.relationship_type, pr.confirmed_at, pr.status as relationship_status,
            ps.location_state, ps.safety_state, ps.routine_state, ps.engagement_state,
            ps.last_ping_at, ps.sos_active, ps.computed_at,
            gz.label AS current_zone_name,
            COALESCE(ps.battery_pct, lp.battery_pct) AS battery_pct,
            ps.network_status,
            lp.accuracy_m, lp.speed_kmh
     FROM patient_relationships pr
     JOIN users u ON u.id = pr.patient_user_id
     LEFT JOIN patient_states ps ON ps.patient_id = pr.patient_user_id
     LEFT JOIN geofence_zones gz ON gz.id = ps.last_known_zone_id
     LEFT JOIN LATERAL (
       SELECT battery_pct, accuracy_m, speed_kmh FROM location_pings
       WHERE patient_id = pr.patient_user_id
       ORDER BY recorded_at DESC LIMIT 1
     ) lp ON TRUE
     WHERE pr.related_user_id = $1 AND pr.status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')
     ORDER BY
       CASE ps.safety_state WHEN 'CRITICAL' THEN 0 WHEN 'BREACH' THEN 1 WHEN 'APPROACHING' THEN 2 ELSE 3 END,
       u.name`,
    [caregiverId],
  );
  return result.rows;
}

export async function getMyCaregivers(patientId: string) {
  const result = await pool.query(
    `SELECT u.id, u.name, u.photo_url, u.city,
            c.bio, c.years_of_experience, c.specializations, c.languages_spoken,
            c.availability_types, c.hourly_rate as hourly_rate_inr, c.daily_rate as daily_rate_inr,
            c.professional_role, c.rating, c.rating_count,
            pr.id as relationship_id, pr.relationship_type, pr.status, pr.confirmed_at
     FROM patient_relationships pr
     JOIN users u ON u.id = pr.related_user_id
     LEFT JOIN caregiver_profiles c ON c.user_id = pr.related_user_id
     WHERE pr.patient_user_id = $1 AND pr.relationship_type = 'CAREGIVER' 
       AND pr.status IN ('CONFIRMED', 'PENDING', 'REQUESTED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')
     ORDER BY pr.confirmed_at DESC NULLS LAST, pr.created_at DESC`,
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
       c.hourly_rate AS hourly_rate_inr,
       c.daily_rate AS daily_rate_inr,
       c.rating,
       c.rating_count,
       pr.id as relationship_id,
       pr.status
     FROM patient_relationships pr
     JOIN users u ON u.id = pr.related_user_id
     JOIN caregiver_profiles c ON c.user_id = pr.related_user_id
     WHERE pr.patient_user_id = $1 
       AND pr.relationship_type = 'CAREGIVER' 
       AND pr.status IN ('CONFIRMED', 'PENDING', 'REQUESTED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')
     LIMIT 1`,
    [patientId],
  );
  return result.rows[0] || null;
}

export async function confirmCaregiverRelationship(patientId: string, caregiverId: string) {
  const result = await pool.query(
    `INSERT INTO patient_relationships (patient_user_id, related_user_id, relationship_type, status, confirmed_at)
     VALUES ($1, $2, 'CAREGIVER', 'REQUESTED', NULL)
     ON CONFLICT (patient_user_id, related_user_id, relationship_type) 
     DO UPDATE SET status = 'REQUESTED', confirmed_at = NULL, ended_at = NULL
     RETURNING *`,
    [patientId, caregiverId],
  );

  const patientRow = await pool.query('SELECT name FROM users WHERE id = $1', [patientId]);
  const patientName = patientRow.rows[0]?.name || 'A patient';

  try {
    const { createInAppNotification } = await import('../notifications/notification.service');
    await createInAppNotification({
      userId: caregiverId,
      notificationType: 'CAREGIVER_REQUEST_RECEIVED',
      priority: 'HIGH',
      title: 'New Caregiver Request',
      body: `${patientName} has requested you as their caregiver.`,
      payload: { patientId, action: 'caregiver_request_received' }
    });
  } catch (err) {
    console.error('[relationships.service] Failed to create in-app notification:', err);
  }

  return result.rows[0];
}

export async function removeCaregiverRelationship(patientId: string) {
  const result = await pool.query(
    `DELETE FROM patient_relationships
     WHERE patient_user_id = $1 AND relationship_type = 'CAREGIVER'
     RETURNING related_user_id`,
    [patientId],
  );
  if (!result.rows[0]) throw new AppError('NOT_FOUND', 'No active caregiver relationship found', 404);
  return result.rows[0].related_user_id;
}

export async function getPendingRequestsForCaregiver(caregiverId: string) {
  const result = await pool.query(
    `SELECT 
       u.phone as patient_phone, 
       u.name as patient_name, 
       pr.created_at as confirmed_at
     FROM patient_relationships pr
     JOIN users u ON u.id = pr.patient_user_id
     WHERE pr.related_user_id = $1 AND pr.status IN ('PENDING', 'REQUESTED')
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

  const cgRow = await pool.query('SELECT name FROM users WHERE id = $1', [caregiverId]);
  const caregiverName = cgRow.rows[0]?.name || 'A caregiver';

  try {
    const { createInAppNotification } = await import('../notifications/notification.service');

    if (action === 'rejected') {
      await pool.query(
        `DELETE FROM patient_relationships 
         WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER'`,
        [patientId, caregiverId],
      );

      await createInAppNotification({
        userId: patientId,
        notificationType: 'CAREGIVER_REQUEST_REJECTED',
        priority: 'MEDIUM',
        title: 'Caregiver Request Declined',
        body: `${caregiverName} has declined your caregiver request.`,
        payload: { caregiverId, action: 'caregiver_request_declined' }
      });
    } else {
      await pool.query(
        `UPDATE patient_relationships
         SET status = 'ACCEPTED', confirmed_at = NOW()
         WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER'`,
        [patientId, caregiverId],
      );

      await createInAppNotification({
        userId: patientId,
        notificationType: 'CAREGIVER_REQUEST_ACCEPTED',
        priority: 'HIGH',
        title: 'Caregiver Request Accepted',
        body: `${caregiverName} has accepted your caregiver request.`,
        payload: { caregiverId, action: 'caregiver_request_accepted' }
      });
    }
  } catch (err) {
    console.error('[relationships.service] Failed to create in-app notification in respondToCaregiverRequest:', err);
  }

  return { patientId };
}

export async function completeMeeting(caregiverId: string, patientId: string) {
  const result = await pool.query(
    `UPDATE patient_relationships
     SET status = 'MEETING_COMPLETED'
     WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER' AND status = 'ACCEPTED'
     RETURNING *`,
    [patientId, caregiverId],
  );
  if (!result.rows[0]) {
    throw new AppError('VALIDATION_ERROR', 'Relationship must be in ACCEPTED status to mark meeting as completed', 400);
  }
  return result.rows[0];
}

export async function searchCaregivers(patientId: string, query: string) {
  // Fetch user object to pass to canonical discoveryService
  const userRes = await pool.query(`SELECT * FROM users WHERE id = $1`, [patientId]);
  const user = userRes.rows[0];
  if (!user) return [];

  const response = await discoveryService.searchCaregivers(
    { query, limit: 50, page: 1, sortBy: 'newest' },
    user,
  );

  // Return mapped array preserving legacy property names where callers expect them
  return response.caregivers.map((c) => ({
    id: c.caregiverId,
    name: c.name,
    photo_url: c.photoUrl,
    city: c.serviceCity,
    bio: c.bioSummary,
    years_of_experience: c.yearsOfExperience,
    specializations: c.specializations,
    languages_spoken: c.languagesSpoken,
    availability_types: c.availabilityTypes,
    service_radius_km: c.serviceRadiusKm,
    hourly_rate_inr: c.hourlyRateInr,
    daily_rate_inr: c.dailyRateInr,
    rating: c.rating,
    rating_count: c.ratingCount,
    professional_role: c.professionalRole,
    // Note: Phone and email are strictly omitted for privacy
  }));
}


// ─── Care Circle — Family Invite & Approval ───────────────────────────────────

export async function generateInviteCode(
  caregiverId: string,
  patientId: string,
  relationshipType: 'FAMILY_CLOSE' | 'FAMILY_EXTENDED' | 'GUARDIAN' = 'FAMILY_CLOSE',
) {
  const check = await pool.query(
    `SELECT id FROM patient_relationships WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER' 
      AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`,
    [patientId, caregiverId],
  );
  if (!check.rows[0]) throw new AppError('RELATIONSHIP_REQUIRED', 'You must be the confirmed caregiver to generate invite codes', 403);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const result = await pool.query(
    `INSERT INTO invite_codes (code, patient_id, created_by, relationship_type, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING code, expires_at`,
    [code, patientId, caregiverId, relationshipType, expiresAt],
  );
  return result.rows[0];
}

export async function redeemInviteCode(code: string, familyUserId: string) {
  const inv = await pool.query(`SELECT * FROM invite_codes WHERE code = $1 AND used_at IS NULL AND expires_at > NOW()`, [code.toUpperCase()]);
  if (!inv.rows[0]) throw new AppError('NOT_FOUND', 'Invalid or expired invite code', 404);
  const invite = inv.rows[0];

  // Prevent duplicate links
  const existing = await pool.query(
    `SELECT id, status FROM patient_relationships
     WHERE patient_user_id = $1 AND related_user_id = $2`,
    [invite.patient_id, familyUserId]
  );
  if (existing.rows[0]) {
    const s = existing.rows[0].status;
    if (s === 'CONFIRMED') throw new AppError('CONFLICT', 'Already linked to this patient', 409);
    if (s === 'PENDING')   throw new AppError('CONFLICT', 'Access request already pending', 409);
  }

  const rel = await pool.query(
    `INSERT INTO patient_relationships (patient_user_id, related_user_id, relationship_type, status, invited_by)
     VALUES ($1, $2, $3, 'PENDING', $4)
     ON CONFLICT (patient_user_id, related_user_id, relationship_type)
     DO UPDATE SET status = 'PENDING', confirmed_at = NULL, approved_by = NULL
     RETURNING *`,
    [invite.patient_id, familyUserId, invite.relationship_type, invite.created_by],
  );
  await pool.query(`UPDATE invite_codes SET used_at = NOW(), used_by = $1 WHERE id = $2`, [familyUserId, invite.id]);
  await pool.query(`INSERT INTO family_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [familyUserId]);

  // Alert caregivers of family join request
  try {
    const userRes = await pool.query(`SELECT name FROM users WHERE id = $1`, [familyUserId]);
    const ptRes = await pool.query(`SELECT name FROM users WHERE id = $1`, [invite.patient_id]);
    const familyName = userRes.rows[0]?.name ?? 'A family member';
    const patientName = ptRes.rows[0]?.name ?? 'patient';
    
    // Create notifications for the caregiver(s) of the patient
    const caregivers = await pool.query(
      `SELECT related_user_id FROM patient_relationships 
       WHERE patient_user_id = $1 AND relationship_type = 'CAREGIVER' AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`,
      [invite.patient_id]
    );
    for (const cg of caregivers.rows) {
      const { createInAppNotification } = await import('../notifications/notification.service');
      await createInAppNotification({
        userId: cg.related_user_id,
        title: 'Family Join Request',
        body: `${familyName} has requested to join ${patientName}'s Care Circle using invite code ${code.toUpperCase()}.`,
        payload: { route: 'CaregiverTriageScreen', params: {} },
      });
    }
  } catch (err) {
    console.error('Failed to notify caregiver of invite code join:', err);
  }

  return rel.rows[0];
}

export async function getInviteCodesForPatient(caregiverId: string, patientId: string) {
  // Check caregiver access
  const check = await pool.query(
    `SELECT id FROM patient_relationships WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER'
      AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`,
    [patientId, caregiverId],
  );
  if (!check.rows[0]) throw new AppError('RELATIONSHIP_REQUIRED', 'Access denied to this patient', 403);

  const result = await pool.query(
    `SELECT * FROM invite_codes WHERE patient_id = $1 ORDER BY created_at DESC`,
    [patientId]
  );
  return result.rows;
}

export async function revokeInviteCode(caregiverId: string, code: string) {
  const inv = await pool.query(`SELECT * FROM invite_codes WHERE code = $1`, [code.toUpperCase()]);
  if (!inv.rows[0]) throw new AppError('NOT_FOUND', 'Invite code not found', 404);
  const invite = inv.rows[0];

  // Check caregiver access
  const check = await pool.query(
    `SELECT id FROM patient_relationships WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER'
      AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`,
    [invite.patient_id, caregiverId],
  );
  if (!check.rows[0]) throw new AppError('RELATIONSHIP_REQUIRED', 'Access denied to this patient', 403);

  await pool.query(
    `UPDATE invite_codes SET expires_at = NOW() WHERE code = $1`,
    [code.toUpperCase()]
  );
}

export async function requestAccessByPhone(familyUserId: string, patientPhone: string) {
  let cleanPhone = patientPhone.replace(/[^\d+]/g, '');
  if (!cleanPhone.startsWith('+') && cleanPhone.length === 10) {
    cleanPhone = '+91' + cleanPhone;
  }
  const ptRes = await pool.query(
    `SELECT id FROM users 
     WHERE (phone = $1 OR regexp_replace(phone, '[^\\d+]', '', 'g') = $1)
       AND role = 'PATIENT' 
       AND is_active = TRUE`,
    [cleanPhone],
  );
  if (!ptRes.rows[0]) throw new AppError('NOT_FOUND', 'No patient found with this phone number', 404);
  const patientId = ptRes.rows[0].id;
  const existing = await pool.query(`SELECT id, status FROM patient_relationships WHERE patient_user_id = $1 AND related_user_id = $2`, [patientId, familyUserId]);
  if (existing.rows[0]) {
    const s = existing.rows[0].status;
    if (s === 'CONFIRMED') throw new AppError('CONFLICT', 'Already linked to this patient', 409);
    if (s === 'PENDING')   throw new AppError('CONFLICT', 'Access request already pending', 409);
  }
  const result = await pool.query(
    `INSERT INTO patient_relationships (patient_user_id, related_user_id, relationship_type, status) VALUES ($1, $2, 'FAMILY_CLOSE', 'PENDING') ON CONFLICT (patient_user_id, related_user_id, relationship_type) DO UPDATE SET status = 'PENDING' RETURNING *`,
    [patientId, familyUserId],
  );
  await pool.query(`INSERT INTO family_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [familyUserId]);

  try {
    const cgRes = await pool.query(
      `SELECT related_user_id FROM patient_relationships 
       WHERE patient_user_id = $1 AND relationship_type = 'CAREGIVER' AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`,
      [patientId]
    );

    const familyRow = await pool.query('SELECT name FROM users WHERE id = $1', [familyUserId]);
    const familyName = familyRow.rows[0]?.name || 'A family member';

    const patientRow = await pool.query('SELECT name FROM users WHERE id = $1', [patientId]);
    const patientName = patientRow.rows[0]?.name || 'your patient';

    const { createInAppNotification } = await import('../notifications/notification.service');
    for (const cgRow of cgRes.rows) {
      await createInAppNotification({
        userId: cgRow.related_user_id,
        notificationType: 'FAMILY_REQUEST_RECEIVED',
        priority: 'HIGH',
        title: 'Family Access Request',
        body: `${familyName} has requested access to join ${patientName}'s care circle.`,
        payload: { patientId, familyUserId, action: 'family_request_received' }
      });
    }
  } catch (err) {
    console.error('[relationships.service] Failed to create in-app notification in requestAccessByPhone:', err);
  }

  return result.rows[0];
}

export async function getFamilyPatient(familyUserId: string) {
  const result = await pool.query(
    `SELECT u.id, u.name, u.photo_url, u.date_of_birth, u.phone, pr.relationship_type, pr.status, pr.confirmed_at, ps.location_state, ps.safety_state, ps.routine_state, ps.last_ping_at, ps.sos_active, ps.battery_pct, ps.network_status, ps.computed_at, ps.last_known_lat, ps.last_known_lng, gz.label AS current_zone_name, fp.relation_label, fp.notify_on_breach, fp.notify_on_missed_critical, fp.notify_on_sos FROM patient_relationships pr JOIN users u ON u.id = pr.patient_user_id LEFT JOIN patient_states ps ON ps.patient_id = pr.patient_user_id LEFT JOIN geofence_zones gz ON gz.id = ps.last_known_zone_id LEFT JOIN family_profiles fp ON fp.user_id = pr.related_user_id WHERE pr.related_user_id = $1 AND pr.status = 'CONFIRMED' LIMIT 1`,
    [familyUserId],
  );
  return result.rows[0] ?? null;
}

export async function getCareCircle(patientId: string) {
  const result = await pool.query(
    `SELECT 
      u.id, 
      u.name, 
      u.photo_url, 
      pr.relationship_type, 
      pr.status, 
      pr.confirmed_at, 
      pr.approved_by, 
      fp.relation_label,
      cs.check_in_lat,
      cs.check_in_lng,
      cs.actual_start AS last_location_update
     FROM patient_relationships pr 
     JOIN users u ON u.id = pr.related_user_id 
     LEFT JOIN family_profiles fp ON fp.user_id = pr.related_user_id 
     LEFT JOIN LATERAL (
       SELECT check_in_lat, check_in_lng, actual_start 
       FROM caregiver_shifts 
       WHERE caregiver_id = u.id AND check_in_lat IS NOT NULL 
       ORDER BY actual_start DESC LIMIT 1
     ) cs ON TRUE
     WHERE pr.patient_user_id = $1 AND pr.status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE') 
     ORDER BY CASE pr.relationship_type WHEN 'CAREGIVER' THEN 0 WHEN 'GUARDIAN' THEN 1 WHEN 'FAMILY_CLOSE' THEN 2 WHEN 'FAMILY_EXTENDED' THEN 3 ELSE 4 END, u.name`,
    [patientId],
  );
  return result.rows;
}

export async function getPendingFamilyRequests(caregiverId: string) {
  const result = await pool.query(
    `SELECT 
       pr.id, 
       pr.patient_user_id, 
       pr.related_user_id, 
       pr.relationship_type, 
       pr.created_at, 
       u_family.name as family_name, 
       u_family.photo_url as family_photo, 
       u_family.city as family_city,
       u_family.date_of_birth as family_dob,
       fp.relation_label,
       fp.proximity,
       fp.involvement_interests,
       u_patient.name as patient_name 
     FROM patient_relationships pr 
     JOIN users u_family ON u_family.id = pr.related_user_id 
     JOIN users u_patient ON u_patient.id = pr.patient_user_id 
     LEFT JOIN family_profiles fp ON fp.user_id = pr.related_user_id
     WHERE pr.status = 'PENDING' 
       AND pr.relationship_type IN ('FAMILY_CLOSE','FAMILY_EXTENDED','GUARDIAN') 
       AND pr.patient_user_id IN (
         SELECT patient_user_id FROM patient_relationships 
         WHERE related_user_id = $1 
           AND relationship_type = 'CAREGIVER' 
           AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')
       ) 
     ORDER BY pr.created_at DESC`,
    [caregiverId],
  );
  return result.rows;
}

export async function respondToFamilyRequest(caregiverId: string, requestId: string, action: 'approve' | 'reject') {
  const rel = await pool.query(`SELECT * FROM patient_relationships WHERE id = $1 AND status = 'PENDING'`, [requestId]);
  if (!rel.rows[0]) throw new AppError('NOT_FOUND', 'Pending request not found', 404);
  const request = rel.rows[0];
  const cgCheck = await pool.query(`SELECT id FROM patient_relationships WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER' AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`, [request.patient_user_id, caregiverId]);
  if (!cgCheck.rows[0]) throw new AppError('ROLE_NOT_PERMITTED', "Only the patient's caregiver can approve requests", 403);

  const patientRow = await pool.query('SELECT name FROM users WHERE id = $1', [request.patient_user_id]);
  const patientName = patientRow.rows[0]?.name || 'a patient';

  try {
    const { createInAppNotification } = await import('../notifications/notification.service');

    if (action === 'reject') {
      await pool.query(`DELETE FROM patient_relationships WHERE id = $1`, [requestId]);

      await createInAppNotification({
        userId: request.related_user_id,
        notificationType: 'FAMILY_REQUEST_REJECTED',
        priority: 'MEDIUM',
        title: 'Care Circle Request Declined',
        body: `Your request to join ${patientName}'s care circle has been declined.`,
        payload: { patientId: request.patient_user_id, action: 'family_request_declined' }
      });

      return { status: 'rejected', patient_user_id: request.patient_user_id, related_user_id: request.related_user_id };
    }

    const updated = await pool.query(`UPDATE patient_relationships SET status = 'CONFIRMED', confirmed_at = NOW(), approved_by = $1 WHERE id = $2 RETURNING *`, [caregiverId, requestId]);
    await pool.query(`INSERT INTO family_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [request.related_user_id]);

    await createInAppNotification({
      userId: request.related_user_id,
      notificationType: 'FAMILY_REQUEST_APPROVED',
      priority: 'HIGH',
      title: 'Care Circle Request Approved',
      body: `Your request to join ${patientName}'s care circle has been approved.`,
      payload: { patientId: request.patient_user_id, action: 'family_request_approved' }
    });

    return { ...updated.rows[0], status: 'CONFIRMED' };
  } catch (err) {
    console.error('[relationships.service] Failed to create in-app notification in respondToFamilyRequest:', err);
    if (action === 'reject') {
      await pool.query(`DELETE FROM patient_relationships WHERE id = $1`, [requestId]);
      return { status: 'rejected', patient_user_id: request.patient_user_id, related_user_id: request.related_user_id };
    }
    const updated = await pool.query(`UPDATE patient_relationships SET status = 'CONFIRMED', confirmed_at = NOW(), approved_by = $1 WHERE id = $2 RETURNING *`, [caregiverId, requestId]);
    await pool.query(`INSERT INTO family_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [request.related_user_id]);
    return { ...updated.rows[0], status: 'CONFIRMED' };
  }
}

export async function deleteFamilyRelationshipByPatient(patientId: string, familyUserId: string) {
  const result = await pool.query(
    `DELETE FROM patient_relationships
     WHERE patient_user_id = $1 AND related_user_id = $2
       AND relationship_type IN ('FAMILY_CLOSE', 'FAMILY_EXTENDED', 'GUARDIAN')
     RETURNING id`,
    [patientId, familyUserId],
  );
  if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Relationship not found', 404);
}

export async function getCareCircleForCaregiver(caregiverId: string, patientId: string) {
  const verifyRel = await pool.query(
    `SELECT 1 FROM patient_relationships 
     WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER' 
       AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`,
    [patientId, caregiverId]
  );
  if (verifyRel.rowCount === 0) {
    throw new AppError('FORBIDDEN', 'Access denied to this patient', 403);
  }
  return getCareCircle(patientId);
}

export async function getPatientRelationship(caregiverId: string, patientId: string) {
  const result = await pool.query(
    `SELECT * FROM patient_relationships
     WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER'`,
    [patientId, caregiverId],
  );
  return result.rows[0] || null;
}


