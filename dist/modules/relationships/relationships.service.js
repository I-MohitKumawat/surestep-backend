"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendCaregiverRequest = sendCaregiverRequest;
exports.createFamilyInvite = createFamilyInvite;
exports.acceptInvite = acceptInvite;
exports.getMyPatients = getMyPatients;
exports.getMyCaregivers = getMyCaregivers;
exports.getMyFamily = getMyFamily;
exports.updateRelationshipStatus = updateRelationshipStatus;
exports.deleteRelationship = deleteRelationship;
exports.getConfirmedCaregiverForPatient = getConfirmedCaregiverForPatient;
exports.confirmCaregiverRelationship = confirmCaregiverRelationship;
exports.removeCaregiverRelationship = removeCaregiverRelationship;
exports.getPendingRequestsForCaregiver = getPendingRequestsForCaregiver;
exports.respondToCaregiverRequest = respondToCaregiverRequest;
exports.completeMeeting = completeMeeting;
exports.searchCaregivers = searchCaregivers;
exports.generateInviteCode = generateInviteCode;
exports.redeemInviteCode = redeemInviteCode;
exports.getInviteCodesForPatient = getInviteCodesForPatient;
exports.revokeInviteCode = revokeInviteCode;
exports.requestAccessByPhone = requestAccessByPhone;
exports.getFamilyPatient = getFamilyPatient;
exports.getCareCircle = getCareCircle;
exports.getPendingFamilyRequests = getPendingFamilyRequests;
exports.respondToFamilyRequest = respondToFamilyRequest;
exports.deleteFamilyRelationshipByPatient = deleteFamilyRelationshipByPatient;
exports.getCareCircleForCaregiver = getCareCircleForCaregiver;
exports.getPatientRelationship = getPatientRelationship;
const config_1 = __importDefault(require("../../db/config"));
const AppError_1 = require("../../shared/errors/AppError");
const helpers_1 = require("../../shared/utils/helpers");
const discoveryService = __importStar(require("../discovery/discovery.service"));
// ─── Caregiver Request ────────────────────────────────────────────────────────
async function sendCaregiverRequest(patientId, caregiverPhone) {
    let cleanPhone = caregiverPhone.replace(/[^\d+]/g, '');
    if (!cleanPhone.startsWith('+') && cleanPhone.length === 10) {
        cleanPhone = '+91' + cleanPhone;
    }
    // Resolve caregiver by phone
    const cgResult = await config_1.default.query(`SELECT id FROM users 
     WHERE (phone = $1 OR regexp_replace(phone, '[^\\d+]', '', 'g') = $1)
       AND role = 'CAREGIVER' 
       AND is_active = TRUE`, [cleanPhone]);
    if (!cgResult.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'No active caregiver found with this phone number', 404);
    const caregiverId = cgResult.rows[0].id;
    // Check for existing active link
    const existing = await config_1.default.query(`SELECT id, status FROM patient_relationships
     WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER'`, [patientId, caregiverId]);
    if (existing.rows[0]) {
        const s = existing.rows[0].status;
        if (s === 'CONFIRMED')
            throw new AppError_1.AppError('CONFLICT', 'Already linked with this caregiver', 409);
        if (s === 'PENDING')
            throw new AppError_1.AppError('CONFLICT', 'Request already pending', 409);
    }
    const result = await config_1.default.query(`INSERT INTO patient_relationships (patient_user_id, related_user_id, relationship_type, status)
     VALUES ($1, $2, 'CAREGIVER', 'PENDING')
     ON CONFLICT (patient_user_id, related_user_id, relationship_type) DO UPDATE
       SET status = 'PENDING'
     RETURNING *`, [patientId, caregiverId]);
    const patientRow = await config_1.default.query('SELECT name FROM users WHERE id = $1', [patientId]);
    const patientName = patientRow.rows[0]?.name || 'A patient';
    try {
        const { createInAppNotification } = await Promise.resolve().then(() => __importStar(require('../notifications/notification.service')));
        await createInAppNotification({
            userId: caregiverId,
            notificationType: 'CAREGIVER_REQUEST_RECEIVED',
            priority: 'HIGH',
            title: 'New Caregiver Request',
            body: `${patientName} has requested you as their caregiver.`,
            payload: { patientId, action: 'caregiver_request_received' }
        });
    }
    catch (err) {
        console.error('[relationships.service] Failed to create in-app notification:', err);
    }
    return result.rows[0];
}
// ─── Family Invite ─────────────────────────────────────────────────────────────
async function createFamilyInvite(guardianId, patientId, data) {
    // Verify guardian has GUARDIAN or CAREGIVER relationship with patient
    const guardianCheck = await config_1.default.query(`SELECT id FROM patient_relationships
     WHERE patient_user_id = $1 AND related_user_id = $2
       AND status = 'CONFIRMED'
       AND relationship_type IN ('GUARDIAN','CAREGIVER')`, [patientId, guardianId]);
    if (!guardianCheck.rows[0])
        throw new AppError_1.AppError('RELATIONSHIP_REQUIRED', 'Only guardians or caregivers can invite family', 403);
    const token = (0, helpers_1.generateToken)();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const result = await config_1.default.query(`INSERT INTO patient_relationships
       (patient_user_id, related_user_id, relationship_type, status, invited_by, invite_token, invite_expires_at, notes)
     VALUES ($1, $1, $2, 'PENDING', $3, $4, $5, $6)
     RETURNING *`, 
    // Note: related_user_id = patient for now; gets updated on accept
    [patientId, data.relationship_type, guardianId, token, expiresAt, data.notes ?? null]);
    return { invite_token: token, expires_at: expiresAt, relationship: result.rows[0] };
}
// ─── Accept Invite ─────────────────────────────────────────────────────────────
async function acceptInvite(token, userId) {
    const result = await config_1.default.query(`SELECT * FROM patient_relationships
     WHERE invite_token = $1 AND status = 'PENDING' AND invite_expires_at > NOW()`, [token]);
    const rel = result.rows[0];
    if (!rel)
        throw new AppError_1.AppError('NOT_FOUND', 'Invite not found or expired', 404);
    const updated = await config_1.default.query(`UPDATE patient_relationships
     SET related_user_id = $1, status = 'CONFIRMED', confirmed_at = NOW(), invite_token = NULL
     WHERE id = $2
     RETURNING *`, [userId, rel.id]);
    return updated.rows[0];
}
// ─── Queries ──────────────────────────────────────────────────────────────────
async function getMyPatients(caregiverId) {
    const result = await config_1.default.query(`SELECT u.id, u.name, u.photo_url, u.city, u.preferred_language, u.date_of_birth, u.phone,
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
       u.name`, [caregiverId]);
    return result.rows;
}
async function getMyCaregivers(patientId) {
    const result = await config_1.default.query(`SELECT u.id, u.name, u.photo_url, u.city,
            c.bio, c.years_of_experience, c.specializations, c.languages_spoken,
            c.availability_types, c.hourly_rate as hourly_rate_inr, c.daily_rate as daily_rate_inr,
            c.professional_role, c.rating, c.rating_count,
            pr.id as relationship_id, pr.relationship_type, pr.status, pr.confirmed_at
     FROM patient_relationships pr
     JOIN users u ON u.id = pr.related_user_id
     LEFT JOIN caregiver_profiles c ON c.user_id = pr.related_user_id
     WHERE pr.patient_user_id = $1 AND pr.relationship_type = 'CAREGIVER' 
       AND pr.status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')
     ORDER BY pr.confirmed_at DESC NULLS LAST, pr.created_at DESC`, [patientId]);
    return result.rows;
}
async function getMyFamily(userId, role) {
    let patientId = userId;
    // If FAMILY, find their linked patient
    if (role === 'FAMILY') {
        const r = await config_1.default.query(`SELECT patient_user_id FROM patient_relationships WHERE related_user_id = $1 AND status = 'CONFIRMED' LIMIT 1`, [userId]);
        if (!r.rows[0])
            return [];
        patientId = r.rows[0].patient_user_id;
    }
    const result = await config_1.default.query(`SELECT u.id, u.name, u.photo_url, pr.relationship_type, pr.status, pr.confirmed_at
     FROM patient_relationships pr
     JOIN users u ON u.id = pr.related_user_id
     WHERE pr.patient_user_id = $1 AND pr.status = 'CONFIRMED'
       AND pr.relationship_type IN ('FAMILY_CLOSE','FAMILY_EXTENDED','GUARDIAN')
     ORDER BY pr.relationship_type, u.name`, [patientId]);
    return result.rows;
}
async function updateRelationshipStatus(relId, userId, status) {
    const allowedTransitions = ['CONFIRMED', 'SUSPENDED', 'ENDED'];
    if (!allowedTransitions.includes(status)) {
        throw new AppError_1.AppError('VALIDATION_ERROR', `Status must be one of: ${allowedTransitions.join(', ')}`, 422);
    }
    const extra = status === 'CONFIRMED' ? ', confirmed_at = NOW()' : status === 'ENDED' ? ', ended_at = NOW()' : '';
    const result = await config_1.default.query(`UPDATE patient_relationships
     SET status = $1${extra}
     WHERE id = $2 AND (patient_user_id = $3 OR related_user_id = $3)
     RETURNING *`, [status, relId, userId]);
    if (!result.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Relationship not found', 404);
    return result.rows[0];
}
async function deleteRelationship(relId, userId) {
    const result = await config_1.default.query(`DELETE FROM patient_relationships
     WHERE id = $1 AND (patient_user_id = $2 OR related_user_id = $2)
     RETURNING id`, [relId, userId]);
    if (!result.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Relationship not found', 404);
}
// ─── Caregiver Search & Linkage Operations ───────────────────────────────────
async function getConfirmedCaregiverForPatient(patientId) {
    const result = await config_1.default.query(`SELECT 
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
       AND pr.status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')
     LIMIT 1`, [patientId]);
    return result.rows[0] || null;
}
async function confirmCaregiverRelationship(patientId, caregiverId) {
    const result = await config_1.default.query(`INSERT INTO patient_relationships (patient_user_id, related_user_id, relationship_type, status, confirmed_at)
     VALUES ($1, $2, 'CAREGIVER', 'REQUESTED', NULL)
     ON CONFLICT (patient_user_id, related_user_id, relationship_type) 
     DO UPDATE SET status = 'REQUESTED', confirmed_at = NULL, ended_at = NULL
     RETURNING *`, [patientId, caregiverId]);
    const patientRow = await config_1.default.query('SELECT name FROM users WHERE id = $1', [patientId]);
    const patientName = patientRow.rows[0]?.name || 'A patient';
    try {
        const { createInAppNotification } = await Promise.resolve().then(() => __importStar(require('../notifications/notification.service')));
        await createInAppNotification({
            userId: caregiverId,
            notificationType: 'CAREGIVER_REQUEST_RECEIVED',
            priority: 'HIGH',
            title: 'New Caregiver Request',
            body: `${patientName} has requested you as their caregiver.`,
            payload: { patientId, action: 'caregiver_request_received' }
        });
    }
    catch (err) {
        console.error('[relationships.service] Failed to create in-app notification:', err);
    }
    return result.rows[0];
}
/**
 * @deprecated Legacy caregiver removal.
 * Supports targeting specific caregiverId when patient has multiple caregivers.
 */
async function removeCaregiverRelationship(patientId, caregiverId) {
    let query = `DELETE FROM patient_relationships
               WHERE patient_user_id = $1 AND relationship_type = 'CAREGIVER'`;
    const params = [patientId];
    if (caregiverId) {
        params.push(caregiverId);
        query += ` AND related_user_id = $2`;
    }
    query += ` RETURNING related_user_id`;
    const result = await config_1.default.query(query, params);
    if (!result.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'No active caregiver relationship found', 404);
    return result.rows[0].related_user_id;
}
async function getPendingRequestsForCaregiver(caregiverId) {
    const result = await config_1.default.query(`SELECT 
       u.phone as patient_phone, 
       u.name as patient_name, 
       pr.created_at as confirmed_at
     FROM patient_relationships pr
     JOIN users u ON u.id = pr.patient_user_id
     WHERE pr.related_user_id = $1 AND pr.status IN ('PENDING', 'REQUESTED')
     ORDER BY pr.created_at DESC`, [caregiverId]);
    return result.rows;
}
async function respondToCaregiverRequest(caregiverId, patientPhone, action) {
    // Resolve patient user ID from phone
    const ptResult = await config_1.default.query(`SELECT id FROM users WHERE phone = $1 AND role = 'PATIENT' AND is_active = TRUE`, [patientPhone]);
    if (!ptResult.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'No patient found with this phone number', 404);
    const patientId = ptResult.rows[0].id;
    const cgRow = await config_1.default.query('SELECT name FROM users WHERE id = $1', [caregiverId]);
    const caregiverName = cgRow.rows[0]?.name || 'A caregiver';
    try {
        const { createInAppNotification } = await Promise.resolve().then(() => __importStar(require('../notifications/notification.service')));
        if (action === 'rejected') {
            await config_1.default.query(`DELETE FROM patient_relationships 
         WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER'`, [patientId, caregiverId]);
            await createInAppNotification({
                userId: patientId,
                notificationType: 'CAREGIVER_REQUEST_REJECTED',
                priority: 'MEDIUM',
                title: 'Caregiver Request Declined',
                body: `${caregiverName} has declined your caregiver request.`,
                payload: { caregiverId, action: 'caregiver_request_declined' }
            });
        }
        else {
            await config_1.default.query(`UPDATE patient_relationships
         SET status = 'ACCEPTED', confirmed_at = NOW()
         WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER'`, [patientId, caregiverId]);
            await createInAppNotification({
                userId: patientId,
                notificationType: 'CAREGIVER_REQUEST_ACCEPTED',
                priority: 'HIGH',
                title: 'Caregiver Request Accepted',
                body: `${caregiverName} has accepted your caregiver request.`,
                payload: { caregiverId, action: 'caregiver_request_accepted' }
            });
        }
    }
    catch (err) {
        console.error('[relationships.service] Failed to create in-app notification in respondToCaregiverRequest:', err);
    }
    return { patientId };
}
async function completeMeeting(caregiverId, patientId) {
    const result = await config_1.default.query(`UPDATE patient_relationships
     SET status = 'MEETING_COMPLETED'
     WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER' AND status = 'ACCEPTED'
     RETURNING *`, [patientId, caregiverId]);
    if (!result.rows[0]) {
        throw new AppError_1.AppError('VALIDATION_ERROR', 'Relationship must be in ACCEPTED status to mark meeting as completed', 400);
    }
    return result.rows[0];
}
async function searchCaregivers(patientId, query) {
    // Fetch user object to pass to canonical discoveryService
    const userRes = await config_1.default.query(`SELECT * FROM users WHERE id = $1`, [patientId]);
    const user = userRes.rows[0];
    if (!user)
        return [];
    const response = await discoveryService.searchCaregivers({ query, limit: 50, page: 1, sortBy: 'newest' }, user);
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
async function generateInviteCode(caregiverId, patientId, relationshipType = 'FAMILY_CLOSE') {
    const check = await config_1.default.query(`SELECT id FROM patient_relationships WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER' 
      AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`, [patientId, caregiverId]);
    if (!check.rows[0])
        throw new AppError_1.AppError('RELATIONSHIP_REQUIRED', 'You must be the confirmed caregiver to generate invite codes', 403);
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++)
        code += chars[Math.floor(Math.random() * chars.length)];
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const result = await config_1.default.query(`INSERT INTO invite_codes (code, patient_id, created_by, relationship_type, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING code, expires_at`, [code, patientId, caregiverId, relationshipType, expiresAt]);
    return result.rows[0];
}
async function redeemInviteCode(code, familyUserId) {
    const inv = await config_1.default.query(`SELECT * FROM invite_codes WHERE code = $1 AND used_at IS NULL AND expires_at > NOW()`, [code.toUpperCase()]);
    if (!inv.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Invalid or expired invite code', 404);
    const invite = inv.rows[0];
    // Prevent duplicate links
    const existing = await config_1.default.query(`SELECT id, status FROM patient_relationships
     WHERE patient_user_id = $1 AND related_user_id = $2`, [invite.patient_id, familyUserId]);
    if (existing.rows[0]) {
        const s = existing.rows[0].status;
        if (s === 'CONFIRMED')
            throw new AppError_1.AppError('CONFLICT', 'Already linked to this patient', 409);
        if (s === 'PENDING')
            throw new AppError_1.AppError('CONFLICT', 'Access request already pending', 409);
    }
    const rel = await config_1.default.query(`INSERT INTO patient_relationships (patient_user_id, related_user_id, relationship_type, status, invited_by)
     VALUES ($1, $2, $3, 'PENDING', $4)
     ON CONFLICT (patient_user_id, related_user_id, relationship_type)
     DO UPDATE SET status = 'PENDING', confirmed_at = NULL, approved_by = NULL
     RETURNING *`, [invite.patient_id, familyUserId, invite.relationship_type, invite.created_by]);
    await config_1.default.query(`UPDATE invite_codes SET used_at = NOW(), used_by = $1 WHERE id = $2`, [familyUserId, invite.id]);
    await config_1.default.query(`INSERT INTO family_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [familyUserId]);
    // Alert caregivers of family join request
    try {
        const userRes = await config_1.default.query(`SELECT name FROM users WHERE id = $1`, [familyUserId]);
        const ptRes = await config_1.default.query(`SELECT name FROM users WHERE id = $1`, [invite.patient_id]);
        const familyName = userRes.rows[0]?.name ?? 'A family member';
        const patientName = ptRes.rows[0]?.name ?? 'patient';
        // Create notifications for the caregiver(s) of the patient
        const caregivers = await config_1.default.query(`SELECT related_user_id FROM patient_relationships 
       WHERE patient_user_id = $1 AND relationship_type = 'CAREGIVER' AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`, [invite.patient_id]);
        for (const cg of caregivers.rows) {
            const { createInAppNotification } = await Promise.resolve().then(() => __importStar(require('../notifications/notification.service')));
            await createInAppNotification({
                userId: cg.related_user_id,
                title: 'Family Join Request',
                body: `${familyName} has requested to join ${patientName}'s Care Circle using invite code ${code.toUpperCase()}.`,
                payload: { route: 'CaregiverTriageScreen', params: {} },
            });
        }
    }
    catch (err) {
        console.error('Failed to notify caregiver of invite code join:', err);
    }
    return rel.rows[0];
}
async function getInviteCodesForPatient(caregiverId, patientId) {
    // Check caregiver access
    const check = await config_1.default.query(`SELECT id FROM patient_relationships WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER'
      AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`, [patientId, caregiverId]);
    if (!check.rows[0])
        throw new AppError_1.AppError('RELATIONSHIP_REQUIRED', 'Access denied to this patient', 403);
    const result = await config_1.default.query(`SELECT * FROM invite_codes WHERE patient_id = $1 ORDER BY created_at DESC`, [patientId]);
    return result.rows;
}
async function revokeInviteCode(caregiverId, code) {
    const inv = await config_1.default.query(`SELECT * FROM invite_codes WHERE code = $1`, [code.toUpperCase()]);
    if (!inv.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Invite code not found', 404);
    const invite = inv.rows[0];
    // Check caregiver access
    const check = await config_1.default.query(`SELECT id FROM patient_relationships WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER'
      AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`, [invite.patient_id, caregiverId]);
    if (!check.rows[0])
        throw new AppError_1.AppError('RELATIONSHIP_REQUIRED', 'Access denied to this patient', 403);
    await config_1.default.query(`UPDATE invite_codes SET expires_at = NOW() WHERE code = $1`, [code.toUpperCase()]);
}
async function requestAccessByPhone(familyUserId, patientPhone) {
    let cleanPhone = patientPhone.replace(/[^\d+]/g, '');
    if (!cleanPhone.startsWith('+') && cleanPhone.length === 10) {
        cleanPhone = '+91' + cleanPhone;
    }
    const ptRes = await config_1.default.query(`SELECT id FROM users 
     WHERE (phone = $1 OR regexp_replace(phone, '[^\\d+]', '', 'g') = $1)
       AND role = 'PATIENT' 
       AND is_active = TRUE`, [cleanPhone]);
    if (!ptRes.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'No patient found with this phone number', 404);
    const patientId = ptRes.rows[0].id;
    const existing = await config_1.default.query(`SELECT id, status FROM patient_relationships WHERE patient_user_id = $1 AND related_user_id = $2`, [patientId, familyUserId]);
    if (existing.rows[0]) {
        const s = existing.rows[0].status;
        if (s === 'CONFIRMED')
            throw new AppError_1.AppError('CONFLICT', 'Already linked to this patient', 409);
        if (s === 'PENDING')
            throw new AppError_1.AppError('CONFLICT', 'Access request already pending', 409);
    }
    const result = await config_1.default.query(`INSERT INTO patient_relationships (patient_user_id, related_user_id, relationship_type, status) VALUES ($1, $2, 'FAMILY_CLOSE', 'PENDING') ON CONFLICT (patient_user_id, related_user_id, relationship_type) DO UPDATE SET status = 'PENDING' RETURNING *`, [patientId, familyUserId]);
    await config_1.default.query(`INSERT INTO family_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [familyUserId]);
    try {
        const cgRes = await config_1.default.query(`SELECT related_user_id FROM patient_relationships 
       WHERE patient_user_id = $1 AND relationship_type = 'CAREGIVER' AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`, [patientId]);
        const familyRow = await config_1.default.query('SELECT name FROM users WHERE id = $1', [familyUserId]);
        const familyName = familyRow.rows[0]?.name || 'A family member';
        const patientRow = await config_1.default.query('SELECT name FROM users WHERE id = $1', [patientId]);
        const patientName = patientRow.rows[0]?.name || 'your patient';
        const { createInAppNotification } = await Promise.resolve().then(() => __importStar(require('../notifications/notification.service')));
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
    }
    catch (err) {
        console.error('[relationships.service] Failed to create in-app notification in requestAccessByPhone:', err);
    }
    return result.rows[0];
}
async function getFamilyPatient(familyUserId) {
    const result = await config_1.default.query(`SELECT u.id, u.name, u.photo_url, u.date_of_birth, u.phone, pr.relationship_type, pr.status, pr.confirmed_at, ps.location_state, ps.safety_state, ps.routine_state, ps.last_ping_at, ps.sos_active, ps.battery_pct, ps.network_status, ps.computed_at, ps.last_known_lat, ps.last_known_lng, gz.label AS current_zone_name, fp.relation_label, fp.notify_on_breach, fp.notify_on_missed_critical, fp.notify_on_sos FROM patient_relationships pr JOIN users u ON u.id = pr.patient_user_id LEFT JOIN patient_states ps ON ps.patient_id = pr.patient_user_id LEFT JOIN geofence_zones gz ON gz.id = ps.last_known_zone_id LEFT JOIN family_profiles fp ON fp.user_id = pr.related_user_id WHERE pr.related_user_id = $1 AND pr.status = 'CONFIRMED' LIMIT 1`, [familyUserId]);
    return result.rows[0] ?? null;
}
async function getCareCircle(patientId) {
    const result = await config_1.default.query(`SELECT 
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
     ORDER BY CASE pr.relationship_type WHEN 'CAREGIVER' THEN 0 WHEN 'GUARDIAN' THEN 1 WHEN 'FAMILY_CLOSE' THEN 2 WHEN 'FAMILY_EXTENDED' THEN 3 ELSE 4 END, u.name`, [patientId]);
    return result.rows;
}
async function getPendingFamilyRequests(caregiverId) {
    const result = await config_1.default.query(`SELECT 
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
     ORDER BY pr.created_at DESC`, [caregiverId]);
    return result.rows;
}
async function respondToFamilyRequest(caregiverId, requestId, action) {
    const rel = await config_1.default.query(`SELECT * FROM patient_relationships WHERE id = $1 AND status = 'PENDING'`, [requestId]);
    if (!rel.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Pending request not found', 404);
    const request = rel.rows[0];
    const cgCheck = await config_1.default.query(`SELECT id FROM patient_relationships WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER' AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`, [request.patient_user_id, caregiverId]);
    if (!cgCheck.rows[0])
        throw new AppError_1.AppError('ROLE_NOT_PERMITTED', "Only the patient's caregiver can approve requests", 403);
    const patientRow = await config_1.default.query('SELECT name FROM users WHERE id = $1', [request.patient_user_id]);
    const patientName = patientRow.rows[0]?.name || 'a patient';
    try {
        const { createInAppNotification } = await Promise.resolve().then(() => __importStar(require('../notifications/notification.service')));
        if (action === 'reject') {
            await config_1.default.query(`DELETE FROM patient_relationships WHERE id = $1`, [requestId]);
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
        const updated = await config_1.default.query(`UPDATE patient_relationships SET status = 'CONFIRMED', confirmed_at = NOW(), approved_by = $1 WHERE id = $2 RETURNING *`, [caregiverId, requestId]);
        await config_1.default.query(`INSERT INTO family_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [request.related_user_id]);
        await createInAppNotification({
            userId: request.related_user_id,
            notificationType: 'FAMILY_REQUEST_APPROVED',
            priority: 'HIGH',
            title: 'Care Circle Request Approved',
            body: `Your request to join ${patientName}'s care circle has been approved.`,
            payload: { patientId: request.patient_user_id, action: 'family_request_approved' }
        });
        return { ...updated.rows[0], status: 'CONFIRMED' };
    }
    catch (err) {
        console.error('[relationships.service] Failed to create in-app notification in respondToFamilyRequest:', err);
        if (action === 'reject') {
            await config_1.default.query(`DELETE FROM patient_relationships WHERE id = $1`, [requestId]);
            return { status: 'rejected', patient_user_id: request.patient_user_id, related_user_id: request.related_user_id };
        }
        const updated = await config_1.default.query(`UPDATE patient_relationships SET status = 'CONFIRMED', confirmed_at = NOW(), approved_by = $1 WHERE id = $2 RETURNING *`, [caregiverId, requestId]);
        await config_1.default.query(`INSERT INTO family_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [request.related_user_id]);
        return { ...updated.rows[0], status: 'CONFIRMED' };
    }
}
async function deleteFamilyRelationshipByPatient(patientId, familyUserId) {
    const result = await config_1.default.query(`DELETE FROM patient_relationships
     WHERE patient_user_id = $1 AND related_user_id = $2
       AND relationship_type IN ('FAMILY_CLOSE', 'FAMILY_EXTENDED', 'GUARDIAN')
     RETURNING id`, [patientId, familyUserId]);
    if (!result.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Relationship not found', 404);
}
async function getCareCircleForCaregiver(caregiverId, patientId) {
    const verifyRel = await config_1.default.query(`SELECT 1 FROM patient_relationships 
     WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER' 
       AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`, [patientId, caregiverId]);
    if (verifyRel.rowCount === 0) {
        throw new AppError_1.AppError('FORBIDDEN', 'Access denied to this patient', 403);
    }
    return getCareCircle(patientId);
}
async function getPatientRelationship(caregiverId, patientId) {
    const result = await config_1.default.query(`SELECT * FROM patient_relationships
     WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER'`, [patientId, caregiverId]);
    return result.rows[0] || null;
}
//# sourceMappingURL=relationships.service.js.map