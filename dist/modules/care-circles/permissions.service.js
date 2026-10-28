"use strict";
/**
 * SureStep — modules/care-circles/permissions.service.ts
 *
 * Canonical Delegated Permissions Service.
 * Baselines:
 *   - docs/architecture/TARGET_ARCHITECTURE.md (Sections 3.2, 4.1, 4.2)
 *   - docs/workflows/03-CARE-CIRCLE.md (Sections 9, 10)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.permissionsService = exports.PermissionsService = void 0;
const config_1 = __importDefault(require("../../db/config"));
const AppError_1 = require("../../shared/errors/AppError");
const care_circles_types_1 = require("./care-circles.types");
class PermissionsService {
    /**
     * Grant a canonical delegated permission to a Circle member.
     * Invariants (03-CARE-CIRCLE.md §9):
     *   - Strictly the 4 canonical permissions can be delegated.
     *   - Owner authority is intrinsic; no permission rows for Owner.
     *   - A member with 'Manage Member Permissions' cannot grant permissions to themselves.
     *   - A member cannot grant a permission that the granting actor does not possess.
     *   - Only the Circle Owner can grant 'Manage Member Permissions' itself.
     */
    async grantPermission(circleId, actorId, targetMemberId, permissionName) {
        // 1. Validate permission name
        if (!care_circles_types_1.CANONICAL_PERMISSIONS.includes(permissionName)) {
            throw new AppError_1.AppError('INVALID_PERMISSION', `"${permissionName}" is not one of the 4 canonical delegatable permissions`, 400);
        }
        // 2. Fetch Circle and Owner
        const circleRes = await config_1.default.query('SELECT owner_id, terminated_at FROM care_circles WHERE id = $1', [circleId]);
        const circle = circleRes.rows[0];
        if (!circle || circle.terminated_at) {
            throw new AppError_1.AppError('CIRCLE_NOT_FOUND', 'Active Care Circle not found', 404);
        }
        // 3. Fetch target member
        const targetRes = await config_1.default.query('SELECT id, user_id, role_in_circle FROM care_circle_members WHERE id = $1 AND circle_id = $2', [targetMemberId, circleId]);
        const targetMember = targetRes.rows[0];
        if (!targetMember) {
            throw new AppError_1.AppError('MEMBER_NOT_FOUND', 'Target member not found in this Care Circle', 404);
        }
        // Target cannot be the Circle Owner (Owner authority is intrinsic)
        if (targetMember.role_in_circle === 'OWNER' || targetMember.user_id === circle.owner_id) {
            throw new AppError_1.AppError('OWNER_INTRINSIC_AUTHORITY', 'Circle Owner has intrinsic authority and does not receive permission rows', 400);
        }
        // 4. Verify granting actor authority
        const isOwner = actorId === circle.owner_id;
        if (!isOwner) {
            // Actor is a delegated member
            // Rule: Member cannot grant permissions to themselves
            if (actorId === targetMember.user_id) {
                throw new AppError_1.AppError('SELF_GRANT_FORBIDDEN', 'A member cannot grant permissions to themselves', 403);
            }
            // Rule: Only the Owner can grant 'Manage Member Permissions'
            if (permissionName === 'Manage Member Permissions') {
                throw new AppError_1.AppError('OWNER_ONLY_PERMISSION', 'Only the Circle Owner can grant "Manage Member Permissions"', 403);
            }
            // Rule: Actor must hold 'Manage Member Permissions'
            const actorPermRes = await config_1.default.query(`SELECT p.permission_name FROM circle_permissions p
         JOIN care_circle_members m ON p.member_id = m.id
         WHERE m.circle_id = $1 AND m.user_id = $2`, [circleId, actorId]);
            const actorPerms = actorPermRes.rows.map((r) => r.permission_name);
            if (!actorPerms.includes('Manage Member Permissions')) {
                throw new AppError_1.AppError('FORBIDDEN', 'Only the Circle Owner or a member with "Manage Member Permissions" can grant permissions', 403);
            }
            // Rule: A member cannot grant a permission that the granting actor does not possess
            if (!actorPerms.includes(permissionName)) {
                throw new AppError_1.AppError('CANNOT_GRANT_UNHELD_PERMISSION', `Cannot grant "${permissionName}" because you do not hold this permission yourself`, 403);
            }
        }
        // 5. Insert permission record
        const insertRes = await config_1.default.query(`INSERT INTO circle_permissions (member_id, permission_name, granted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (member_id, permission_name) DO UPDATE SET granted_by = EXCLUDED.granted_by, granted_at = NOW()
       RETURNING *`, [targetMemberId, permissionName, actorId]);
        return insertRes.rows[0];
    }
    /**
     * Revoke a canonical delegated permission.
     * Invariants (03-CARE-CIRCLE.md §10):
     *   - Only Circle Owner can revoke 'Manage Member Permissions'.
     *   - Circle Owner or member with 'Manage Member Permissions' can revoke other permissions.
     *   - Revocation takes effect immediately.
     */
    async revokePermission(circleId, actorId, targetMemberId, permissionName) {
        if (!care_circles_types_1.CANONICAL_PERMISSIONS.includes(permissionName)) {
            throw new AppError_1.AppError('INVALID_PERMISSION', `"${permissionName}" is not one of the 4 canonical delegatable permissions`, 400);
        }
        const circleRes = await config_1.default.query('SELECT owner_id, terminated_at FROM care_circles WHERE id = $1', [circleId]);
        const circle = circleRes.rows[0];
        if (!circle || circle.terminated_at) {
            throw new AppError_1.AppError('CIRCLE_NOT_FOUND', 'Active Care Circle not found', 404);
        }
        const targetRes = await config_1.default.query('SELECT id, user_id FROM care_circle_members WHERE id = $1 AND circle_id = $2', [targetMemberId, circleId]);
        if (!targetRes.rows[0]) {
            throw new AppError_1.AppError('MEMBER_NOT_FOUND', 'Target member not found in this Care Circle', 404);
        }
        const isOwner = actorId === circle.owner_id;
        if (!isOwner) {
            if (permissionName === 'Manage Member Permissions') {
                throw new AppError_1.AppError('OWNER_ONLY_PERMISSION', 'Only the Circle Owner can revoke "Manage Member Permissions"', 403);
            }
            const actorPermRes = await config_1.default.query(`SELECT p.id FROM circle_permissions p
         JOIN care_circle_members m ON p.member_id = m.id
         WHERE m.circle_id = $1 AND m.user_id = $2 AND p.permission_name = 'Manage Member Permissions'`, [circleId, actorId]);
            if (actorPermRes.rows.length === 0) {
                throw new AppError_1.AppError('FORBIDDEN', 'Only the Circle Owner or a member with "Manage Member Permissions" can revoke permissions', 403);
            }
        }
        const delRes = await config_1.default.query(`DELETE FROM circle_permissions WHERE member_id = $1 AND permission_name = $2 RETURNING id`, [targetMemberId, permissionName]);
        return { success: true, revoked: delRes.rows.length > 0 };
    }
    /**
     * Check if a user holds a specific canonical permission in a Care Circle.
     * Owner has intrinsic authority for all 4 canonical operations.
     */
    async hasPermission(circleId, userId, permissionName) {
        const circleRes = await config_1.default.query('SELECT owner_id, terminated_at FROM care_circles WHERE id = $1', [circleId]);
        const circle = circleRes.rows[0];
        if (!circle || circle.terminated_at) {
            return false;
        }
        // Owner has intrinsic authority
        if (circle.owner_id === userId) {
            return true;
        }
        // Check delegated permission row
        const permRes = await config_1.default.query(`SELECT p.id FROM circle_permissions p
       JOIN care_circle_members m ON p.member_id = m.id
       WHERE m.circle_id = $1 AND m.user_id = $2 AND p.permission_name = $3`, [circleId, userId, permissionName]);
        return permRes.rows.length > 0;
    }
    /**
     * Get all permissions held by a specific member.
     */
    async getMemberPermissions(memberId) {
        const res = await config_1.default.query(`SELECT id, member_id, permission_name, granted_by, granted_at
       FROM circle_permissions
       WHERE member_id = $1
       ORDER BY granted_at ASC`, [memberId]);
        return res.rows;
    }
}
exports.PermissionsService = PermissionsService;
exports.permissionsService = new PermissionsService();
//# sourceMappingURL=permissions.service.js.map