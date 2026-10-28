/**
 * SureStep — modules/care-circles/care-circles.service.ts
 *
 * Core Care Circle lifecycle and membership coordination service.
 * Baselines:
 *   - docs/architecture/TARGET_ARCHITECTURE.md (Sections 3.2, 4.1, 4.2)
 *   - docs/workflows/03-CARE-CIRCLE.md (Sections 1, 4, 5)
 */
export declare class CareCirclesService {
    /**
     * Create a new Care Circle.
     * Rules:
     *   - A Patient cannot create a Circle (03-CARE-CIRCLE.md §1).
     *   - Creator must be Family Member or Professional Caregiver.
     *   - A user can have only one active Care Circle in V1.
     *   - Creator becomes the Circle Owner with intrinsic authority.
     */
    createCareCircle(ownerId: string, name: string): Promise<any>;
    /**
     * Get Care Circle details, verifying caller has access.
     */
    getCareCircle(circleId: string, requestingUserId: string): Promise<any>;
    /**
     * Get user's active Care Circle (as Owner, Member, or Patient).
     */
    getUserActiveCircle(userId: string): Promise<any>;
    /**
     * Update Care Circle name (Circle Owner only).
     */
    updateCareCircleName(circleId: string, actorId: string, name: string): Promise<any>;
    /**
     * Terminate a Care Circle (Circle Owner only).
     * Rules:
     *   - Sets terminated_at = NOW().
     *   - Automatically ends active caregiver relationships.
     *   - Deactivates active patient assignments.
     *   - Revokes active invitations and pending join requests.
     */
    terminateCareCircle(circleId: string, actorId: string): Promise<any>;
    /**
     * List members of a Care Circle with their user profile info and granted canonical permissions.
     */
    getCircleMembers(circleId: string): Promise<any[]>;
    /**
     * List Patients associated with a Care Circle.
     */
    getCirclePatients(circleId: string): Promise<any[]>;
    /**
     * Remove a member from a Care Circle.
     * Actor must be Circle Owner OR member holding 'Manage Member Permissions'.
     * Cannot remove the Circle Owner.
     * Atomically terminates caregiver relationships and deactivates assignments if target is a caregiver.
     */
    removeCircleMember(circleId: string, actorId: string, memberIdToRemove: string): Promise<{
        success: boolean;
        removedMemberId: string;
    }>;
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
    transferOwnership(circleId: string, currentOwnerId: string, newOwnerId: string): Promise<{
        success: boolean;
        circleId: string;
        previousOwnerId: string;
        newOwnerId: string;
    }>;
    /**
     * Voluntarily leave a Care Circle (03-CARE-CIRCLE.md §13).
     * Rules:
     *   - Non-owner members can leave.
     *   - Circle Owner cannot leave without transferring ownership or terminating the Circle.
     *   - Leaves and immediately revokes permissions.
     *   - If member is a caregiver, terminates relationship and deactivates assignments.
     */
    leaveCircle(circleId: string, userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
}
export declare const careCirclesService: CareCirclesService;
//# sourceMappingURL=care-circles.service.d.ts.map