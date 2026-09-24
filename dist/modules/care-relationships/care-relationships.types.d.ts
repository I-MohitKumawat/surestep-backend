/**
 * SureStep — modules/care-relationships/care-relationships.types.ts
 *
 * Types and canonical constants for Phase 3A: End Care Relationship lifecycle.
 */
export declare const CANONICAL_END_REASONS: readonly ["CARE_NO_LONGER_REQUIRED", "FAMILY_TAKING_OVER", "FOUND_DIFFERENT_CARE", "CAREGIVER_NOT_A_GOOD_FIT", "SCHEDULE_CHANGED", "CAREGIVER_REQUESTED_END", "OTHER"];
export type CareRelationshipEndReason = typeof CANONICAL_END_REASONS[number];
export interface EndCareRelationshipInput {
    reason: CareRelationshipEndReason;
    notes?: string | null;
}
export interface CareRelationshipRecord {
    id: string;
    patient_user_id: string;
    related_user_id: string;
    relationship_type: string;
    status: string;
    previous_status: string | null;
    confirmed_at: string | null;
    ended_at: string | null;
    ended_by: string | null;
    end_reason: string | null;
    end_notes: string | null;
    notes: string | null;
    created_at: string;
}
export interface CareRelationshipHistoryItem {
    id: string;
    caregiver_id: string;
    name: string;
    photo_url: string | null;
    city: string | null;
    professional_role: string | null;
    rating: number | null;
    rating_count: number;
    relationship_id: string;
    relationship_type: string;
    status: string;
    previous_status: string | null;
    confirmed_at: string | null;
    ended_at: string | null;
    ended_by: string | null;
    end_reason: string | null;
    end_notes: string | null;
}
export declare const CANONICAL_RESIGNATION_REASONS: readonly ["PERSONAL_CIRCUMSTANCES", "SCHEDULE_CONFLICT", "OUTSIDE_SERVICE_AREA", "CARE_NEEDS_CHANGED", "CAPACITY_CONSTRAINT", "ROLE_NO_LONGER_SUITABLE", "OTHER"];
export type CaregiverResignationReason = typeof CANONICAL_RESIGNATION_REASONS[number];
export declare const CANONICAL_RESIGNATION_STATUSES: readonly ["PENDING", "ACCEPTED", "WITHDRAWN", "DECLINED", "EXPIRED"];
export type CaregiverResignationStatus = typeof CANONICAL_RESIGNATION_STATUSES[number];
export interface CreateResignationInput {
    reason: CaregiverResignationReason;
    notes?: string | null;
}
export interface DeclineResignationInput {
    notes?: string | null;
}
export interface CaregiverResignationRecord {
    id: string;
    relationship_id: string;
    caregiver_id: string;
    patient_id: string;
    reason: CaregiverResignationReason;
    notes: string | null;
    status: CaregiverResignationStatus;
    requested_at: string;
    responded_at: string | null;
    responded_by: string | null;
    created_at: string;
    updated_at: string;
    caregiver_name?: string;
    patient_name?: string;
}
//# sourceMappingURL=care-relationships.types.d.ts.map