import type { User } from '../../shared/types';
import type { CaregiverDetailedProfile, DiscoveryQueryParams, DiscoverySearchResponse } from './discovery.types';
/**
 * Structured Care Circle Authorization Evaluation.
 * Explicitly separates relationship, responsibility, and permission layers.
 */
export interface CareCircleAuthEvaluation {
    hasActiveRelationship: boolean;
    relationshipType: string | null;
    relationshipStatus: string | null;
    hasCareResponsibility: boolean;
    canDiscoverCaregivers: boolean;
    patientCity: string | null;
}
/**
 * Evaluate whether a family member has legitimate authority to search/discover care for a patient.
 */
export declare function evaluateFamilyCareDiscoveryAuth(familyUserId: string, targetPatientId: string): Promise<CareCircleAuthEvaluation>;
/**
 * Validate that the requester has access to care discovery,
 * and verify targetPatientId authorization.
 *
 * Rules:
 *  - PATIENT: Allowed if self-created (onboarding_source != 'FAMILY'). targetPatientId resolves to self.
 *  - FAMILY: targetPatientId is REQUIRED. Must be confirmed care circle member for that patient.
 *  - CAREGIVER: Forbidden (ROLE_NOT_PERMITTED).
 */
export declare function validateDiscoveryAccess(user: User, targetPatientId?: string): Promise<{
    targetPatientCity?: string | null;
}>;
/**
 * Canonical Caregiver Discovery Search query engine.
 */
export declare function searchCaregivers(inputParams: Partial<DiscoveryQueryParams>, user: User): Promise<DiscoverySearchResponse>;
/**
 * Fetch detailed, authoritative Caregiver Profile for discovery.
 * Strips private phone, email, Firebase UID, and exact addresses.
 */
export declare function getCaregiverProfileById(caregiverId: string, user: User, targetPatientId?: string): Promise<CaregiverDetailedProfile>;
//# sourceMappingURL=discovery.service.d.ts.map