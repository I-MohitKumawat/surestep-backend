"use strict";
/**
 * SureStep — modules/care-relationships/care-relationships.service.ts
 *
 * Core business logic for Phase 3A: End Care Relationship lifecycle.
 * Enforces transactional row locking, authority checks, terminal status transitions,
 * and post-commit notification events.
 */
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
exports.endCareRelationship = endCareRelationship;
exports.getCareRelationshipHistory = getCareRelationshipHistory;
exports.createResignationRequest = createResignationRequest;
exports.getResignationRequest = getResignationRequest;
exports.getPendingResignationsForPatient = getPendingResignationsForPatient;
exports.acceptResignationRequest = acceptResignationRequest;
exports.declineResignationRequest = declineResignationRequest;
exports.withdrawResignationRequest = withdrawResignationRequest;
const config_1 = __importDefault(require("../../db/config"));
const AppError_1 = require("../../shared/errors/AppError");
const care_relationships_types_1 = require("./care-relationships.types");
/**
 * End an active or established care relationship.
 * Enforces strict transactional row-locking (SELECT ... FOR UPDATE)
 * and verifies caller authority.
 */
async function endCareRelationship(relationshipId, input, caller) {
    // 1. Invariant: Validate input reason
    if (!input || !input.reason) {
        throw new AppError_1.AppError('VALIDATION_ERROR', 'Termination reason is required', 400);
    }
    if (!care_relationships_types_1.CANONICAL_END_REASONS.includes(input.reason)) {
        throw new AppError_1.AppError('VALIDATION_ERROR', `Invalid end reason. Must be one of: ${care_relationships_types_1.CANONICAL_END_REASONS.join(', ')}`, 400);
    }
    // 2. Invariant: Notes length constraint (<= 500 chars)
    if (input.notes && input.notes.length > 500) {
        throw new AppError_1.AppError('NOTES_TOO_LONG', 'Termination notes must not exceed 500 characters', 400);
    }
    // 3. Invariant: Caregiver direct termination restriction
    if (caller.role === 'CAREGIVER') {
        throw new AppError_1.AppError('CAREGIVER_CANNOT_END_RELATIONSHIP_DIRECTLY', 'Caregivers cannot end care relationships through the requester endpoint. Please coordinate with patient family or support.', 403);
    }
    const client = await config_1.default.connect();
    let updatedRow;
    let patientName = 'Patient';
    let caregiverName = 'Caregiver';
    let patientId = '';
    let caregiverId = '';
    try {
        await client.query('BEGIN');
        // 4. Invariant: Lock relationship row for update
        const relRes = await client.query(`SELECT * FROM patient_relationships WHERE id = $1 FOR UPDATE`, [relationshipId]);
        const rel = relRes.rows[0];
        if (!rel) {
            throw new AppError_1.AppError('RELATIONSHIP_NOT_FOUND', 'Care relationship not found', 404);
        }
        if (rel.relationship_type !== 'CAREGIVER') {
            throw new AppError_1.AppError('NOT_A_CAREGIVER_RELATIONSHIP', 'Targeted relationship is not a caregiver relationship', 400);
        }
        patientId = rel.patient_user_id;
        caregiverId = rel.related_user_id;
        // 5. Invariant: Authority Evaluation
        if (caller.role === 'PATIENT') {
            if (caller.id !== rel.patient_user_id) {
                throw new AppError_1.AppError('UNAUTHORIZED_CARE_RELATIONSHIP_END', 'You are not authorized to end this care relationship', 403);
            }
        }
        else if (caller.role === 'FAMILY') {
            const famCheck = await client.query(`SELECT id FROM patient_relationships
         WHERE patient_user_id = $1 AND related_user_id = $2
           AND status = 'CONFIRMED'
           AND relationship_type IN ('GUARDIAN', 'FAMILY_CLOSE', 'FAMILY_EXTENDED')`, [rel.patient_user_id, caller.id]);
            if (!famCheck.rows[0]) {
                throw new AppError_1.AppError('UNAUTHORIZED_CARE_RELATIONSHIP_END', 'You do not have confirmed family authority over this patient', 403);
            }
        }
        else {
            throw new AppError_1.AppError('UNAUTHORIZED_CARE_RELATIONSHIP_END', 'Unauthorized to end care relationship', 403);
        }
        // 6. Invariant: Eligible State Validation
        if (rel.status === 'ENDED') {
            throw new AppError_1.AppError('RELATIONSHIP_ALREADY_ENDED', 'Care relationship is already ended', 409);
        }
        const eligibleStatuses = ['ACTIVE_CARE', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACCEPTED', 'CONFIRMED'];
        if (!eligibleStatuses.includes(rel.status)) {
            throw new AppError_1.AppError('INVALID_RELATIONSHIP_STATUS', `Relationship in status '${rel.status}' cannot be ended. Only established relationships can be ended.`, 400);
        }
        // 7. Transition status to ENDED and store termination audit metadata
        const updateRes = await client.query(`UPDATE patient_relationships
       SET status = 'ENDED',
           previous_status = $1,
           ended_at = NOW(),
           ended_by = $2,
           end_reason = $3,
           end_notes = $4
       WHERE id = $5
       RETURNING *`, [rel.status, caller.id, input.reason, input.notes || null, relationshipId]);
        updatedRow = updateRes.rows[0];
        // Close any pending resignation request if patient/family ended care directly
        await client.query(`UPDATE caregiver_resignation_requests
       SET status = 'ACCEPTED',
           responded_at = NOW(),
           responded_by = $1,
           updated_at = NOW()
       WHERE relationship_id = $2 AND status = 'PENDING'`, [caller.id, relationshipId]);
        // Fetch user names for notification copy
        const usersRes = await client.query(`SELECT id, name FROM users WHERE id IN ($1, $2)`, [patientId, caregiverId]);
        for (const u of usersRes.rows) {
            if (u.id === patientId)
                patientName = u.name;
            if (u.id === caregiverId)
                caregiverName = u.name;
        }
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
    // 8. Post-Commit Event Dispatch (Safe from transaction failure)
    try {
        const { createInAppNotification } = await Promise.resolve().then(() => __importStar(require('../notifications/notification.service')));
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        const reasonDescriptions = {
            CARE_NO_LONGER_REQUIRED: 'Care is no longer required',
            FAMILY_TAKING_OVER: 'Family is taking over care',
            FOUND_DIFFERENT_CARE: 'Alternative care arranged',
            CAREGIVER_NOT_A_GOOD_FIT: 'Caregiver was not a good fit',
            SCHEDULE_CHANGED: 'Care schedule changed',
            CAREGIVER_REQUESTED_END: 'Caregiver requested end of care',
            OTHER: 'Other reasons',
        };
        const friendlyReason = reasonDescriptions[input.reason] || input.reason;
        // 8.A: Notify Caregiver
        await createInAppNotification({
            userId: caregiverId,
            notificationType: 'CARE_RELATIONSHIP_ENDED',
            priority: 'HIGH',
            title: 'Care Arrangement Concluded',
            body: `Your care arrangement with ${patientName} has concluded (${friendlyReason}).`,
            payload: {
                relationshipId,
                patientId,
                action: 'care_relationship_ended',
                reason: input.reason,
            },
        });
        // 8.B: Notify Patient if ended by Family coordinator
        if (caller.role === 'FAMILY' && caller.id !== patientId) {
            await createInAppNotification({
                userId: patientId,
                notificationType: 'CARE_RELATIONSHIP_ENDED',
                priority: 'MEDIUM',
                title: 'Caregiver Relationship Ended',
                body: `Your care arrangement with ${caregiverName} was concluded by your family coordinator (${friendlyReason}).`,
                payload: {
                    relationshipId,
                    caregiverId,
                    action: 'care_relationship_ended',
                    reason: input.reason,
                },
            });
        }
        // 8.C: Real-time WebSocket room broadcast
        if (io) {
            io.to(`patient:${patientId}`).emit('relationship:change', {
                action: 'ended',
                relationshipId,
                patientId,
                caregiverId,
                status: 'ENDED',
            });
            io.to(`user:${caregiverId}`).emit('relationship:change', {
                action: 'ended',
                relationshipId,
                patientId,
                caregiverId,
                status: 'ENDED',
            });
        }
    }
    catch (notifyErr) {
        console.error('[endCareRelationship] Failed to dispatch post-commit notification:', notifyErr);
    }
    return updatedRow;
}
/**
 * Fetch care history for a patient (ENDED relationships).
 * Retains historical caregiver records while active queries exclude them.
 */
async function getCareRelationshipHistory(targetPatientId, caller) {
    // Authority Verification
    if (caller.role === 'PATIENT') {
        if (caller.id !== targetPatientId) {
            throw new AppError_1.AppError('UNAUTHORIZED', 'Cannot view care history for another patient', 403);
        }
    }
    else if (caller.role === 'FAMILY') {
        const famCheck = await config_1.default.query(`SELECT id FROM patient_relationships
       WHERE patient_user_id = $1 AND related_user_id = $2
         AND status = 'CONFIRMED'
         AND relationship_type IN ('GUARDIAN', 'FAMILY_CLOSE', 'FAMILY_EXTENDED')`, [targetPatientId, caller.id]);
        if (!famCheck.rows[0]) {
            throw new AppError_1.AppError('UNAUTHORIZED', 'You do not have confirmed family authority over this patient', 403);
        }
    }
    const result = await config_1.default.query(`SELECT u.id as caregiver_id, u.name, u.photo_url, u.city,
            cp.professional_role, cp.rating, cp.rating_count,
            pr.id as relationship_id, pr.relationship_type, pr.status, pr.previous_status,
            pr.confirmed_at, pr.ended_at, pr.ended_by, pr.end_reason, pr.end_notes
     FROM patient_relationships pr
     JOIN users u ON u.id = pr.related_user_id
     LEFT JOIN caregiver_profiles cp ON cp.user_id = pr.related_user_id
     WHERE pr.patient_user_id = $1
       AND pr.relationship_type = 'CAREGIVER'
       AND pr.status = 'ENDED'
     ORDER BY pr.ended_at DESC NULLS LAST, pr.created_at DESC`, [targetPatientId]);
    return result.rows.map((row) => ({
        id: row.caregiver_id,
        caregiver_id: row.caregiver_id,
        name: row.name,
        photo_url: row.photo_url,
        city: row.city,
        professional_role: row.professional_role || 'Caregiver',
        rating: row.rating ? parseFloat(row.rating) : null,
        rating_count: row.rating_count || 0,
        relationship_id: row.relationship_id,
        relationship_type: row.relationship_type,
        status: row.status,
        previous_status: row.previous_status,
        confirmed_at: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
        ended_at: row.ended_at ? new Date(row.ended_at).toISOString() : null,
        ended_by: row.ended_by,
        end_reason: row.end_reason,
        end_notes: row.end_notes,
    }));
}
// ─── Phase 3B: Caregiver Resignation Workflow ─────────────────────────────────
/**
 * Caregiver creates a request to end care (resignation).
 */
async function createResignationRequest(relationshipId, input, caller) {
    // 1. Invariant: Caller must be CAREGIVER
    if (caller.role !== 'CAREGIVER') {
        throw new AppError_1.AppError('FORBIDDEN', 'Only caregivers can submit a resignation request. Patients and family coordinators use the End Care flow.', 403);
    }
    // 2. Invariant: Validate canonical reason
    if (!input || !input.reason) {
        throw new AppError_1.AppError('VALIDATION_ERROR', 'Resignation reason is required', 400);
    }
    if (!care_relationships_types_1.CANONICAL_RESIGNATION_REASONS.includes(input.reason)) {
        throw new AppError_1.AppError('VALIDATION_ERROR', `Invalid resignation reason. Must be one of: ${care_relationships_types_1.CANONICAL_RESIGNATION_REASONS.join(', ')}`, 400);
    }
    // 3. Invariant: Max 500 chars on notes
    if (input.notes && input.notes.length > 500) {
        throw new AppError_1.AppError('NOTES_TOO_LONG', 'Resignation notes must not exceed 500 characters', 400);
    }
    const client = await config_1.default.connect();
    let resignationRow;
    let patientName = 'Patient';
    let caregiverName = 'Caregiver';
    let patientId = '';
    try {
        await client.query('BEGIN');
        // 4. Lock relationship row
        const relRes = await client.query(`SELECT * FROM patient_relationships WHERE id = $1 FOR UPDATE`, [relationshipId]);
        const rel = relRes.rows[0];
        if (!rel) {
            throw new AppError_1.AppError('RELATIONSHIP_NOT_FOUND', 'Care relationship not found', 404);
        }
        if (rel.relationship_type !== 'CAREGIVER') {
            throw new AppError_1.AppError('NOT_A_CAREGIVER_RELATIONSHIP', 'Targeted relationship is not a caregiver relationship', 400);
        }
        // 5. Invariant: Caregiver must own the relationship
        if (rel.related_user_id !== caller.id) {
            throw new AppError_1.AppError('FORBIDDEN', 'You can only submit resignation for your own care relationship', 403);
        }
        patientId = rel.patient_user_id;
        // 6. Invariant: Check relationship status
        if (rel.status === 'ENDED') {
            throw new AppError_1.AppError('RELATIONSHIP_ALREADY_ENDED', 'Cannot resign from an already ended care relationship', 409);
        }
        const eligibleStatuses = ['ACTIVE_CARE', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACCEPTED', 'CONFIRMED'];
        if (!eligibleStatuses.includes(rel.status)) {
            throw new AppError_1.AppError('INVALID_RELATIONSHIP_STATUS', `Relationship in status '${rel.status}' cannot accept resignation. Only established relationships can be resigned from.`, 400);
        }
        // 7. Invariant: Check for duplicate pending resignation
        const pendingCheck = await client.query(`SELECT id FROM caregiver_resignation_requests
       WHERE relationship_id = $1 AND status = 'PENDING' FOR UPDATE`, [relationshipId]);
        if (pendingCheck.rows.length > 0) {
            throw new AppError_1.AppError('DUPLICATE_PENDING_RESIGNATION', 'A pending resignation request already exists for this care relationship', 409);
        }
        // 8. Insert resignation request
        const insertRes = await client.query(`INSERT INTO caregiver_resignation_requests (
         relationship_id, caregiver_id, patient_id, reason, notes, status, requested_at
       ) VALUES ($1, $2, $3, $4, $5, 'PENDING', NOW())
       RETURNING *`, [relationshipId, caller.id, patientId, input.reason, input.notes || null]);
        resignationRow = insertRes.rows[0];
        // Fetch user names for notification copy
        const usersRes = await client.query(`SELECT id, name FROM users WHERE id IN ($1, $2)`, [patientId, caller.id]);
        for (const u of usersRes.rows) {
            if (u.id === patientId)
                patientName = u.name;
            if (u.id === caller.id)
                caregiverName = u.name;
        }
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
    // 9. Post-Commit Event Dispatch
    try {
        const { createInAppNotification } = await Promise.resolve().then(() => __importStar(require('../notifications/notification.service')));
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        const reasonDescriptions = {
            PERSONAL_CIRCUMSTANCES: 'Personal circumstances',
            SCHEDULE_CONFLICT: 'Schedule conflict',
            OUTSIDE_SERVICE_AREA: 'Outside service area',
            CARE_NEEDS_CHANGED: 'Care needs changed',
            CAPACITY_CONSTRAINT: 'Capacity constraints',
            ROLE_NO_LONGER_SUITABLE: 'Role no longer suitable',
            OTHER: 'Other circumstances',
        };
        const friendlyReason = reasonDescriptions[input.reason] || input.reason;
        // Notify patient
        await createInAppNotification({
            userId: patientId,
            notificationType: 'CAREGIVER_RESIGNATION_SUBMITTED',
            priority: 'HIGH',
            title: 'Caregiver Resignation Request',
            body: `${caregiverName} has requested to end care (${friendlyReason}). Please review and respond in your Care Team.`,
            payload: {
                resignationId: resignationRow.id,
                relationshipId,
                caregiverId: caller.id,
                reason: input.reason,
                action: 'caregiver_resignation_submitted',
            },
        });
        // Notify confirmed family coordinators
        const famRes = await config_1.default.query(`SELECT related_user_id FROM patient_relationships
       WHERE patient_user_id = $1 AND status = 'CONFIRMED'
         AND relationship_type IN ('GUARDIAN', 'FAMILY_CLOSE', 'FAMILY_EXTENDED')`, [patientId]);
        for (const fRow of famRes.rows) {
            await createInAppNotification({
                userId: fRow.related_user_id,
                notificationType: 'CAREGIVER_RESIGNATION_SUBMITTED',
                priority: 'HIGH',
                title: 'Caregiver Resignation Request',
                body: `${caregiverName} has requested to end care for ${patientName} (${friendlyReason}). Please review and respond.`,
                payload: {
                    resignationId: resignationRow.id,
                    relationshipId,
                    patientId,
                    caregiverId: caller.id,
                    reason: input.reason,
                    action: 'caregiver_resignation_submitted',
                },
            });
        }
        if (io) {
            io.to(`patient:${patientId}`).emit('resignation:change', {
                action: 'created',
                resignationId: resignationRow.id,
                relationshipId,
                caregiverId: caller.id,
                status: 'PENDING',
            });
            io.to(`user:${caller.id}`).emit('resignation:change', {
                action: 'created',
                resignationId: resignationRow.id,
                relationshipId,
                caregiverId: caller.id,
                status: 'PENDING',
            });
        }
    }
    catch (notifyErr) {
        console.error('[createResignationRequest] Failed to dispatch notifications:', notifyErr);
    }
    resignationRow.caregiver_name = caregiverName;
    resignationRow.patient_name = patientName;
    return resignationRow;
}
/**
 * Get resignation request for a relationship (latest).
 */
async function getResignationRequest(relationshipId, caller) {
    const result = await config_1.default.query(`SELECT r.*, u_cg.name as caregiver_name, u_pt.name as patient_name
     FROM caregiver_resignation_requests r
     JOIN users u_cg ON u_cg.id = r.caregiver_id
     JOIN users u_pt ON u_pt.id = r.patient_id
     WHERE r.relationship_id = $1
     ORDER BY r.created_at DESC LIMIT 1`, [relationshipId]);
    const row = result.rows[0] || null;
    if (!row)
        return null;
    // Verify caller authority
    if (caller.role === 'CAREGIVER') {
        if (caller.id !== row.caregiver_id) {
            throw new AppError_1.AppError('FORBIDDEN', 'Access denied to this resignation request', 403);
        }
    }
    else if (caller.role === 'PATIENT') {
        if (caller.id !== row.patient_id) {
            throw new AppError_1.AppError('FORBIDDEN', 'Access denied to this resignation request', 403);
        }
    }
    else if (caller.role === 'FAMILY') {
        const famCheck = await config_1.default.query(`SELECT id FROM patient_relationships
       WHERE patient_user_id = $1 AND related_user_id = $2
         AND status = 'CONFIRMED'
         AND relationship_type IN ('GUARDIAN', 'FAMILY_CLOSE', 'FAMILY_EXTENDED')`, [row.patient_id, caller.id]);
        if (!famCheck.rows[0]) {
            throw new AppError_1.AppError('FORBIDDEN', 'You do not have confirmed family authority over this patient', 403);
        }
    }
    return row;
}
/**
 * Fetch all pending resignation requests for a patient.
 */
async function getPendingResignationsForPatient(patientId, caller) {
    if (caller.role === 'PATIENT') {
        if (caller.id !== patientId) {
            throw new AppError_1.AppError('FORBIDDEN', 'Cannot view resignation requests for another patient', 403);
        }
    }
    else if (caller.role === 'FAMILY') {
        const famCheck = await config_1.default.query(`SELECT id FROM patient_relationships
       WHERE patient_user_id = $1 AND related_user_id = $2
         AND status = 'CONFIRMED'
         AND relationship_type IN ('GUARDIAN', 'FAMILY_CLOSE', 'FAMILY_EXTENDED')`, [patientId, caller.id]);
        if (!famCheck.rows[0]) {
            throw new AppError_1.AppError('FORBIDDEN', 'You do not have confirmed family authority over this patient', 403);
        }
    }
    else {
        throw new AppError_1.AppError('FORBIDDEN', 'Unauthorized to view patient resignation requests', 403);
    }
    const result = await config_1.default.query(`SELECT r.*, u_cg.name as caregiver_name, u_pt.name as patient_name
     FROM caregiver_resignation_requests r
     JOIN users u_cg ON u_cg.id = r.caregiver_id
     JOIN users u_pt ON u_pt.id = r.patient_id
     WHERE r.patient_id = $1 AND r.status = 'PENDING'
     ORDER BY r.requested_at DESC`, [patientId]);
    return result.rows;
}
/**
 * Patient or authorized family accepts caregiver resignation request.
 * Transactionally marks resignation ACCEPTED and relationship ENDED.
 */
async function acceptResignationRequest(relationshipId, caller) {
    // Caregiver cannot accept their own resignation
    if (caller.role === 'CAREGIVER') {
        throw new AppError_1.AppError('FORBIDDEN', 'Caregivers cannot accept their own resignation request', 403);
    }
    const client = await config_1.default.connect();
    let updatedResignation;
    let updatedRel;
    let patientName = 'Patient';
    let caregiverName = 'Caregiver';
    let patientId = '';
    let caregiverId = '';
    try {
        await client.query('BEGIN');
        // 1. Lock resignation row
        const resRes = await client.query(`SELECT * FROM caregiver_resignation_requests
       WHERE relationship_id = $1 AND status = 'PENDING'
       FOR UPDATE`, [relationshipId]);
        const resignation = resRes.rows[0];
        if (!resignation) {
            throw new AppError_1.AppError('NO_PENDING_RESIGNATION', 'No pending resignation request found for this care relationship', 409);
        }
        // 2. Lock relationship row
        const relRes = await client.query(`SELECT * FROM patient_relationships WHERE id = $1 FOR UPDATE`, [relationshipId]);
        const rel = relRes.rows[0];
        if (!rel) {
            throw new AppError_1.AppError('RELATIONSHIP_NOT_FOUND', 'Care relationship not found', 404);
        }
        patientId = rel.patient_user_id;
        caregiverId = rel.related_user_id;
        // 3. Authority check
        if (caller.role === 'PATIENT') {
            if (caller.id !== rel.patient_user_id) {
                throw new AppError_1.AppError('FORBIDDEN', 'You are not authorized to accept this resignation', 403);
            }
        }
        else if (caller.role === 'FAMILY') {
            const famCheck = await client.query(`SELECT id FROM patient_relationships
         WHERE patient_user_id = $1 AND related_user_id = $2
           AND status = 'CONFIRMED'
           AND relationship_type IN ('GUARDIAN', 'FAMILY_CLOSE', 'FAMILY_EXTENDED')`, [rel.patient_user_id, caller.id]);
            if (!famCheck.rows[0]) {
                throw new AppError_1.AppError('FORBIDDEN', 'You do not have confirmed family authority over this patient', 403);
            }
        }
        else {
            throw new AppError_1.AppError('FORBIDDEN', 'Unauthorized to accept resignation', 403);
        }
        // 4. Verify relationship not already ended
        if (rel.status === 'ENDED') {
            throw new AppError_1.AppError('RELATIONSHIP_ALREADY_ENDED', 'Care relationship is already ended', 409);
        }
        // 5. Mark resignation ACCEPTED
        const resUpdate = await client.query(`UPDATE caregiver_resignation_requests
       SET status = 'ACCEPTED',
           responded_at = NOW(),
           responded_by = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`, [caller.id, resignation.id]);
        updatedResignation = resUpdate.rows[0];
        // 6. Transition relationship to ENDED using Phase 3A canonical fields
        const notesToStore = resignation.notes
            ? `Resignation: ${resignation.notes}`
            : `Resignation requested (${resignation.reason})`;
        const relUpdate = await client.query(`UPDATE patient_relationships
       SET status = 'ENDED',
           previous_status = $1,
           ended_at = NOW(),
           ended_by = $2,
           end_reason = 'CAREGIVER_REQUESTED_END',
           end_notes = $3
       WHERE id = $4
       RETURNING *`, [rel.status, caller.id, notesToStore, relationshipId]);
        updatedRel = relUpdate.rows[0];
        // Fetch user names for notification copy
        const usersRes = await client.query(`SELECT id, name FROM users WHERE id IN ($1, $2)`, [patientId, caregiverId]);
        for (const u of usersRes.rows) {
            if (u.id === patientId)
                patientName = u.name;
            if (u.id === caregiverId)
                caregiverName = u.name;
        }
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
    // 7. Post-Commit Event Dispatch
    try {
        const { createInAppNotification } = await Promise.resolve().then(() => __importStar(require('../notifications/notification.service')));
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        await createInAppNotification({
            userId: caregiverId,
            notificationType: 'CAREGIVER_RESIGNATION_ACCEPTED',
            priority: 'HIGH',
            title: 'Resignation Accepted',
            body: `Your resignation request for ${patientName} was accepted. Your care arrangement has ended.`,
            payload: {
                resignationId: updatedResignation.id,
                relationshipId,
                patientId,
                action: 'caregiver_resignation_accepted',
            },
        });
        if (io) {
            io.to(`patient:${patientId}`).emit('relationship:change', {
                action: 'ended',
                relationshipId,
                patientId,
                caregiverId,
                status: 'ENDED',
            });
            io.to(`user:${caregiverId}`).emit('relationship:change', {
                action: 'ended',
                relationshipId,
                patientId,
                caregiverId,
                status: 'ENDED',
            });
            io.to(`patient:${patientId}`).emit('resignation:change', {
                action: 'accepted',
                resignationId: updatedResignation.id,
                relationshipId,
                status: 'ACCEPTED',
            });
            io.to(`user:${caregiverId}`).emit('resignation:change', {
                action: 'accepted',
                resignationId: updatedResignation.id,
                relationshipId,
                status: 'ACCEPTED',
            });
        }
    }
    catch (notifyErr) {
        console.error('[acceptResignationRequest] Failed to dispatch notifications:', notifyErr);
    }
    return { resignation: updatedResignation, relationship: updatedRel };
}
/**
 * Patient or authorized family declines caregiver resignation request.
 * Resignation marks DECLINED; relationship remains ACTIVE_CARE.
 */
async function declineResignationRequest(relationshipId, input, caller) {
    // Caregiver cannot decline
    if (caller.role === 'CAREGIVER') {
        throw new AppError_1.AppError('FORBIDDEN', 'Caregivers cannot decline their own resignation request', 403);
    }
    if (input?.notes && input.notes.length > 500) {
        throw new AppError_1.AppError('NOTES_TOO_LONG', 'Notes must not exceed 500 characters', 400);
    }
    const client = await config_1.default.connect();
    let updatedResignation;
    let patientName = 'Patient';
    let caregiverName = 'Caregiver';
    let patientId = '';
    let caregiverId = '';
    try {
        await client.query('BEGIN');
        // 1. Lock resignation row
        const resRes = await client.query(`SELECT * FROM caregiver_resignation_requests
       WHERE relationship_id = $1 AND status = 'PENDING'
       FOR UPDATE`, [relationshipId]);
        const resignation = resRes.rows[0];
        if (!resignation) {
            throw new AppError_1.AppError('NO_PENDING_RESIGNATION', 'No pending resignation request found for this care relationship', 409);
        }
        // 2. Lock relationship row
        const relRes = await client.query(`SELECT * FROM patient_relationships WHERE id = $1 FOR UPDATE`, [relationshipId]);
        const rel = relRes.rows[0];
        if (!rel) {
            throw new AppError_1.AppError('RELATIONSHIP_NOT_FOUND', 'Care relationship not found', 404);
        }
        patientId = rel.patient_user_id;
        caregiverId = rel.related_user_id;
        // 3. Authority check
        if (caller.role === 'PATIENT') {
            if (caller.id !== rel.patient_user_id) {
                throw new AppError_1.AppError('FORBIDDEN', 'You are not authorized to decline this resignation', 403);
            }
        }
        else if (caller.role === 'FAMILY') {
            const famCheck = await client.query(`SELECT id FROM patient_relationships
         WHERE patient_user_id = $1 AND related_user_id = $2
           AND status = 'CONFIRMED'
           AND relationship_type IN ('GUARDIAN', 'FAMILY_CLOSE', 'FAMILY_EXTENDED')`, [rel.patient_user_id, caller.id]);
            if (!famCheck.rows[0]) {
                throw new AppError_1.AppError('FORBIDDEN', 'You do not have confirmed family authority over this patient', 403);
            }
        }
        else {
            throw new AppError_1.AppError('FORBIDDEN', 'Unauthorized to decline resignation', 403);
        }
        // 4. Verify relationship not ended
        if (rel.status === 'ENDED') {
            throw new AppError_1.AppError('RELATIONSHIP_ALREADY_ENDED', 'Care relationship is already ended', 409);
        }
        // 5. Mark resignation DECLINED (relationship stays active!)
        const resUpdate = await client.query(`UPDATE caregiver_resignation_requests
       SET status = 'DECLINED',
           responded_at = NOW(),
           responded_by = $1,
           notes = COALESCE($2, notes),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`, [caller.id, input?.notes || null, resignation.id]);
        updatedResignation = resUpdate.rows[0];
        // Fetch user names
        const usersRes = await client.query(`SELECT id, name FROM users WHERE id IN ($1, $2)`, [patientId, caregiverId]);
        for (const u of usersRes.rows) {
            if (u.id === patientId)
                patientName = u.name;
            if (u.id === caregiverId)
                caregiverName = u.name;
        }
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
    // 6. Post-Commit Event Dispatch
    try {
        const { createInAppNotification } = await Promise.resolve().then(() => __importStar(require('../notifications/notification.service')));
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        await createInAppNotification({
            userId: caregiverId,
            notificationType: 'CAREGIVER_RESIGNATION_DECLINED',
            priority: 'MEDIUM',
            title: 'Resignation Request Declined',
            body: `Your request to end care for ${patientName} was declined. Your care arrangement remains active.`,
            payload: {
                resignationId: updatedResignation.id,
                relationshipId,
                patientId,
                action: 'caregiver_resignation_declined',
            },
        });
        if (io) {
            io.to(`patient:${patientId}`).emit('resignation:change', {
                action: 'declined',
                resignationId: updatedResignation.id,
                relationshipId,
                status: 'DECLINED',
            });
            io.to(`user:${caregiverId}`).emit('resignation:change', {
                action: 'declined',
                resignationId: updatedResignation.id,
                relationshipId,
                status: 'DECLINED',
            });
        }
    }
    catch (notifyErr) {
        console.error('[declineResignationRequest] Failed to dispatch notifications:', notifyErr);
    }
    return updatedResignation;
}
/**
 * Caregiver withdraws a pending resignation request.
 * Resignation marks WITHDRAWN; relationship remains ACTIVE_CARE.
 */
async function withdrawResignationRequest(relationshipId, caller) {
    // Only caregiver can withdraw
    if (caller.role !== 'CAREGIVER') {
        throw new AppError_1.AppError('FORBIDDEN', 'Only the caregiver can withdraw their resignation request', 403);
    }
    const client = await config_1.default.connect();
    let updatedResignation;
    let patientName = 'Patient';
    let caregiverName = 'Caregiver';
    let patientId = '';
    try {
        await client.query('BEGIN');
        // 1. Lock resignation row
        const resRes = await client.query(`SELECT * FROM caregiver_resignation_requests
       WHERE relationship_id = $1 AND status = 'PENDING'
       FOR UPDATE`, [relationshipId]);
        const resignation = resRes.rows[0];
        if (!resignation) {
            throw new AppError_1.AppError('NO_PENDING_RESIGNATION', 'No pending resignation request to withdraw', 409);
        }
        // 2. Must be caller's resignation
        if (resignation.caregiver_id !== caller.id) {
            throw new AppError_1.AppError('FORBIDDEN', 'You can only withdraw your own resignation request', 403);
        }
        patientId = resignation.patient_id;
        // 3. Lock relationship row
        const relRes = await client.query(`SELECT * FROM patient_relationships WHERE id = $1 FOR UPDATE`, [relationshipId]);
        const rel = relRes.rows[0];
        if (rel && rel.status === 'ENDED') {
            throw new AppError_1.AppError('RELATIONSHIP_ALREADY_ENDED', 'Care relationship is already ended', 409);
        }
        // 4. Mark resignation WITHDRAWN (relationship stays active!)
        const resUpdate = await client.query(`UPDATE caregiver_resignation_requests
       SET status = 'WITHDRAWN',
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`, [resignation.id]);
        updatedResignation = resUpdate.rows[0];
        // Fetch user names
        const usersRes = await client.query(`SELECT id, name FROM users WHERE id IN ($1, $2)`, [patientId, caller.id]);
        for (const u of usersRes.rows) {
            if (u.id === patientId)
                patientName = u.name;
            if (u.id === caller.id)
                caregiverName = u.name;
        }
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
    // 5. Post-Commit Event Dispatch
    try {
        const { createInAppNotification } = await Promise.resolve().then(() => __importStar(require('../notifications/notification.service')));
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        await createInAppNotification({
            userId: patientId,
            notificationType: 'CAREGIVER_RESIGNATION_WITHDRAWN',
            priority: 'MEDIUM',
            title: 'Caregiver Withdrew Resignation',
            body: `${caregiverName} withdrew their request to end care. The care arrangement remains active.`,
            payload: {
                resignationId: updatedResignation.id,
                relationshipId,
                caregiverId: caller.id,
                action: 'caregiver_resignation_withdrawn',
            },
        });
        const famRes = await config_1.default.query(`SELECT related_user_id FROM patient_relationships
       WHERE patient_user_id = $1 AND status = 'CONFIRMED'
         AND relationship_type IN ('GUARDIAN', 'FAMILY_CLOSE', 'FAMILY_EXTENDED')`, [patientId]);
        for (const fRow of famRes.rows) {
            await createInAppNotification({
                userId: fRow.related_user_id,
                notificationType: 'CAREGIVER_RESIGNATION_WITHDRAWN',
                priority: 'MEDIUM',
                title: 'Caregiver Withdrew Resignation',
                body: `${caregiverName} withdrew their request to end care for ${patientName}. The care arrangement remains active.`,
                payload: {
                    resignationId: updatedResignation.id,
                    relationshipId,
                    patientId,
                    caregiverId: caller.id,
                    action: 'caregiver_resignation_withdrawn',
                },
            });
        }
        if (io) {
            io.to(`patient:${patientId}`).emit('resignation:change', {
                action: 'withdrawn',
                resignationId: updatedResignation.id,
                relationshipId,
                status: 'WITHDRAWN',
            });
            io.to(`user:${caller.id}`).emit('resignation:change', {
                action: 'withdrawn',
                resignationId: updatedResignation.id,
                relationshipId,
                status: 'WITHDRAWN',
            });
        }
    }
    catch (notifyErr) {
        console.error('[withdrawResignationRequest] Failed to dispatch notifications:', notifyErr);
    }
    return updatedResignation;
}
//# sourceMappingURL=care-relationships.service.js.map