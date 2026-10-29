"use strict";
/**
 * SureStep — modules/care-circles/permissions.service.ts
 *
 * Canonical Delegated Permissions Service.
 * Baselines:
 *   - docs/architecture/TARGET_ARCHITECTURE.md (Sections 3.2, 4.1, 4.2)
 *   - docs/workflows/03-CARE-CIRCLE.md (Sections 9, 10)
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
        const targetUserRes = await config_1.default.query('SELECT role FROM users WHERE id = $1', [targetMember.user_id]);
        if (targetUserRes.rows[0]?.role === 'PATIENT') {
            throw new AppError_1.AppError('PATIENT_PERMISSIONS_FORBIDDEN', 'Patients cannot receive delegated Circle administration permissions', 400);
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
        await this.notifyPermissionsChanged(circleId, targetMemberId, targetMember.user_id);
        return insertRes.rows[0];
    }
    /**
     * Revoke a canonical delegated permission.
     * Invariants (03-CARE-CIRCLE.md §10):
     *   - Only Circle Owner can revoke 'Manage Member Permissions'.
     *   - Circle Owner or member with 'Manage Member Permissions' can revoke other permissions
     *     they hold themselves.
     *   - A delegate cannot modify their own permissions.
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
        const targetRes = await config_1.default.query(`SELECT m.id, m.user_id, m.role_in_circle, u.role as user_role
       FROM care_circle_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.id = $1 AND m.circle_id = $2`, [targetMemberId, circleId]);
        const targetMember = targetRes.rows[0];
        if (!targetMember) {
            throw new AppError_1.AppError('MEMBER_NOT_FOUND', 'Target member not found in this Care Circle', 404);
        }
        if (targetMember.role_in_circle === 'OWNER' || targetMember.user_id === circle.owner_id) {
            throw new AppError_1.AppError('OWNER_INTRINSIC_AUTHORITY', 'Circle Owner authority is intrinsic and cannot be revoked', 400);
        }
        if (targetMember.user_role === 'PATIENT') {
            throw new AppError_1.AppError('PATIENT_PERMISSIONS_FORBIDDEN', 'Patients cannot hold delegated Circle administration permissions', 400);
        }
        const isOwner = actorId === circle.owner_id;
        if (!isOwner) {
            if (targetMember.user_id === actorId) {
                throw new AppError_1.AppError('SELF_GRANT_FORBIDDEN', 'A member cannot modify their own permissions', 403);
            }
            if (permissionName === 'Manage Member Permissions') {
                throw new AppError_1.AppError('OWNER_ONLY_PERMISSION', 'Only the Circle Owner can revoke "Manage Member Permissions"', 403);
            }
            const actorPermRes = await config_1.default.query(`SELECT p.permission_name FROM circle_permissions p
         JOIN care_circle_members m ON p.member_id = m.id
         WHERE m.circle_id = $1 AND m.user_id = $2`, [circleId, actorId]);
            const actorPerms = actorPermRes.rows.map((row) => row.permission_name);
            if (!actorPerms.includes('Manage Member Permissions')) {
                throw new AppError_1.AppError('FORBIDDEN', 'Only the Circle Owner or a member with "Manage Member Permissions" can revoke permissions', 403);
            }
            if (!actorPerms.includes(permissionName)) {
                throw new AppError_1.AppError('CANNOT_REVOKE_UNHELD_PERMISSION', `Cannot revoke "${permissionName}" because you do not hold this permission yourself`, 403);
            }
        }
        const delRes = await config_1.default.query(`DELETE FROM circle_permissions WHERE member_id = $1 AND permission_name = $2 RETURNING id`, [targetMemberId, permissionName]);
        if (delRes.rows.length > 0) {
            await this.notifyPermissionsChanged(circleId, targetMemberId, targetMember.user_id);
        }
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
        // Check delegated permission row. Patients never hold delegated Circle authority.
        const permRes = await config_1.default.query(`SELECT p.id FROM circle_permissions p
       JOIN care_circle_members m ON p.member_id = m.id
       JOIN users u ON u.id = m.user_id
       WHERE m.circle_id = $1 AND m.user_id = $2 AND p.permission_name = $3
         AND u.role <> 'PATIENT'`, [circleId, userId, permissionName]);
        return permRes.rows.length > 0;
    }
    /**
     * Set all delegated permissions for a specific member using diff semantics.
     * Actor must be Circle Owner or hold 'Manage Member Permissions'.
     *
     * Invariants (03-CARE-CIRCLE.md §9, §10):
     *   - Owner authority is intrinsic and cannot be targeted.
     *   - Patients cannot receive Circle administration permissions.
     *   - A delegate cannot self-grant or modify their own permission set.
     *   - `Manage Member Permissions` is Owner-controlled and is preserved for delegates.
     *   - A delegate can only add permissions they hold, and can only remove permissions
     *     they hold, so a full-set submission cannot silently widen or narrow authority.
     */
    async setMemberPermissions(circleId, actorId, targetMemberId, permissions) {
        if (!Array.isArray(permissions)) {
            throw new AppError_1.AppError('INVALID_PERMISSIONS', 'Permissions must be an array', 400);
        }
        for (const perm of permissions) {
            if (!care_circles_types_1.CANONICAL_PERMISSIONS.includes(perm)) {
                throw new AppError_1.AppError('INVALID_PERMISSION', `"${perm}" is not one of the 4 canonical delegatable permissions`, 400);
            }
        }
        const circleRes = await config_1.default.query('SELECT owner_id, terminated_at FROM care_circles WHERE id = $1', [circleId]);
        const circle = circleRes.rows[0];
        if (!circle || circle.terminated_at) {
            throw new AppError_1.AppError('CIRCLE_NOT_FOUND', 'Active Care Circle not found', 404);
        }
        const targetRes = await config_1.default.query(`SELECT m.id, m.user_id, m.role_in_circle, u.role as user_role
       FROM care_circle_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.id = $1 AND m.circle_id = $2`, [targetMemberId, circleId]);
        const targetMember = targetRes.rows[0];
        if (!targetMember) {
            throw new AppError_1.AppError('MEMBER_NOT_FOUND', 'Target member not found in this Care Circle', 404);
        }
        if (targetMember.role_in_circle === 'OWNER' || targetMember.user_id === circle.owner_id) {
            throw new AppError_1.AppError('OWNER_INTRINSIC_AUTHORITY', 'Circle Owner has intrinsic authority and does not receive permission rows', 400);
        }
        if (targetMember.user_role === 'PATIENT') {
            throw new AppError_1.AppError('PATIENT_PERMISSIONS_FORBIDDEN', 'Patients cannot receive delegated Circle administration permissions', 400);
        }
        const isOwner = actorId === circle.owner_id;
        const existingRes = await config_1.default.query('SELECT permission_name FROM circle_permissions WHERE member_id = $1', [targetMemberId]);
        const existing = new Set(existingRes.rows.map((row) => row.permission_name));
        const requested = new Set(permissions);
        if (!isOwner) {
            if (targetMember.user_id === actorId) {
                throw new AppError_1.AppError('SELF_GRANT_FORBIDDEN', 'A member cannot modify their own permissions', 403);
            }
            const actorPermRes = await config_1.default.query(`SELECT p.permission_name FROM circle_permissions p
         JOIN care_circle_members m ON p.member_id = m.id
         WHERE m.circle_id = $1 AND m.user_id = $2`, [circleId, actorId]);
            const actorPerms = new Set(actorPermRes.rows.map((row) => row.permission_name));
            if (!actorPerms.has('Manage Member Permissions')) {
                throw new AppError_1.AppError('FORBIDDEN', 'Only the Circle Owner or a member with "Manage Member Permissions" can modify permissions', 403);
            }
            // `Manage Member Permissions` is Owner-controlled. Delegates may submit the current
            // state but cannot grant or revoke it; any existing row is preserved.
            if (requested.has('Manage Member Permissions') && !existing.has('Manage Member Permissions')) {
                throw new AppError_1.AppError('OWNER_ONLY_PERMISSION', 'Only the Circle Owner can grant "Manage Member Permissions"', 403);
            }
            requested.delete('Manage Member Permissions');
            if (existing.has('Manage Member Permissions')) {
                requested.add('Manage Member Permissions');
            }
            for (const perm of requested) {
                if (!existing.has(perm) && !actorPerms.has(perm)) {
                    throw new AppError_1.AppError('CANNOT_GRANT_UNHELD_PERMISSION', `Cannot grant "${perm}" because you do not hold this permission yourself`, 403);
                }
            }
            for (const perm of existing) {
                if (perm === 'Manage Member Permissions')
                    continue;
                if (!requested.has(perm) && !actorPerms.has(perm)) {
                    throw new AppError_1.AppError('CANNOT_REVOKE_UNHELD_PERMISSION', `Cannot revoke "${perm}" because you do not hold this permission yourself`, 403);
                }
            }
        }
        const toAdd = [...requested].filter((perm) => !existing.has(perm));
        const toRemove = [...existing].filter((perm) => !requested.has(perm));
        const client = await config_1.default.connect();
        try {
            await client.query('BEGIN');
            if (toRemove.length > 0) {
                await client.query(`DELETE FROM circle_permissions
           WHERE member_id = $1 AND permission_name = ANY($2::text[])`, [targetMemberId, toRemove]);
            }
            for (const perm of toAdd) {
                await client.query(`INSERT INTO circle_permissions (member_id, permission_name, granted_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (member_id, permission_name) DO UPDATE SET granted_by = EXCLUDED.granted_by, granted_at = NOW()`, [targetMemberId, perm, actorId]);
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
        if (toAdd.length > 0 || toRemove.length > 0) {
            await this.notifyPermissionsChanged(circleId, targetMemberId, targetMember.user_id);
        }
        return await this.getMemberPermissions(targetMemberId);
    }
    /**
     * Broadcast a permission change so clients refresh authorization state immediately.
     */
    async notifyPermissionsChanged(circleId, memberId, userId) {
        try {
            const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
            io.to(`circle:${circleId}`).emit('circle:permissions_changed', {
                circleId,
                memberId,
                userId,
            });
            io.to(`user:${userId}`).emit('circle:permissions_changed', {
                circleId,
                memberId,
                userId,
            });
        }
        catch (_) {
            // Socket delivery is best-effort; persistence is authoritative.
        }
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