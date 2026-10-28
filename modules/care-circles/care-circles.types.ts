/**
 * SureStep — modules/care-circles/care-circles.types.ts
 *
 * Types, DTOs, and canonical constants for the Care Circle domain foundation.
 * Baselines:
 *   - docs/architecture/TARGET_ARCHITECTURE.md (Sections 3.2, 3.3, 4.1, 4.2)
 *   - docs/workflows/03-CARE-CIRCLE.md
 *   - docs/workflows/06-CAREGIVER-RELATIONSHIP.md
 */

export const CANONICAL_PERMISSIONS = [
  'Manage Member Permissions',
  'Manage Caregiver Relationships',
  'Search/Request Caregivers',
  'Manage Patient Memories',
] as const;

export type CanonicalPermissionName = typeof CANONICAL_PERMISSIONS[number];

export type RoleInCircle = 'OWNER' | 'MEMBER' | 'CAREGIVER';

export type CircleInvitationStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';

export type CircleJoinRequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export type CaregiverRelationshipStatus =
  | 'RELATIONSHIP_ESTABLISHED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'NOTICE_PERIOD'
  | 'TERMINATED';

export interface CreateCareCircleDTO {
  name: string;
}

export interface ReviewJoinRequestDTO {
  decision: 'ACCEPTED' | 'REJECTED';
}

export interface GrantPermissionDTO {
  permissionName: CanonicalPermissionName;
}

export interface EstablishCaregiverRelationshipDTO {
  caregiverId: string;
}

export interface CaregiverNoticeDTO {
  reason?: string;
  isSafetyException?: boolean;
}

export interface TerminateCaregiverRelationshipDTO {
  reason?: string;
  notes?: string;
}

export interface AssignPatientDTO {
  patientId: string;
}

