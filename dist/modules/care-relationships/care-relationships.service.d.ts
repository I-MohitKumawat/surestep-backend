/**
 * SureStep — modules/care-relationships/care-relationships.service.ts
 *
 * Core business logic for Phase 3A: End Care Relationship lifecycle.
 * Enforces transactional row locking, authority checks, terminal status transitions,
 * and post-commit notification events.
 */
import { type EndCareRelationshipInput, type CareRelationshipRecord, type CareRelationshipHistoryItem, type CreateResignationInput, type DeclineResignationInput, type CaregiverResignationRecord } from './care-relationships.types';
/**
 * End an active or established care relationship.
 * Enforces strict transactional row-locking (SELECT ... FOR UPDATE)
 * and verifies caller authority.
 */
export declare function endCareRelationship(relationshipId: string, input: EndCareRelationshipInput, caller: {
    id: string;
    role: string;
}): Promise<CareRelationshipRecord>;
/**
 * Fetch care history for a patient (ENDED relationships).
 * Retains historical caregiver records while active queries exclude them.
 */
export declare function getCareRelationshipHistory(targetPatientId: string, caller: {
    id: string;
    role: string;
}): Promise<CareRelationshipHistoryItem[]>;
/**
 * Caregiver creates a request to end care (resignation).
 */
export declare function createResignationRequest(relationshipId: string, input: CreateResignationInput, caller: {
    id: string;
    role: string;
}): Promise<CaregiverResignationRecord>;
/**
 * Get resignation request for a relationship (latest).
 */
export declare function getResignationRequest(relationshipId: string, caller: {
    id: string;
    role: string;
}): Promise<CaregiverResignationRecord | null>;
/**
 * Fetch all pending resignation requests for a patient.
 */
export declare function getPendingResignationsForPatient(patientId: string, caller: {
    id: string;
    role: string;
}): Promise<CaregiverResignationRecord[]>;
/**
 * Patient or authorized family accepts caregiver resignation request.
 * Transactionally marks resignation ACCEPTED and relationship ENDED.
 */
export declare function acceptResignationRequest(relationshipId: string, caller: {
    id: string;
    role: string;
}): Promise<{
    resignation: CaregiverResignationRecord;
    relationship: CareRelationshipRecord;
}>;
/**
 * Patient or authorized family declines caregiver resignation request.
 * Resignation marks DECLINED; relationship remains ACTIVE_CARE.
 */
export declare function declineResignationRequest(relationshipId: string, input: DeclineResignationInput, caller: {
    id: string;
    role: string;
}): Promise<CaregiverResignationRecord>;
/**
 * Caregiver withdraws a pending resignation request.
 * Resignation marks WITHDRAWN; relationship remains ACTIVE_CARE.
 */
export declare function withdrawResignationRequest(relationshipId: string, caller: {
    id: string;
    role: string;
}): Promise<CaregiverResignationRecord>;
//# sourceMappingURL=care-relationships.service.d.ts.map