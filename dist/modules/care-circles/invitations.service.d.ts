/**
 * SureStep — modules/care-circles/invitations.service.ts
 *
 * 6-Digit Numeric Invitation & Join Request Engine.
 * Baselines:
 *   - docs/architecture/TARGET_ARCHITECTURE.md (Sections 3.2, 5.4)
 *   - docs/workflows/03-CARE-CIRCLE.md (Sections 2, 3, 4, 5, 6, 7)
 */
import { ReviewJoinRequestDTO } from './care-circles.types';
export declare class InvitationsService {
    /**
     * Generates a 6-digit numeric invitation code with a 72-hour TTL.
     * Actor must be Circle Owner or hold 'Manage Member Permissions'.
     * In accordance with 03-CARE-CIRCLE.md §2:
     *   "Regenerating an active invitation invalidates the previous invitation."
     */
    generateInvitation(circleId: string, actorId: string): Promise<any>;
    /**
     * Look up an invitation by 6-digit code.
     * Validates code and TTL.
     * Does NOT expose Patient care information prior to membership approval (03-CARE-CIRCLE.md §2).
     */
    getInvitationByCode(code: string): Promise<{
        id: any;
        circleId: any;
        circleName: any;
        ownerName: any;
        expiresAt: any;
        status: any;
    }>;
    /**
     * Submit a Join Request using a 6-digit invitation code.
     * Rules:
     *   - Transitions invitation to 'USED' immediately upon creating the join request (03-CARE-CIRCLE.md §2, §3).
     *   - Does not grant membership immediately; creates a PENDING join request.
     *   - Applicant must not already belong to an active Circle.
     *   - Duplicate pending requests rejected by idx_uq_pending_circle_join_request.
     */
    submitJoinRequest(code: string, applicantUserId: string): Promise<any>;
    /**
     * List pending join requests for a Care Circle.
     * Actor must be Circle Owner or hold 'Manage Member Permissions'.
     */
    listPendingJoinRequests(circleId: string, actorId: string): Promise<any[]>;
    /**
     * Review a pending join request (ACCEPTED or REJECTED).
     * Actor must be Circle Owner or hold 'Manage Member Permissions'.
     * If ACCEPTED:
     *   - Patient applicant -> creates patient_circle_associations row + care_circle_members row.
     *   - Caregiver applicant -> creates care_circle_members row with role 'CAREGIVER'.
     *   - Family applicant -> creates care_circle_members row with role 'MEMBER'.
     */
    reviewJoinRequest(requestId: string, reviewerId: string, dto: ReviewJoinRequestDTO): Promise<{
        request: any;
        membership: any;
        association: any;
    }>;
    /**
     * Helper: Assert actor is Circle Owner OR holds 'Manage Member Permissions'.
     */
    private assertCanManageMembers;
}
export declare const invitationsService: InvitationsService;
//# sourceMappingURL=invitations.service.d.ts.map