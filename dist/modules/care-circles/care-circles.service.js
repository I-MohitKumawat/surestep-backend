"use strict";
/**
 * SureStep — modules/care-circles/care-circles.service.ts
 *
 * Core Care Circle lifecycle and membership coordination service.
 * Baselines:
 *   - docs/architecture/TARGET_ARCHITECTURE.md (Sections 3.2, 4.1, 4.2)
 *   - docs/workflows/03-CARE-CIRCLE.md (Sections 1, 4, 5)
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
exports.careCirclesService = exports.CareCirclesService = void 0;
const config_1 = __importDefault(require("../../db/config"));
const AppError_1 = require("../../shared/errors/AppError");
const socketRooms_1 = require("../../shared/realtime/socketRooms");
class CareCirclesService {
    /**
     * Create a new Care Circle.
     * Rules:
     *   - A Patient cannot create a Circle (03-CARE-CIRCLE.md §1).
     *   - Creator must be Family Member or Professional Caregiver.
     *   - A user can have only one active Care Circle in V1.
     *   - Creator becomes the Circle Owner with intrinsic authority.
     */
    async createCareCircle(ownerId, name) {
        const trimmedName = (name || '').trim();
        if (trimmedName.length < 2) {
            throw new AppError_1.AppError('INVALID_INPUT', 'Care Circle name must be at least 2 characters', 400);
        }
        // 1. Verify creator role
        const userRes = await config_1.default.query('SELECT id, role, is_active FROM users WHERE id = $1', [ownerId]);
        const user = userRes.rows[0];
        if (!user || !user.is_active) {
            throw new AppError_1.AppError('USER_NOT_FOUND', 'Active user not found', 404);
        }
        if (user.role === 'PATIENT') {
            throw new AppError_1.AppError('PATIENT_CANNOT_CREATE_CIRCLE', 'Patients cannot create or own a Care Circle', 403);
        }
        // 2. Check single active circle invariant
        // User cannot already own an active circle
        const existingOwned = await config_1.default.query('SELECT id FROM care_circles WHERE owner_id = $1 AND terminated_at IS NULL', [ownerId]);
        if (existingOwned.rows.length > 0) {
            throw new AppError_1.AppError('ACTIVE_CIRCLE_EXISTS', 'User already owns an active Care Circle. V1 permits only one active Circle per user.', 409);
        }
        // User cannot belong to an active circle as a member
        const existingMember = await config_1.default.query(`SELECT m.id FROM care_circle_members m
       JOIN care_circles c ON m.circle_id = c.id
       WHERE m.user_id = $1 AND c.terminated_at IS NULL`, [ownerId]);
        if (existingMember.rows.length > 0) {
            throw new AppError_1.AppError('ACTIVE_CIRCLE_EXISTS', 'User already belongs to an active Care Circle. V1 permits only one active Circle per user.', 409);
        }
        // 3. Create Circle and Owner Member in transaction
        const client = await config_1.default.connect();
        try {
            await client.query('BEGIN');
            const circleRes = await client.query(`INSERT INTO care_circles (name, owner_id)
         VALUES ($1, $2)
         RETURNING *`, [trimmedName, ownerId]);
            const circle = circleRes.rows[0];
            const memberRes = await client.query(`INSERT INTO care_circle_members (circle_id, user_id, role_in_circle)
         VALUES ($1, $2, 'OWNER')
         RETURNING *`, [circle.id, ownerId]);
            await client.query('COMMIT');
            await (0, socketRooms_1.syncUserSocketRooms)(ownerId);
            return {
                ...circle,
                membership: memberRes.rows[0],
            };
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * Get Care Circle details, verifying caller has access.
     */
    async getCareCircle(circleId, requestingUserId) {
        const circleRes = await config_1.default.query(`SELECT c.*, u.name as owner_name, u.email as owner_email, u.phone as owner_phone
       FROM care_circles c
       JOIN users u ON c.owner_id = u.id
       WHERE c.id = $1`, [circleId]);
        const circle = circleRes.rows[0];
        if (!circle) {
            throw new AppError_1.AppError('CIRCLE_NOT_FOUND', 'Care Circle not found', 404);
        }
        // Check membership / patient association. A Patient association takes precedence over
        // the generic membership row so Patient accounts are always identified as PATIENT.
        const memberCheck = await config_1.default.query(`SELECT COALESCE(
         (SELECT 'PATIENT' FROM patient_circle_associations
          WHERE circle_id = $1 AND patient_id = $2),
         (SELECT role_in_circle FROM care_circle_members
          WHERE circle_id = $1 AND user_id = $2)
       ) AS role_in_circle`, [circleId, requestingUserId]);
        if (!memberCheck.rows[0]?.role_in_circle) {
            throw new AppError_1.AppError('ACCESS_DENIED', 'You do not belong to this Care Circle', 403);
        }
        const members = await this.getCircleMembers(circleId);
        const patients = await this.getCirclePatients(circleId);
        return {
            ...circle,
            callerRole: memberCheck.rows[0].role_in_circle,
            members,
            patients,
        };
    }
    /**
     * Get user's active Care Circle (as Owner, Member, or Patient).
     */
    async getUserActiveCircle(userId) {
        // 1. Check if user is owner or non-Patient member of an active circle.
        // A Patient always resolves through the Patient-association branch even if a
        // generic membership row also exists.
        const memberQuery = await config_1.default.query(`SELECT c.*, m.id as member_id, m.role_in_circle
       FROM care_circles c
       JOIN care_circle_members m ON c.id = m.circle_id
       JOIN users u ON u.id = m.user_id
       WHERE m.user_id = $1 AND c.terminated_at IS NULL AND u.role <> 'PATIENT'
       LIMIT 1`, [userId]);
        if (memberQuery.rows.length > 0) {
            const circle = memberQuery.rows[0];
            const members = await this.getCircleMembers(circle.id);
            const patients = await this.getCirclePatients(circle.id);
            return {
                ...circle,
                callerRole: circle.role_in_circle,
                members,
                patients,
            };
        }
        // 2. Check if user is an associated patient of an active circle
        const patientQuery = await config_1.default.query(`SELECT c.*, pca.id as association_id, 'PATIENT' as role_in_circle
       FROM care_circles c
       JOIN patient_circle_associations pca ON c.id = pca.circle_id
       WHERE pca.patient_id = $1 AND c.terminated_at IS NULL
       LIMIT 1`, [userId]);
        if (patientQuery.rows.length > 0) {
            const circle = patientQuery.rows[0];
            const members = await this.getCircleMembers(circle.id);
            const patients = await this.getCirclePatients(circle.id);
            return {
                ...circle,
                callerRole: 'PATIENT',
                members,
                patients,
            };
        }
        return null;
    }
    /**
     * Update Care Circle name (Circle Owner only).
     */
    async updateCareCircleName(circleId, actorId, name) {
        const trimmedName = (name || '').trim();
        if (trimmedName.length < 2) {
            throw new AppError_1.AppError('INVALID_INPUT', 'Care Circle name must be at least 2 characters', 400);
        }
        const circleRes = await config_1.default.query('SELECT owner_id, terminated_at FROM care_circles WHERE id = $1', [circleId]);
        const circle = circleRes.rows[0];
        if (!circle) {
            throw new AppError_1.AppError('CIRCLE_NOT_FOUND', 'Care Circle not found', 404);
        }
        if (circle.terminated_at) {
            throw new AppError_1.AppError('CIRCLE_TERMINATED', 'Cannot modify a terminated Care Circle', 400);
        }
        if (circle.owner_id !== actorId) {
            throw new AppError_1.AppError('OWNER_ONLY', 'Only the Circle Owner can modify the Care Circle name', 403);
        }
        const updateRes = await config_1.default.query(`UPDATE care_circles SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [trimmedName, circleId]);
        return updateRes.rows[0];
    }
    /**
     * Terminate a Care Circle (Circle Owner only).
     * Rules:
     *   - Sets terminated_at = NOW().
     *   - Automatically ends active caregiver relationships.
     *   - Deactivates active patient assignments.
     *   - Revokes active invitations and pending join requests.
     */
    async terminateCareCircle(circleId, actorId) {
        const circleRes = await config_1.default.query('SELECT owner_id, terminated_at FROM care_circles WHERE id = $1', [circleId]);
        const circle = circleRes.rows[0];
        if (!circle) {
            throw new AppError_1.AppError('CIRCLE_NOT_FOUND', 'Care Circle not found', 404);
        }
        if (circle.terminated_at) {
            throw new AppError_1.AppError('CIRCLE_ALREADY_TERMINATED', 'Care Circle is already terminated', 400);
        }
        if (circle.owner_id !== actorId) {
            throw new AppError_1.AppError('OWNER_ONLY', 'Only the Circle Owner can terminate the Care Circle', 403);
        }
        const client = await config_1.default.connect();
        try {
            await client.query('BEGIN');
            // 1. Mark circle terminated
            const res = await client.query(`UPDATE care_circles SET terminated_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`, [circleId]);
            // 2. Terminate active caregiver relationships
            await client.query(`UPDATE caregiver_relationships
         SET status = 'TERMINATED', ended_at = NOW(), termination_reason = 'CIRCLE_TERMINATED'
         WHERE circle_id = $1 AND status != 'TERMINATED'`, [circleId]);
            // 3. Deactivate patient assignments belonging to relationships of this circle
            await client.query(`UPDATE patient_assignments
         SET is_active = FALSE
         WHERE relationship_id IN (SELECT id FROM caregiver_relationships WHERE circle_id = $1)`, [circleId]);
            // 4. Revoke active invitations
            await client.query(`UPDATE circle_invitations SET status = 'REVOKED' WHERE circle_id = $1 AND status = 'ACTIVE'`, [circleId]);
            // 5. Cancel pending join requests
            await client.query(`UPDATE circle_join_requests SET status = 'REJECTED', reviewed_at = NOW() WHERE circle_id = $1 AND status = 'PENDING'`, [circleId]);
            // 6. Deactivate Circle-owned Safe Zones
            await client.query(`UPDATE safe_zones SET is_active = FALSE, updated_at = NOW() WHERE circle_id = $1 AND is_active = TRUE`, [circleId]);
            await client.query('COMMIT');
            // Every participant loses Circle-derived rooms and Patient access immediately.
            await (0, socketRooms_1.syncCircleSocketRooms)(circleId);
            return res.rows[0];
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * Remove a Patient from all Circle Safe Zone monitoring configuration.
     * Zones with no remaining monitored Patients are deactivated but retained
     * (08-LOCATION-AND-SAFE-ZONES.md §7).
     */
    async detachPatientFromSafeZones(client, circleId, patientId) {
        await client.query(`DELETE FROM safe_zone_monitors
       WHERE patient_id = $1
         AND safe_zone_id IN (SELECT id FROM safe_zones WHERE circle_id = $2)`, [patientId, circleId]);
        await client.query(`UPDATE safe_zones z
       SET is_active = FALSE, updated_at = NOW()
       WHERE z.circle_id = $1
         AND z.is_active = TRUE
         AND NOT EXISTS (
           SELECT 1 FROM safe_zone_monitors szm WHERE szm.safe_zone_id = z.id
         )`, [circleId]);
    }
    /**
     * List members of a Care Circle with their user profile info and granted canonical permissions.
     */
    async getCircleMembers(circleId) {
        const res = await config_1.default.query(`SELECT m.id, m.id as member_id, m.circle_id, m.user_id, m.role_in_circle, m.joined_at,
              u.name, u.email, u.phone, u.role as user_global_role, u.photo_url,
              CASE
                WHEN m.role_in_circle = 'OWNER' OR c.owner_id = m.user_id THEN
                  json_build_array(
                    json_build_object('permission_name', 'Manage Member Permissions'),
                    json_build_object('permission_name', 'Manage Caregiver Relationships'),
                    json_build_object('permission_name', 'Search/Request Caregivers'),
                    json_build_object('permission_name', 'Manage Patient Memories')
                  )
                ELSE
                  COALESCE(
                    json_agg(
                      json_build_object('id', p.id, 'permission_name', p.permission_name, 'granted_at', p.granted_at)
                    ) FILTER (WHERE p.id IS NOT NULL),
                    '[]'::json
                  )
              END as permissions
       FROM care_circle_members m
       JOIN care_circles c ON m.circle_id = c.id
       JOIN users u ON m.user_id = u.id
       LEFT JOIN circle_permissions p ON m.id = p.member_id
       WHERE m.circle_id = $1
       GROUP BY m.id, c.owner_id, u.id
       ORDER BY m.joined_at ASC`, [circleId]);
        return res.rows.map((row) => {
            const records = Array.isArray(row.permissions) ? row.permissions : [];
            return {
                ...row,
                id: row.member_id || row.id,
                is_owner: row.role_in_circle === 'OWNER',
                permissions: records.map((p) => p.permission_name).filter(Boolean),
                permission_records: records,
            };
        });
    }
    /**
     * List Patients associated with a Care Circle.
     */
    async getCirclePatients(circleId) {
        const res = await config_1.default.query(`SELECT u.id, u.id as patient_id, pca.id as association_id, pca.circle_id, pca.associated_at,
              u.name, u.email, u.phone, u.photo_url, u.date_of_birth, u.gender,
              ps.safety_state, ps.last_known_lat, ps.last_known_lng, ps.last_ping_at
       FROM patient_circle_associations pca
       JOIN users u ON pca.patient_id = u.id
       LEFT JOIN patient_states ps ON ps.patient_id = u.id
       WHERE pca.circle_id = $1
       ORDER BY pca.associated_at ASC`, [circleId]);
        return res.rows;
    }
    /**
     * Remove a member from a Care Circle.
     * Actor must be Circle Owner OR member holding 'Manage Member Permissions'.
     * Cannot remove the Circle Owner.
     * Atomically terminates caregiver relationships and deactivates assignments if target is a caregiver.
     */
    async removeCircleMember(circleId, actorId, memberIdToRemove) {
        const client = await config_1.default.connect();
        try {
            await client.query('BEGIN');
            // 1. Fetch circle
            const circleRes = await client.query('SELECT owner_id, terminated_at FROM care_circles WHERE id = $1 FOR UPDATE', [circleId]);
            const circle = circleRes.rows[0];
            if (!circle || circle.terminated_at) {
                throw new AppError_1.AppError('CIRCLE_NOT_FOUND', 'Active Care Circle not found', 404);
            }
            // 2. Fetch target member
            const targetRes = await client.query('SELECT id, user_id, role_in_circle FROM care_circle_members WHERE id = $1 AND circle_id = $2 FOR UPDATE', [memberIdToRemove, circleId]);
            const targetMember = targetRes.rows[0];
            if (!targetMember) {
                throw new AppError_1.AppError('MEMBER_NOT_FOUND', 'Circle member not found', 404);
            }
            // Target cannot be the Owner
            if (targetMember.role_in_circle === 'OWNER' || targetMember.user_id === circle.owner_id) {
                throw new AppError_1.AppError('CANNOT_REMOVE_OWNER', 'The Circle Owner cannot be removed from the Care Circle', 403);
            }
            // 3. Authorization check
            if (circle.owner_id !== actorId) {
                const permRes = await client.query(`SELECT p.id FROM circle_permissions p
           JOIN care_circle_members m ON p.member_id = m.id
           WHERE m.circle_id = $1 AND m.user_id = $2 AND p.permission_name = 'Manage Member Permissions'`, [circleId, actorId]);
                if (permRes.rows.length === 0) {
                    throw new AppError_1.AppError('FORBIDDEN', 'Only the Circle Owner or a member with "Manage Member Permissions" can remove members', 403);
                }
            }
            const targetUserRes = await client.query('SELECT role FROM users WHERE id = $1', [targetMember.user_id]);
            const targetRole = targetUserRes.rows[0]?.role;
            if (targetRole === 'CAREGIVER' || targetMember.role_in_circle === 'CAREGIVER') {
                await client.query(`UPDATE caregiver_relationships
           SET status = 'TERMINATED', ended_at = NOW(), termination_reason = 'MEMBER_REMOVED'
           WHERE circle_id = $1 AND caregiver_id = $2 AND status != 'TERMINATED'`, [circleId, targetMember.user_id]);
                await client.query(`UPDATE patient_assignments
           SET is_active = FALSE
           WHERE relationship_id IN (
             SELECT id FROM caregiver_relationships WHERE circle_id = $1 AND caregiver_id = $2
           )`, [circleId, targetMember.user_id]);
            }
            if (targetRole === 'PATIENT') {
                await client.query(`UPDATE patient_assignments
           SET is_active = FALSE
           WHERE patient_id = $1
             AND relationship_id IN (SELECT id FROM caregiver_relationships WHERE circle_id = $2)`, [targetMember.user_id, circleId]);
                await this.detachPatientFromSafeZones(client, circleId, targetMember.user_id);
                await client.query(`DELETE FROM patient_circle_associations WHERE circle_id = $1 AND patient_id = $2`, [circleId, targetMember.user_id]);
            }
            await client.query('DELETE FROM circle_permissions WHERE member_id = $1', [memberIdToRemove]);
            await client.query('DELETE FROM care_circle_members WHERE id = $1', [memberIdToRemove]);
            await client.query('COMMIT');
            await (0, socketRooms_1.syncUserSocketRooms)(targetMember.user_id);
            try {
                const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
                io.to(`user:${targetMember.user_id}`).emit('circle:member_removed', {
                    circleId,
                    memberId: memberIdToRemove,
                    userId: targetMember.user_id,
                    removedBy: actorId,
                    removedAt: new Date().toISOString(),
                });
                io.to(`circle:${circleId}`).emit('circle:member_removed', {
                    circleId,
                    memberId: memberIdToRemove,
                    userId: targetMember.user_id,
                    removedBy: actorId,
                    removedAt: new Date().toISOString(),
                });
            }
            catch (_) { }
            return { success: true, removedMemberId: memberIdToRemove };
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * Transfer Care Circle ownership (03-CARE-CIRCLE.md §12).
     * Rules:
     *   - Only current Circle Owner can transfer.
     *   - Recipient must be an active member of this Care Circle.
     *   - Recipient must not be a Patient.
     *   - New Owner receives intrinsic Owner authority (no permission row).
     *   - Previous Owner becomes a regular MEMBER.
     *   - Circle remains with exactly one Owner.
     */
    async transferOwnership(circleId, currentOwnerId, newOwnerId) {
        if (!newOwnerId || typeof newOwnerId !== 'string') {
            throw new AppError_1.AppError('VALIDATION_ERROR', 'newOwnerId is required', 400);
        }
        if (currentOwnerId === newOwnerId) {
            throw new AppError_1.AppError('INVALID_RECIPIENT', 'New owner must be different from current owner', 400);
        }
        const client = await config_1.default.connect();
        try {
            await client.query('BEGIN');
            // 1. Fetch and lock circle
            const circleRes = await client.query('SELECT id, owner_id, terminated_at FROM care_circles WHERE id = $1 FOR UPDATE', [circleId]);
            const circle = circleRes.rows[0];
            if (!circle) {
                throw new AppError_1.AppError('CIRCLE_NOT_FOUND', 'Care Circle not found', 404);
            }
            if (circle.terminated_at) {
                throw new AppError_1.AppError('CIRCLE_TERMINATED', 'Cannot transfer ownership of a terminated Care Circle', 400);
            }
            if (circle.owner_id !== currentOwnerId) {
                throw new AppError_1.AppError('OWNER_ONLY', 'Only the current Circle Owner can transfer ownership', 403);
            }
            // 2. Fetch and validate recipient user
            const userRes = await client.query('SELECT id, role FROM users WHERE id = $1', [newOwnerId]);
            const recipientUser = userRes.rows[0];
            if (!recipientUser) {
                throw new AppError_1.AppError('USER_NOT_FOUND', 'Recipient user not found', 404);
            }
            if (recipientUser.role === 'PATIENT') {
                throw new AppError_1.AppError('INVALID_RECIPIENT', 'Care Circle ownership cannot be transferred to a Patient', 400);
            }
            // 3. Verify recipient is an active member in this circle
            const memberRes = await client.query('SELECT id, role_in_circle FROM care_circle_members WHERE circle_id = $1 AND user_id = $2 FOR UPDATE', [circleId, newOwnerId]);
            const recipientMember = memberRes.rows[0];
            if (!recipientMember) {
                throw new AppError_1.AppError('MEMBER_NOT_FOUND', 'Recipient must be an active member of this Care Circle', 400);
            }
            // 4. Update circle owner
            await client.query('UPDATE care_circles SET owner_id = $1, updated_at = NOW() WHERE id = $2', [newOwnerId, circleId]);
            // 5. Update recipient's role in circle to OWNER
            await client.query(`UPDATE care_circle_members SET role_in_circle = 'OWNER' WHERE id = $1`, [recipientMember.id]);
            // Remove any delegated permission rows for the new owner (intrinsic authority)
            await client.query('DELETE FROM circle_permissions WHERE member_id = $1', [recipientMember.id]);
            // 6. Ensure previous owner becomes regular MEMBER
            const oldOwnerMemberRes = await client.query('SELECT id FROM care_circle_members WHERE circle_id = $1 AND user_id = $2', [circleId, currentOwnerId]);
            if (oldOwnerMemberRes.rows[0]) {
                await client.query(`UPDATE care_circle_members SET role_in_circle = 'MEMBER' WHERE id = $1`, [oldOwnerMemberRes.rows[0].id]);
            }
            else {
                await client.query(`INSERT INTO care_circle_members (circle_id, user_id, role_in_circle, joined_at)
           VALUES ($1, $2, 'MEMBER', NOW())`, [circleId, currentOwnerId]);
            }
            await client.query('COMMIT');
            await Promise.all([
                (0, socketRooms_1.syncUserSocketRooms)(currentOwnerId),
                (0, socketRooms_1.syncUserSocketRooms)(newOwnerId),
            ]);
            try {
                const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
                io.to(`circle:${circleId}`).emit('circle:ownership_transferred', {
                    circleId,
                    previousOwnerId: currentOwnerId,
                    newOwnerId,
                    transferredAt: new Date().toISOString(),
                });
            }
            catch (_) { }
            return {
                success: true,
                circleId,
                previousOwnerId: currentOwnerId,
                newOwnerId,
            };
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * Voluntarily leave a Care Circle (03-CARE-CIRCLE.md §13).
     * Rules:
     *   - Non-owner members can leave.
     *   - Circle Owner cannot leave without transferring ownership or terminating the Circle.
     *   - Leaves and immediately revokes permissions.
     *   - If member is a caregiver, terminates relationship and deactivates assignments.
     */
    async leaveCircle(circleId, userId) {
        const client = await config_1.default.connect();
        try {
            await client.query('BEGIN');
            // 1. Fetch circle
            const circleRes = await client.query('SELECT id, owner_id, terminated_at FROM care_circles WHERE id = $1 FOR UPDATE', [circleId]);
            const circle = circleRes.rows[0];
            if (!circle) {
                throw new AppError_1.AppError('CIRCLE_NOT_FOUND', 'Care Circle not found', 404);
            }
            if (circle.terminated_at) {
                throw new AppError_1.AppError('CIRCLE_TERMINATED', 'Care Circle is terminated', 400);
            }
            // Owner cannot leave without transfer or termination
            if (circle.owner_id === userId) {
                throw new AppError_1.AppError('OWNER_CANNOT_LEAVE', 'The Circle Owner cannot leave the Care Circle. You must transfer ownership or terminate the Care Circle.', 400);
            }
            // 2. Fetch member (Patients may predate the generic membership row and exist only
            // as a Patient-Circle association, which is sufficient to leave).
            const memberRes = await client.query('SELECT id, user_id, role_in_circle FROM care_circle_members WHERE circle_id = $1 AND user_id = $2 FOR UPDATE', [circleId, userId]);
            const member = memberRes.rows[0];
            const userRes = await client.query('SELECT role FROM users WHERE id = $1', [userId]);
            const userRole = userRes.rows[0]?.role;
            const assocRes = await client.query('SELECT id FROM patient_circle_associations WHERE circle_id = $1 AND patient_id = $2 FOR UPDATE', [circleId, userId]);
            const hasAssociation = assocRes.rows.length > 0;
            if (!member && !hasAssociation) {
                throw new AppError_1.AppError('MEMBER_NOT_FOUND', 'You are not a member of this Care Circle', 404);
            }
            const isPatient = userRole === 'PATIENT' || hasAssociation;
            if (!isPatient && !member) {
                throw new AppError_1.AppError('MEMBER_NOT_FOUND', 'You are not a member of this Care Circle', 404);
            }
            // 3. If caregiver, terminate relationship and deactivate assignments
            await client.query(`UPDATE caregiver_relationships
         SET status = 'TERMINATED', ended_at = NOW(), termination_reason = 'CAREGIVER_DEPARTED'
         WHERE circle_id = $1 AND caregiver_id = $2 AND status != 'TERMINATED'`, [circleId, userId]);
            await client.query(`UPDATE patient_assignments
         SET is_active = FALSE
         WHERE relationship_id IN (
           SELECT id FROM caregiver_relationships WHERE circle_id = $1 AND caregiver_id = $2
         )`, [circleId, userId]);
            if (isPatient) {
                await client.query(`UPDATE patient_assignments
           SET is_active = FALSE
           WHERE patient_id = $1
             AND relationship_id IN (SELECT id FROM caregiver_relationships WHERE circle_id = $2)`, [userId, circleId]);
                await this.detachPatientFromSafeZones(client, circleId, userId);
                await client.query(`DELETE FROM patient_circle_associations WHERE circle_id = $1 AND patient_id = $2`, [circleId, userId]);
            }
            if (member) {
                await client.query('DELETE FROM circle_permissions WHERE member_id = $1', [member.id]);
                await client.query('DELETE FROM care_circle_members WHERE id = $1', [member.id]);
            }
            await client.query('COMMIT');
            await (0, socketRooms_1.syncUserSocketRooms)(userId);
            try {
                const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
                io.to(`user:${userId}`).emit('circle:member_left', {
                    circleId,
                    userId,
                    leftAt: new Date().toISOString(),
                });
                io.to(`circle:${circleId}`).emit('circle:member_left', {
                    circleId,
                    userId,
                    leftAt: new Date().toISOString(),
                });
            }
            catch (_) { }
            return { success: true, message: 'Successfully left the Care Circle' };
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
}
exports.CareCirclesService = CareCirclesService;
exports.careCirclesService = new CareCirclesService();
//# sourceMappingURL=care-circles.service.js.map