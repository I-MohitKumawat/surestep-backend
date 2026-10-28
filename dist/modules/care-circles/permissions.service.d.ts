/**
 * SureStep — modules/care-circles/permissions.service.ts
 *
 * Canonical Delegated Permissions Service.
 * Baselines:
 *   - docs/architecture/TARGET_ARCHITECTURE.md (Sections 3.2, 4.1, 4.2)
 *   - docs/workflows/03-CARE-CIRCLE.md (Sections 9, 10)
 */
import { CanonicalPermissionName } from './care-circles.types';
export declare class PermissionsService {
    /**
     * Grant a canonical delegated permission to a Circle member.
     * Invariants (03-CARE-CIRCLE.md §9):
     *   - Strictly the 4 canonical permissions can be delegated.
     *   - Owner authority is intrinsic; no permission rows for Owner.
     *   - A member with 'Manage Member Permissions' cannot grant permissions to themselves.
     *   - A member cannot grant a permission that the granting actor does not possess.
     *   - Only the Circle Owner can grant 'Manage Member Permissions' itself.
     */
    grantPermission(circleId: string, actorId: string, targetMemberId: string, permissionName: CanonicalPermissionName): Promise<any>;
    /**
     * Revoke a canonical delegated permission.
     * Invariants (03-CARE-CIRCLE.md §10):
     *   - Only Circle Owner can revoke 'Manage Member Permissions'.
     *   - Circle Owner or member with 'Manage Member Permissions' can revoke other permissions.
     *   - Revocation takes effect immediately.
     */
    revokePermission(circleId: string, actorId: string, targetMemberId: string, permissionName: CanonicalPermissionName): Promise<{
        success: boolean;
        revoked: boolean;
    }>;
    /**
     * Check if a user holds a specific canonical permission in a Care Circle.
     * Owner has intrinsic authority for all 4 canonical operations.
     */
    hasPermission(circleId: string, userId: string, permissionName: CanonicalPermissionName): Promise<boolean>;
    /**
     * Get all permissions held by a specific member.
     */
    getMemberPermissions(memberId: string): Promise<any[]>;
}
export declare const permissionsService: PermissionsService;
//# sourceMappingURL=permissions.service.d.ts.map