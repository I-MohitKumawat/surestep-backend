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
exports.createCareRequest = createCareRequest;
exports.getIncomingCareRequests = getIncomingCareRequests;
exports.getOutgoingCareRequests = getOutgoingCareRequests;
exports.getCareRequestById = getCareRequestById;
exports.acceptCareRequest = acceptCareRequest;
exports.declineCareRequest = declineCareRequest;
exports.withdrawCareRequest = withdrawCareRequest;
exports.sweepExpiredCareRequests = sweepExpiredCareRequests;
const config_1 = __importDefault(require("../../db/config"));
const AppError_1 = require("../../shared/errors/AppError");
const care_requests_types_1 = require("./care-requests.types");
// ─── HELPERS ─────────────────────────────────────────────────────────────────
function computeAge(dob) {
    if (!dob)
        return null;
    const birth = new Date(dob);
    if (isNaN(birth.getTime()))
        return null;
    const ageDiff = Date.now() - birth.getTime();
    return Math.floor(ageDiff / (365.25 * 24 * 60 * 60 * 1000));
}
function formatDate(dateVal) {
    if (!dateVal)
        return '';
    if (dateVal instanceof Date) {
        return dateVal.toISOString().split('T')[0];
    }
    return String(dateVal).split('T')[0];
}
function mapCareRequestResponse(row, options = {}) {
    const isAccepted = row.status === 'ACCEPTED';
    const isExpired = row.status === 'PENDING' && new Date(row.expires_at).getTime() <= Date.now();
    const effectiveStatus = isExpired ? 'EXPIRED' : row.status;
    const response = {
        id: row.id,
        patientId: row.patient_id,
        requesterId: row.requester_id,
        caregiverId: row.caregiver_id,
        status: effectiveStatus,
        scheduleType: row.schedule_type,
        requestedShifts: row.requested_shifts,
        daysOfWeek: row.days_of_week,
        startDate: formatDate(row.start_date),
        endDate: row.end_date ? formatDate(row.end_date) : null,
        requestedCapabilities: (row.requested_capabilities || []),
        proposedRateType: row.proposed_rate_type,
        proposedRateInr: Number(row.proposed_rate_inr),
        careContextNotes: row.care_context_notes || null,
        declineReason: row.decline_reason || null,
        withdrawReason: row.withdraw_reason || null,
        responseNotes: row.response_notes || null,
        resultingRelationshipId: row.resulting_relationship_id || null,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
        respondedAt: row.responded_at ? new Date(row.responded_at).toISOString() : null,
        expiresAt: new Date(row.expires_at).toISOString(),
        isExpired,
    };
    // Add patient summary if present
    if (row.patient_name) {
        const firstName = row.patient_name.trim().split(' ')[0] || 'Patient';
        response.patient = {
            id: row.patient_id,
            firstName,
            photoUrl: row.patient_photo_url || null,
            approximateAge: computeAge(row.patient_dob),
            city: row.patient_city || null,
        };
        // Staged disclosure: Legal full name and phone revealed strictly post-acceptance
        if (isAccepted || !options.isCaregiverViewer) {
            response.patient.fullName = row.patient_name;
            if (row.patient_phone) {
                response.patient.phone = row.patient_phone;
            }
        }
    }
    // Add requester summary if present
    if (row.requester_name) {
        response.requester = {
            id: row.requester_id,
            name: row.requester_name,
            relationshipType: row.requester_relationship_type || (row.requester_id === row.patient_id ? 'SELF' : 'FAMILY'),
        };
    }
    // Add caregiver summary if present
    if (row.caregiver_name) {
        response.caregiver = {
            id: row.caregiver_id,
            name: row.caregiver_name,
            photoUrl: row.caregiver_photo_url || null,
            professionalRole: row.professional_role || null,
            rating: row.rating ? parseFloat(Number(row.rating).toFixed(1)) : null,
            ratingCount: parseInt(row.rating_count, 10) || 0,
            city: row.caregiver_city || null,
        };
        // Caregiver phone revealed strictly post-acceptance to requester/patient
        if (isAccepted && row.caregiver_phone) {
            response.caregiver.phone = row.caregiver_phone;
        }
    }
    return response;
}
// ─── SERVICE IMPLEMENTATION ──────────────────────────────────────────────────
/**
 * 1. Create a Care Request
 */
async function createCareRequest(user, rawInput) {
    const input = care_requests_types_1.CreateCareRequestSchema.parse(rawInput);
    // Authorization 1: Caregiver cannot initiate care requests
    if (user.role === 'CAREGIVER') {
        throw new AppError_1.AppError('ROLE_NOT_PERMITTED', 'Caregivers cannot initiate care requests', 403);
    }
    // Authorization 2: Self-Patient rule
    if (user.role === 'PATIENT') {
        if (input.patientId !== user.id) {
            throw new AppError_1.AppError('TARGET_PATIENT_UNAUTHORIZED', 'Patients can only request care for themselves', 403);
        }
        // Check onboarding_source
        const profRes = await config_1.default.query('SELECT onboarding_source FROM patient_profiles WHERE user_id = $1', [user.id]);
        if (profRes.rows[0]?.onboarding_source === 'FAMILY') {
            throw new AppError_1.AppError('DISCOVERY_MANAGED_BY_FAMILY', 'Care discovery and requests are managed by your family', 403);
        }
    }
    // Authorization 3: Family member rule
    if (user.role === 'FAMILY') {
        const relRes = await config_1.default.query(`SELECT id FROM patient_relationships
       WHERE patient_user_id = $1 AND related_user_id = $2
         AND status = 'CONFIRMED'
         AND relationship_type IN ('GUARDIAN', 'FAMILY_CLOSE', 'FAMILY_EXTENDED')`, [input.patientId, user.id]);
        if (!relRes.rows[0]) {
            throw new AppError_1.AppError('TARGET_PATIENT_UNAUTHORIZED', 'You must have a confirmed family relationship with this patient to request care', 403);
        }
    }
    // Validate target patient exists, is active, and has PATIENT role
    const ptRes = await config_1.default.query('SELECT id, role, is_active, deleted_at, name FROM users WHERE id = $1', [input.patientId]);
    const targetPatient = ptRes.rows[0];
    if (!targetPatient || targetPatient.role !== 'PATIENT' || !targetPatient.is_active || targetPatient.deleted_at) {
        throw new AppError_1.AppError('NOT_FOUND', 'Target patient not found or inactive', 404);
    }
    // Validate target caregiver exists, is active CAREGIVER, and is discoverable
    const cgRes = await config_1.default.query(`SELECT u.id, u.role, u.is_active, u.deleted_at, u.name, cp.is_discoverable
     FROM users u
     LEFT JOIN caregiver_profiles cp ON cp.user_id = u.id
     WHERE u.id = $1`, [input.caregiverId]);
    const cg = cgRes.rows[0];
    if (!cg || cg.role !== 'CAREGIVER' || !cg.is_active || cg.deleted_at) {
        throw new AppError_1.AppError('NOT_FOUND', 'Caregiver not found or inactive', 404);
    }
    if (cg.is_discoverable === false) {
        throw new AppError_1.AppError('CAREGIVER_NOT_DISCOVERABLE', 'Caregiver is not currently accepting care inquiries', 400);
    }
    // Pre-check: Ensure no active Care Relationship exists
    const activeRelCheck = await config_1.default.query(`SELECT id, status FROM patient_relationships
     WHERE patient_user_id = $1 AND related_user_id = $2
       AND status IN ('ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`, [input.patientId, input.caregiverId]);
    if (activeRelCheck.rows[0]) {
        throw new AppError_1.AppError('ACTIVE_RELATIONSHIP_EXISTS', 'An active care relationship already exists with this caregiver', 409);
    }
    // Pre-check: Duplicate PENDING request check with lazy expiration
    const pendingCheck = await config_1.default.query(`SELECT id, expires_at FROM care_requests
     WHERE patient_id = $1 AND caregiver_id = $2 AND status = 'PENDING'`, [input.patientId, input.caregiverId]);
    if (pendingCheck.rows[0]) {
        const existing = pendingCheck.rows[0];
        if (new Date(existing.expires_at).getTime() <= Date.now()) {
            // Lazily mark expired
            await config_1.default.query("UPDATE care_requests SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1", [existing.id]);
        }
        else {
            throw new AppError_1.AppError('DUPLICATE_REQUEST_PENDING', 'A pending care request already exists for this patient and caregiver', 409);
        }
    }
    // Insert Care Request
    const insertRes = await config_1.default.query(`INSERT INTO care_requests (
       patient_id,
       requester_id,
       caregiver_id,
       status,
       schedule_type,
       requested_shifts,
       days_of_week,
       start_date,
       end_date,
       requested_capabilities,
       proposed_rate_type,
       proposed_rate_inr,
       care_context_notes,
       expires_at
     ) VALUES (
       $1, $2, $3, 'PENDING', $4, $5, $6, $7, $8, $9, $10, $11, $12,
       NOW() + ($13 * INTERVAL '1 hour')
     ) RETURNING *`, [
        input.patientId,
        user.id,
        input.caregiverId,
        input.scheduleType,
        input.requestedShifts && input.requestedShifts.length > 0 ? input.requestedShifts : null,
        input.daysOfWeek && input.daysOfWeek.length > 0 ? input.daysOfWeek : null,
        input.startDate,
        input.endDate || null,
        input.requestedCapabilities || [],
        input.proposedRateType,
        input.proposedRateInr,
        input.careContextNotes || null,
        care_requests_types_1.CARE_REQUEST_EXPIRY_HOURS,
    ]);
    const newRow = insertRes.rows[0];
    // Dispatch In-App Notification to Caregiver
    try {
        const patientFirstName = targetPatient.name ? targetPatient.name.trim().split(' ')[0] : 'A patient';
        const { createInAppNotification } = await Promise.resolve().then(() => __importStar(require('../notifications/notification.service')));
        await createInAppNotification({
            userId: input.caregiverId,
            notificationType: 'CARE_REQUEST_SUBMITTED',
            priority: 'HIGH',
            title: 'New Care Request Received',
            body: `${user.name} has submitted a care inquiry for ${patientFirstName}.`,
            payload: {
                requestId: newRow.id,
                patientId: input.patientId,
                action: 'care_request_submitted',
            },
        });
    }
    catch (err) {
        console.error('[care-requests.service] Failed to dispatch in-app notification:', err);
    }
    // WebSocket event
    try {
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        io.to(`user:${input.caregiverId}`).emit('care_request:received', {
            requestId: newRow.id,
            patientId: input.patientId,
        });
    }
    catch (_) { }
    // Fetch full joined object for client return
    return getCareRequestById(user, newRow.id);
}
/**
 * 2. Get Incoming Care Requests (Caregiver Triage)
 */
async function getIncomingCareRequests(user, status = 'PENDING') {
    if (user.role !== 'CAREGIVER') {
        throw new AppError_1.AppError('ROLE_NOT_PERMITTED', 'Only caregivers can view incoming care requests', 403);
    }
    // Lazy expiration of stale pending requests for this caregiver
    await config_1.default.query(`UPDATE care_requests
     SET status = 'EXPIRED', updated_at = NOW()
     WHERE caregiver_id = $1 AND status = 'PENDING' AND expires_at <= NOW()`, [user.id]);
    let query = `
    SELECT 
      cr.*,
      pu.name AS patient_name,
      pu.photo_url AS patient_photo_url,
      pu.date_of_birth AS patient_dob,
      pu.city AS patient_city,
      pu.phone AS patient_phone,
      ru.name AS requester_name,
      pr.relationship_type AS requester_relationship_type
    FROM care_requests cr
    JOIN users pu ON pu.id = cr.patient_id
    JOIN users ru ON ru.id = cr.requester_id
    LEFT JOIN patient_relationships pr ON pr.patient_user_id = cr.patient_id AND pr.related_user_id = cr.requester_id AND pr.status = 'CONFIRMED'
    WHERE cr.caregiver_id = $1
  `;
    const params = [user.id];
    if (status !== 'ALL') {
        params.push(status);
        query += ` AND cr.status = $${params.length}`;
    }
    query += ` ORDER BY cr.created_at DESC`;
    const result = await config_1.default.query(query, params);
    return result.rows.map((row) => mapCareRequestResponse(row, { isCaregiverViewer: true }));
}
/**
 * 3. Get Outgoing Care Requests (Patient / Family)
 */
async function getOutgoingCareRequests(user, targetPatientId, statusFilter) {
    if (user.role === 'CAREGIVER') {
        throw new AppError_1.AppError('ROLE_NOT_PERMITTED', 'Caregivers cannot view outgoing care requests', 403);
    }
    let resolvedPatientId;
    if (user.role === 'PATIENT') {
        resolvedPatientId = user.id;
    }
    else {
        // FAMILY role
        if (targetPatientId) {
            const relCheck = await config_1.default.query(`SELECT 1 FROM patient_relationships
         WHERE patient_user_id = $1 AND related_user_id = $2
           AND status = 'CONFIRMED'
           AND relationship_type IN ('GUARDIAN', 'FAMILY_CLOSE', 'FAMILY_EXTENDED')`, [targetPatientId, user.id]);
            if (!relCheck.rows[0]) {
                throw new AppError_1.AppError('TARGET_PATIENT_UNAUTHORIZED', 'Unauthorized access to this patient', 403);
            }
            resolvedPatientId = targetPatientId;
        }
        else {
            const relFind = await config_1.default.query(`SELECT patient_user_id FROM patient_relationships
         WHERE related_user_id = $1 AND status = 'CONFIRMED'
           AND relationship_type IN ('GUARDIAN', 'FAMILY_CLOSE', 'FAMILY_EXTENDED')
         LIMIT 1`, [user.id]);
            if (!relFind.rows[0])
                return [];
            resolvedPatientId = relFind.rows[0].patient_user_id;
        }
    }
    // Lazy expire
    await config_1.default.query(`UPDATE care_requests
     SET status = 'EXPIRED', updated_at = NOW()
     WHERE patient_id = $1 AND status = 'PENDING' AND expires_at <= NOW()`, [resolvedPatientId]);
    let query = `
    SELECT 
      cr.*,
      cu.name AS caregiver_name,
      cu.photo_url AS caregiver_photo_url,
      cu.city AS caregiver_city,
      cu.phone AS caregiver_phone,
      cp.professional_role,
      cp.rating,
      cp.rating_count,
      pu.name AS patient_name,
      pu.photo_url AS patient_photo_url,
      pu.date_of_birth AS patient_dob,
      pu.city AS patient_city,
      ru.name AS requester_name
    FROM care_requests cr
    JOIN users cu ON cu.id = cr.caregiver_id
    LEFT JOIN caregiver_profiles cp ON cp.user_id = cr.caregiver_id
    JOIN users pu ON pu.id = cr.patient_id
    JOIN users ru ON ru.id = cr.requester_id
    WHERE cr.patient_id = $1
  `;
    const params = [resolvedPatientId];
    if (statusFilter && statusFilter !== 'ALL') {
        params.push(statusFilter);
        query += ` AND cr.status = $${params.length}`;
    }
    query += ` ORDER BY cr.created_at DESC`;
    const result = await config_1.default.query(query, params);
    return result.rows.map((row) => mapCareRequestResponse(row, { isRequesterViewer: true }));
}
/**
 * 4. Get Care Request By ID
 */
async function getCareRequestById(user, requestId) {
    const result = await config_1.default.query(`SELECT 
       cr.*,
       cu.name AS caregiver_name,
       cu.photo_url AS caregiver_photo_url,
       cu.city AS caregiver_city,
       cu.phone AS caregiver_phone,
       cp.professional_role,
       cp.rating,
       cp.rating_count,
       pu.name AS patient_name,
       pu.photo_url AS patient_photo_url,
       pu.date_of_birth AS patient_dob,
       pu.city AS patient_city,
       pu.phone AS patient_phone,
       ru.name AS requester_name,
       pr.relationship_type AS requester_relationship_type
     FROM care_requests cr
     JOIN users cu ON cu.id = cr.caregiver_id
     LEFT JOIN caregiver_profiles cp ON cp.user_id = cr.caregiver_id
     JOIN users pu ON pu.id = cr.patient_id
     JOIN users ru ON ru.id = cr.requester_id
     LEFT JOIN patient_relationships pr ON pr.patient_user_id = cr.patient_id AND pr.related_user_id = cr.requester_id AND pr.status = 'CONFIRMED'
     WHERE cr.id = $1`, [requestId]);
    const row = result.rows[0];
    if (!row)
        throw new AppError_1.AppError('NOT_FOUND', 'Care request not found', 404);
    // Authorization check: User must be party to the request
    let authorized = row.requester_id === user.id ||
        row.patient_id === user.id ||
        row.caregiver_id === user.id;
    if (!authorized && user.role === 'FAMILY') {
        const famCheck = await config_1.default.query(`SELECT 1 FROM patient_relationships
       WHERE patient_user_id = $1 AND related_user_id = $2
         AND status = 'CONFIRMED'
         AND relationship_type IN ('GUARDIAN', 'FAMILY_CLOSE', 'FAMILY_EXTENDED')`, [row.patient_id, user.id]);
        if (famCheck.rows.length > 0)
            authorized = true;
    }
    if (!authorized) {
        throw new AppError_1.AppError('FORBIDDEN', 'Access denied to this care request', 403);
    }
    // Lazy expiration check
    if (row.status === 'PENDING' && new Date(row.expires_at).getTime() <= Date.now()) {
        await config_1.default.query("UPDATE care_requests SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1", [requestId]);
        row.status = 'EXPIRED';
    }
    const isCaregiverViewer = row.caregiver_id === user.id;
    const isRequesterViewer = row.requester_id === user.id || row.patient_id === user.id;
    return mapCareRequestResponse(row, { isCaregiverViewer, isRequesterViewer });
}
/**
 * 5. Accept Care Request (Atomic Transaction)
 */
async function acceptCareRequest(caregiverUser, requestId) {
    if (caregiverUser.role !== 'CAREGIVER') {
        throw new AppError_1.AppError('ROLE_NOT_PERMITTED', 'Only caregivers can accept care requests', 403);
    }
    const client = await config_1.default.connect();
    let resultingRelRow = null;
    let updatedReqRow = null;
    try {
        await client.query('BEGIN');
        // 1. Lock and fetch care_request
        const reqRes = await client.query('SELECT * FROM care_requests WHERE id = $1 FOR UPDATE', [requestId]);
        const reqRow = reqRes.rows[0];
        if (!reqRow)
            throw new AppError_1.AppError('NOT_FOUND', 'Care request not found', 404);
        if (reqRow.caregiver_id !== caregiverUser.id) {
            throw new AppError_1.AppError('FORBIDDEN', 'You can only accept care requests sent to you', 403);
        }
        if (reqRow.status !== 'PENDING') {
            throw new AppError_1.AppError('INVALID_STATE', `Care request is already ${reqRow.status.toLowerCase()}`, 409);
        }
        if (new Date(reqRow.expires_at).getTime() <= Date.now()) {
            await client.query("UPDATE care_requests SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1", [requestId]);
            await client.query('COMMIT');
            throw new AppError_1.AppError('REQUEST_EXPIRED', 'This care request has expired', 409);
        }
        // 2. Verify caregiver is active
        const cgCheck = await client.query('SELECT is_active, deleted_at FROM users WHERE id = $1', [caregiverUser.id]);
        if (!cgCheck.rows[0] || !cgCheck.rows[0].is_active || cgCheck.rows[0].deleted_at) {
            throw new AppError_1.AppError('FORBIDDEN', 'Caregiver account is inactive or disabled', 403);
        }
        // 3. Capacity Guardrail: Check active patients vs max_patients
        const capRes = await client.query('SELECT max_patients FROM caregiver_profiles WHERE user_id = $1', [caregiverUser.id]);
        const maxPatients = capRes.rows[0]?.max_patients;
        if (maxPatients !== null && maxPatients !== undefined) {
            const countRes = await client.query(`SELECT COUNT(*)::int AS active_count FROM patient_relationships
         WHERE related_user_id = $1
           AND status IN ('ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`, [caregiverUser.id]);
            if (countRes.rows[0]?.active_count >= maxPatients) {
                throw new AppError_1.AppError('CAREGIVER_CAPACITY_EXCEEDED', 'You have reached your maximum patient capacity', 409);
            }
        }
        // 3. Create or reuse relationship in patient_relationships
        const existingRel = await client.query(`SELECT id, status FROM patient_relationships
       WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER'`, [reqRow.patient_id, caregiverUser.id]);
        let relId;
        if (existingRel.rows[0]) {
            const s = existingRel.rows[0].status;
            if (['ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE'].includes(s)) {
                throw new AppError_1.AppError('ACTIVE_RELATIONSHIP_EXISTS', 'An active relationship already exists with this patient', 409);
            }
            const updateRel = await client.query(`UPDATE patient_relationships
         SET status = 'ACCEPTED', confirmed_at = NOW(), ended_at = NULL
         WHERE id = $1
         RETURNING *`, [existingRel.rows[0].id]);
            relId = updateRel.rows[0].id;
            resultingRelRow = updateRel.rows[0];
        }
        else {
            const insertRel = await client.query(`INSERT INTO patient_relationships (
           patient_user_id,
           related_user_id,
           relationship_type,
           status,
           confirmed_at
         ) VALUES ($1, $2, 'CAREGIVER', 'ACCEPTED', NOW())
         RETURNING *`, [reqRow.patient_id, caregiverUser.id]);
            relId = insertRel.rows[0].id;
            resultingRelRow = insertRel.rows[0];
        }
        // 4. Update care_requests status and link relationship
        const updateReq = await client.query(`UPDATE care_requests
       SET status = 'ACCEPTED',
           responded_at = NOW(),
           resulting_relationship_id = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`, [relId, requestId]);
        updatedReqRow = updateReq.rows[0];
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
    // 5. Post-transaction async notifications & socket events
    try {
        const { createInAppNotification } = await Promise.resolve().then(() => __importStar(require('../notifications/notification.service')));
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        // Notify requester
        await createInAppNotification({
            userId: updatedReqRow.requester_id,
            notificationType: 'CARE_REQUEST_ACCEPTED',
            priority: 'HIGH',
            title: 'Care Request Accepted',
            body: `${caregiverUser.name} has accepted your care proposal!`,
            payload: {
                requestId,
                relationshipId: resultingRelRow.id,
                action: 'care_request_accepted',
            },
        });
        // If requester is not the patient, notify patient as well
        if (updatedReqRow.requester_id !== updatedReqRow.patient_id) {
            await createInAppNotification({
                userId: updatedReqRow.patient_id,
                notificationType: 'CARE_REQUEST_ACCEPTED',
                priority: 'HIGH',
                title: 'New Caregiver Connected',
                body: `${caregiverUser.name} has been confirmed as your caregiver.`,
                payload: {
                    requestId,
                    relationshipId: resultingRelRow.id,
                    action: 'care_request_accepted',
                },
            });
        }
        // Socket events
        io.to(`patient:${updatedReqRow.patient_id}`).emit('care_request:accepted', {
            requestId,
            relationship: resultingRelRow,
        });
        io.to(`user:${updatedReqRow.requester_id}`).emit('care_request:accepted', {
            requestId,
            relationship: resultingRelRow,
        });
    }
    catch (postErr) {
        console.error('[care-requests.service] Post-acceptance dispatch error:', postErr);
    }
    const formattedRequest = await getCareRequestById(caregiverUser, requestId);
    return { request: formattedRequest, relationship: resultingRelRow };
}
/**
 * 6. Decline Care Request
 */
async function declineCareRequest(caregiverUser, requestId, input) {
    if (caregiverUser.role !== 'CAREGIVER') {
        throw new AppError_1.AppError('ROLE_NOT_PERMITTED', 'Only caregivers can decline care requests', 403);
    }
    const client = await config_1.default.connect();
    let updatedReqRow = null;
    try {
        await client.query('BEGIN');
        const reqRes = await client.query('SELECT * FROM care_requests WHERE id = $1 FOR UPDATE', [requestId]);
        const reqRow = reqRes.rows[0];
        if (!reqRow)
            throw new AppError_1.AppError('NOT_FOUND', 'Care request not found', 404);
        if (reqRow.caregiver_id !== caregiverUser.id) {
            throw new AppError_1.AppError('FORBIDDEN', 'You can only decline care requests sent to you', 403);
        }
        if (reqRow.status !== 'PENDING') {
            throw new AppError_1.AppError('INVALID_STATE', `Care request is already ${reqRow.status.toLowerCase()}`, 409);
        }
        if (new Date(reqRow.expires_at).getTime() <= Date.now()) {
            await client.query("UPDATE care_requests SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1", [requestId]);
            await client.query('COMMIT');
            throw new AppError_1.AppError('REQUEST_EXPIRED', 'This care request has expired', 409);
        }
        const updateRes = await client.query(`UPDATE care_requests
       SET status = 'DECLINED',
           decline_reason = $1,
           response_notes = $2,
           responded_at = NOW(),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`, [input.declineReason, input.responseNotes || null, requestId]);
        updatedReqRow = updateRes.rows[0];
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
    // Post-decline notification
    try {
        const { createInAppNotification } = await Promise.resolve().then(() => __importStar(require('../notifications/notification.service')));
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        await createInAppNotification({
            userId: updatedReqRow.requester_id,
            notificationType: 'CARE_REQUEST_DECLINED',
            priority: 'MEDIUM',
            title: 'Care Request Declined',
            body: `${caregiverUser.name} was unable to accept your care proposal.`,
            payload: {
                requestId,
                declineReason: input.declineReason,
                action: 'care_request_declined',
            },
        });
        io.to(`user:${updatedReqRow.requester_id}`).emit('care_request:declined', {
            requestId,
            declineReason: input.declineReason,
        });
    }
    catch (err) {
        console.error('[care-requests.service] Post-decline dispatch error:', err);
    }
    const formattedRequest = await getCareRequestById(caregiverUser, requestId);
    return { request: formattedRequest };
}
/**
 * 7. Withdraw Care Request
 */
async function withdrawCareRequest(user, requestId, input) {
    const client = await config_1.default.connect();
    let updatedReqRow = null;
    try {
        await client.query('BEGIN');
        const reqRes = await client.query('SELECT * FROM care_requests WHERE id = $1 FOR UPDATE', [requestId]);
        const reqRow = reqRes.rows[0];
        if (!reqRow)
            throw new AppError_1.AppError('NOT_FOUND', 'Care request not found', 404);
        let authorized = reqRow.requester_id === user.id || reqRow.patient_id === user.id;
        if (!authorized && user.role === 'FAMILY') {
            const famCheck = await client.query(`SELECT 1 FROM patient_relationships
         WHERE patient_user_id = $1 AND related_user_id = $2
           AND status = 'CONFIRMED'
           AND relationship_type IN ('GUARDIAN', 'FAMILY_CLOSE', 'FAMILY_EXTENDED')`, [reqRow.patient_id, user.id]);
            if (famCheck.rows.length > 0)
                authorized = true;
        }
        if (!authorized) {
            throw new AppError_1.AppError('FORBIDDEN', 'You do not have permission to withdraw this care request', 403);
        }
        if (reqRow.status !== 'PENDING') {
            throw new AppError_1.AppError('INVALID_STATE', `Care request is already ${reqRow.status.toLowerCase()}`, 409);
        }
        if (new Date(reqRow.expires_at).getTime() <= Date.now()) {
            await client.query("UPDATE care_requests SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1", [requestId]);
            await client.query('COMMIT');
            throw new AppError_1.AppError('REQUEST_EXPIRED', 'This care request has expired', 409);
        }
        const updateRes = await client.query(`UPDATE care_requests
       SET status = 'WITHDRAWN',
           withdraw_reason = $1,
           response_notes = $2,
           responded_at = NOW(),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`, [input.withdrawReason, input.responseNotes || null, requestId]);
        updatedReqRow = updateRes.rows[0];
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
    // Post-withdraw notification to caregiver
    try {
        const { createInAppNotification } = await Promise.resolve().then(() => __importStar(require('../notifications/notification.service')));
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        const ptRes = await config_1.default.query('SELECT name FROM users WHERE id = $1', [updatedReqRow.patient_id]);
        const ptFirstName = ptRes.rows[0]?.name ? ptRes.rows[0].name.trim().split(' ')[0] : 'The patient';
        await createInAppNotification({
            userId: updatedReqRow.caregiver_id,
            notificationType: 'CARE_REQUEST_WITHDRAWN',
            priority: 'LOW',
            title: 'Care Request Withdrawn',
            body: `The care proposal for ${ptFirstName} has been withdrawn by the requester.`,
            payload: {
                requestId,
                withdrawReason: input.withdrawReason,
                action: 'care_request_withdrawn',
            },
        });
        io.to(`user:${updatedReqRow.caregiver_id}`).emit('care_request:withdrawn', {
            requestId,
            withdrawReason: input.withdrawReason,
        });
    }
    catch (err) {
        console.error('[care-requests.service] Post-withdraw dispatch error:', err);
    }
    const formattedRequest = await getCareRequestById(user, requestId);
    return { request: formattedRequest };
}
/**
 * 8. Background Maintenance: Sweep and Mark Expired Care Requests
 * Transitions PENDING requests past expires_at to EXPIRED, and dispatches CARE_REQUEST_EXPIRED notifications.
 */
async function sweepExpiredCareRequests() {
    const expiredRes = await config_1.default.query(`UPDATE care_requests
     SET status = 'EXPIRED', updated_at = NOW()
     WHERE status = 'PENDING' AND expires_at <= NOW()
     RETURNING id, patient_id, requester_id, caregiver_id`);
    const expiredRequests = expiredRes.rows;
    if (expiredRequests.length === 0)
        return 0;
    for (const req of expiredRequests) {
        try {
            const { createInAppNotification } = await Promise.resolve().then(() => __importStar(require('../notifications/notification.service')));
            const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
            await createInAppNotification({
                userId: req.requester_id,
                notificationType: 'CARE_REQUEST_EXPIRED',
                priority: 'LOW',
                title: 'Care Request Expired',
                body: 'A submitted care inquiry has expired without a response.',
                payload: {
                    requestId: req.id,
                    patientId: req.patient_id,
                    action: 'care_request_expired',
                },
            });
            io.to(`user:${req.requester_id}`).emit('care_request:expired', {
                requestId: req.id,
                patientId: req.patient_id,
            });
            io.to(`user:${req.caregiver_id}`).emit('care_request:expired', {
                requestId: req.id,
                patientId: req.patient_id,
            });
        }
        catch (dispatchErr) {
            console.error(`[care-requests.service] Failed to dispatch expiration notification for request ${req.id}:`, dispatchErr);
        }
    }
    return expiredRequests.length;
}
//# sourceMappingURL=care-requests.service.js.map