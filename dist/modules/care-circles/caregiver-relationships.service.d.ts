/**
 * SureStep — modules/care-circles/caregiver-relationships.service.ts
 *
 * Caregiver Contractual Relationship Lifecycle Service with 7-Day Notice Period.
 * Baselines:
 *   - docs/architecture/TARGET_ARCHITECTURE.md (Sections 3.3, 5.1)
 *   - docs/workflows/06-CAREGIVER-RELATIONSHIP.md (Sections 2, 5, 10, 11, 12, 13, 16)
 */
import { CaregiverNoticeDTO, TerminateCaregiverRelationshipDTO } from './care-circles.types';
export declare class CaregiverRelationshipsService {
    /**
     * Establish a formal Caregiver Relationship.
     * Actor must be Circle Owner or hold 'Manage Caregiver Relationships'.
     * Caregiver must already be a member of the Care Circle (role_in_circle = 'CAREGIVER').
     */
    establishRelationship(circleId: string, actorId: string, caregiverId: string): Promise<any>;
    /**
     * Suspend an active Caregiver Relationship.
     * Actor must be Circle Owner or hold 'Manage Caregiver Relationships'.
     * Deactivates all patient assignments.
     */
    suspendRelationship(relationshipId: string, actorId: string): Promise<any>;
    /**
     * Restore a suspended Caregiver Relationship to ACTIVE.
     * Actor must be Circle Owner or hold 'Manage Caregiver Relationships'.
     * Re-activates patient assignments.
     */
    restoreRelationship(relationshipId: string, actorId: string): Promise<any>;
    /**
     * Caregiver initiates departure and enters Notice Period (or immediate safety exception).
     * Rules (06-CAREGIVER-RELATIONSHIP.md §16):
     *   - Caregiver-initiated voluntary departure.
     *   - Not an interactive approval workflow; Circle cannot decline departure.
     *   - Standard notice lasts exactly 7 days (7 * 24h).
     *   - Care access remains preserved during the 7-day notice period.
     *   - If safety exception: immediately TERMINATED and access revoked.
     */
    submitNotice(relationshipId: string, caregiverUserId: string, dto: CaregiverNoticeDTO): Promise<any>;
    /**
     * Immediate termination (Family-initiated or safety reason).
     * Actor must be Circle Owner or hold 'Manage Caregiver Relationships'.
     * Can terminate an ACTIVE, SUSPENDED, or NOTICE_PERIOD relationship.
     * Immediately deactivates patient assignments.
     */
    terminateImmediate(relationshipId: string, actorId: string, dto: TerminateCaregiverRelationshipDTO): Promise<any>;
    /**
     * Periodic check / worker: Automatically transitions NOTICE_PERIOD relationships
     * past their 7-day notice_expires_at to TERMINATED and revokes assignments.
     */
    processExpiredNotices(): Promise<{
        transitionedCount: number;
        expiredIds: any[];
    }>;
    /**
     * List Caregiver Relationships in a Care Circle with their assignments.
     */
    listCircleCaregivers(circleId: string): Promise<any[]>;
    /**
     * Helper: Get relationship and circle owner.
     */
    getRelationshipWithCircle(relationshipId: string): Promise<any>;
    /**
     * Helper: Assert actor is Circle Owner OR holds 'Manage Caregiver Relationships'.
     */
    private assertCanManageCaregivers;
}
export declare const caregiverRelationshipsService: CaregiverRelationshipsService;
//# sourceMappingURL=caregiver-relationships.service.d.ts.map