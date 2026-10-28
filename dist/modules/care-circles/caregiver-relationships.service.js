"use strict";
/**
 * SureStep — modules/care-circles/caregiver-relationships.service.ts
 *
 * Caregiver Contractual Relationship Lifecycle Service with 7-Day Notice Period.
 * Baselines:
 *   - docs/architecture/TARGET_ARCHITECTURE.md (Sections 3.3, 5.1)
 *   - docs/workflows/06-CAREGIVER-RELATIONSHIP.md (Sections 2, 5, 10, 11, 12, 13, 16)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.caregiverRelationshipsService = exports.CaregiverRelationshipsService = void 0;
const config_1 = __importDefault(require("../../db/config"));
const AppError_1 = require("../../shared/errors/AppError");
class CaregiverRelationshipsService {
    /**
     * Establish a formal Caregiver Relationship.
     * Actor must be Circle Owner or hold 'Manage Caregiver Relationships'.
     * Caregiver must already be a member of the Care Circle (role_in_circle = 'CAREGIVER').
     */
    async establishRelationship(circleId, actorId, caregiverId) {
        // 1. Verify Circle is active
        const circleRes = await config_1.default.query('SELECT owner_id, terminated_at FROM care_circles WHERE id = $1', [circleId]);
        const circle = circleRes.rows[0];
        if (!circle || circle.terminated_at) {
            throw new AppError_1.AppError('CIRCLE_NOT_FOUND', 'Active Care Circle not found', 404);
        }
        // 2. Verify actor has 'Manage Caregiver Relationships' authority
        await this.assertCanManageCaregivers(circleId, actorId, circle.owner_id);
        // 3. Verify caregiver is a member of the Circle
        const memberRes = await config_1.default.query(`SELECT id, role_in_circle FROM care_circle_members
       WHERE circle_id = $1 AND user_id = $2`, [circleId, caregiverId]);
        const member = memberRes.rows[0];
        if (!member) {
            throw new AppError_1.AppError('CAREGIVER_NOT_CIRCLE_MEMBER', 'Caregiver must join the Care Circle before establishing a relationship', 400);
        }
        // 4. Verify caregiver user role is CAREGIVER
        const userRes = await config_1.default.query('SELECT role, is_active FROM users WHERE id = $1', [caregiverId]);
        const user = userRes.rows[0];
        if (!user || user.role !== 'CAREGIVER' || !user.is_active) {
            throw new AppError_1.AppError('INVALID_CAREGIVER', 'Target user is not an active Professional Caregiver', 400);
        }
        // 5. Check if an active/notice/suspended relationship already exists
        const existingRel = await config_1.default.query(`SELECT id, status FROM caregiver_relationships
       WHERE circle_id = $1 AND caregiver_id = $2 AND status != 'TERMINATED'`, [circleId, caregiverId]);
        if (existingRel.rows.length > 0) {
            throw new AppError_1.AppError('RELATIONSHIP_ALREADY_EXISTS', `An active caregiver relationship already exists with status: ${existingRel.rows[0].status}`, 409);
        }
        // 6. Insert new relationship in ACTIVE status
        const insertRes = await config_1.default.query(`INSERT INTO caregiver_relationships (circle_id, caregiver_id, status)
       VALUES ($1, $2, 'ACTIVE')
       RETURNING *`, [circleId, caregiverId]);
        return insertRes.rows[0];
    }
    /**
     * Suspend an active Caregiver Relationship.
     * Actor must be Circle Owner or hold 'Manage Caregiver Relationships'.
     * Deactivates all patient assignments.
     */
    async suspendRelationship(relationshipId, actorId) {
        const rel = await this.getRelationshipWithCircle(relationshipId);
        await this.assertCanManageCaregivers(rel.circle_id, actorId, rel.owner_id);
        if (rel.status !== 'ACTIVE') {
            throw new AppError_1.AppError('INVALID_STATE', `Only ACTIVE relationships can be suspended (current: ${rel.status})`, 400);
        }
        const client = await config_1.default.connect();
        try {
            await client.query('BEGIN');
            const updateRes = await client.query(`UPDATE caregiver_relationships
         SET status = 'SUSPENDED'
         WHERE id = $1
         RETURNING *`, [relationshipId]);
            // Deactivate active assignments
            await client.query(`UPDATE patient_assignments
         SET is_active = FALSE
         WHERE relationship_id = $1`, [relationshipId]);
            await client.query('COMMIT');
            return updateRes.rows[0];
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
     * Restore a suspended Caregiver Relationship to ACTIVE.
     * Actor must be Circle Owner or hold 'Manage Caregiver Relationships'.
     * Re-activates patient assignments.
     */
    async restoreRelationship(relationshipId, actorId) {
        const rel = await this.getRelationshipWithCircle(relationshipId);
        await this.assertCanManageCaregivers(rel.circle_id, actorId, rel.owner_id);
        if (rel.status !== 'SUSPENDED') {
            throw new AppError_1.AppError('INVALID_STATE', `Only SUSPENDED relationships can be restored (current: ${rel.status})`, 400);
        }
        const client = await config_1.default.connect();
        try {
            await client.query('BEGIN');
            const updateRes = await client.query(`UPDATE caregiver_relationships
         SET status = 'ACTIVE'
         WHERE id = $1
         RETURNING *`, [relationshipId]);
            // Restore assignments
            await client.query(`UPDATE patient_assignments
         SET is_active = TRUE
         WHERE relationship_id = $1`, [relationshipId]);
            await client.query('COMMIT');
            return updateRes.rows[0];
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
     * Caregiver initiates departure and enters Notice Period (or immediate safety exception).
     * Rules (06-CAREGIVER-RELATIONSHIP.md §16):
     *   - Caregiver-initiated voluntary departure.
     *   - Not an interactive approval workflow; Circle cannot decline departure.
     *   - Standard notice lasts exactly 7 days (7 * 24h).
     *   - Care access remains preserved during the 7-day notice period.
     *   - If safety exception: immediately TERMINATED and access revoked.
     */
    async submitNotice(relationshipId, caregiverUserId, dto) {
        const rel = await this.getRelationshipWithCircle(relationshipId);
        if (rel.caregiver_id !== caregiverUserId) {
            throw new AppError_1.AppError('FORBIDDEN', 'Only the caregiver themselves can initiate departure notice', 403);
        }
        if (rel.status !== 'ACTIVE') {
            throw new AppError_1.AppError('INVALID_STATE', `Notice can only be submitted for ACTIVE relationships (current: ${rel.status})`, 400);
        }
        const reason = dto.reason ? dto.reason.slice(0, 64) : 'CAREGIVER_INITIATED_DEPARTURE';
        // 1. Immediate safety exception check
        if (dto.isSafetyException) {
            const client = await config_1.default.connect();
            try {
                await client.query('BEGIN');
                const termRes = await client.query(`UPDATE caregiver_relationships
           SET status = 'TERMINATED', ended_at = NOW(), termination_reason = 'SAFETY_EXCEPTION', termination_notes = $1
           WHERE id = $2
           RETURNING *`, [dto.reason || 'Immediate safety exception departure', relationshipId]);
                await client.query('UPDATE patient_assignments SET is_active = FALSE WHERE relationship_id = $1', [relationshipId]);
                await client.query('COMMIT');
                return termRes.rows[0];
            }
            catch (err) {
                await client.query('ROLLBACK');
                throw err;
            }
            finally {
                client.release();
            }
        }
        // 2. Standard 7-day Notice Period
        const noticeStartedAt = new Date();
        const noticeExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // exactly 7 days
        const updateRes = await config_1.default.query(`UPDATE caregiver_relationships
       SET status = 'NOTICE_PERIOD',
           notice_started_at = $1,
           notice_expires_at = $2,
           termination_reason = $3
       WHERE id = $4
       RETURNING *`, [noticeStartedAt.toISOString(), noticeExpiresAt.toISOString(), reason, relationshipId]);
        return updateRes.rows[0];
    }
    /**
     * Immediate termination (Family-initiated or safety reason).
     * Actor must be Circle Owner or hold 'Manage Caregiver Relationships'.
     * Can terminate an ACTIVE, SUSPENDED, or NOTICE_PERIOD relationship.
     * Immediately deactivates patient assignments.
     */
    async terminateImmediate(relationshipId, actorId, dto) {
        const rel = await this.getRelationshipWithCircle(relationshipId);
        await this.assertCanManageCaregivers(rel.circle_id, actorId, rel.owner_id);
        if (rel.status === 'TERMINATED') {
            throw new AppError_1.AppError('ALREADY_TERMINATED', 'Relationship is already terminated', 400);
        }
        const reason = dto.reason ? dto.reason.slice(0, 64) : 'TERMINATED_BY_FAMILY';
        const notes = dto.notes ? dto.notes.slice(0, 1000) : null;
        const client = await config_1.default.connect();
        try {
            await client.query('BEGIN');
            const termRes = await client.query(`UPDATE caregiver_relationships
         SET status = 'TERMINATED', ended_at = NOW(), termination_reason = $1, termination_notes = $2
         WHERE id = $3
         RETURNING *`, [reason, notes, relationshipId]);
            await client.query('UPDATE patient_assignments SET is_active = FALSE WHERE relationship_id = $1', [relationshipId]);
            await client.query('COMMIT');
            return termRes.rows[0];
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
     * Periodic check / worker: Automatically transitions NOTICE_PERIOD relationships
     * past their 7-day notice_expires_at to TERMINATED and revokes assignments.
     */
    async processExpiredNotices() {
        const client = await config_1.default.connect();
        try {
            await client.query('BEGIN');
            const expiredRes = await client.query(`UPDATE caregiver_relationships
         SET status = 'TERMINATED', ended_at = NOW(), termination_reason = 'NOTICE_PERIOD_EXPIRED'
         WHERE status = 'NOTICE_PERIOD' AND notice_expires_at <= NOW()
         RETURNING id`);
            const expiredIds = expiredRes.rows.map((r) => r.id);
            if (expiredIds.length > 0) {
                await client.query(`UPDATE patient_assignments
           SET is_active = FALSE
           WHERE relationship_id = ANY($1::uuid[])`, [expiredIds]);
            }
            await client.query('COMMIT');
            return { transitionedCount: expiredIds.length, expiredIds };
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
     * List Caregiver Relationships in a Care Circle with their assignments.
     */
    async listCircleCaregivers(circleId) {
        const res = await config_1.default.query(`SELECT cr.*, u.name as caregiver_name, u.email as caregiver_email, u.phone as caregiver_phone, u.photo_url,
              COALESCE(
                json_agg(
                  json_build_object(
                    'assignment_id', pa.id,
                    'patient_id', pa.patient_id,
                    'patient_name', pu.name,
                    'is_active', pa.is_active,
                    'assigned_at', pa.assigned_at
                  )
                ) FILTER (WHERE pa.id IS NOT NULL),
                '[]'::json
              ) as assignments
       FROM caregiver_relationships cr
       JOIN users u ON cr.caregiver_id = u.id
       LEFT JOIN patient_assignments pa ON cr.id = pa.relationship_id
       LEFT JOIN users pu ON pa.patient_id = pu.id
       WHERE cr.circle_id = $1
       GROUP BY cr.id, u.id
       ORDER BY cr.created_at ASC`, [circleId]);
        return res.rows;
    }
    /**
     * Helper: Get relationship and circle owner.
     */
    async getRelationshipWithCircle(relationshipId) {
        const res = await config_1.default.query(`SELECT cr.*, c.owner_id, c.terminated_at as circle_terminated_at
       FROM caregiver_relationships cr
       JOIN care_circles c ON cr.circle_id = c.id
       WHERE cr.id = $1`, [relationshipId]);
        const row = res.rows[0];
        if (!row || row.circle_terminated_at) {
            throw new AppError_1.AppError('RELATIONSHIP_NOT_FOUND', 'Caregiver relationship not found or circle terminated', 404);
        }
        return row;
    }
    /**
     * Helper: Assert actor is Circle Owner OR holds 'Manage Caregiver Relationships'.
     */
    async assertCanManageCaregivers(circleId, actorId, ownerId) {
        if (actorId === ownerId) {
            return; // Intrinsic Owner authority
        }
        const permRes = await config_1.default.query(`SELECT p.id FROM circle_permissions p
       JOIN care_circle_members m ON p.member_id = m.id
       WHERE m.circle_id = $1 AND m.user_id = $2 AND p.permission_name = 'Manage Caregiver Relationships'`, [circleId, actorId]);
        if (permRes.rows.length === 0) {
            throw new AppError_1.AppError('FORBIDDEN', 'Only the Circle Owner or a member with "Manage Caregiver Relationships" can perform this action', 403);
        }
    }
}
exports.CaregiverRelationshipsService = CaregiverRelationshipsService;
exports.caregiverRelationshipsService = new CaregiverRelationshipsService();
//# sourceMappingURL=caregiver-relationships.service.js.map