/**
 * SureStep — shared/middleware/careCircleGuards.ts
 *
 * Resource-Aware Server-Side Authorization Policy Guards.
 * Baselines:
 *   - docs/architecture/TARGET_ARCHITECTURE.md (Section 4)
 *   - docs/workflows/03-CARE-CIRCLE.md
 *   - docs/workflows/04-PATIENT-CARE.md
 *   - docs/workflows/06-CAREGIVER-RELATIONSHIP.md
 *   - docs/workflows/07-SAFETY.md
 *   - docs/workflows/08-LOCATION-AND-SAFE-ZONES.md
 */
import { Request, Response, NextFunction } from 'express';
import '../../shared/types';
import { CanonicalPermissionName } from '../../modules/care-circles/care-circles.types';
/**
 * 1. requireCircleMembership
 * Asserts the authenticated caller is an active member or associated patient in :circleId.
 */
export declare function requireCircleMembership(circleIdParam?: string): (req: Request, _res: Response, next: NextFunction) => Promise<void>;
/**
 * 2. requireCircleOwner
 * Asserts the caller is the intrinsic Circle Owner.
 */
export declare function requireCircleOwner(circleIdParam?: string): (req: Request, _res: Response, next: NextFunction) => Promise<void>;
/**
 * 3. requireCirclePermission
 * Asserts caller is Circle Owner OR holds the specified canonical delegatable permission.
 */
export declare function requireCirclePermission(permissionName: CanonicalPermissionName, circleIdParam?: string): (req: Request, _res: Response, next: NextFunction) => Promise<void>;
/**
 * 4. requireActivePatientAssignment
 * Scopes to :patientId.
 * For Caregivers: requires an ACTIVE or NOTICE_PERIOD relationship AND an active patient assignment.
 * For Family: requires membership in the Circle that coordinates the patient.
 * For Patients: requires caller === patientId.
 */
export declare function requireActivePatientAssignment(patientIdParam?: string): (req: Request, _res: Response, next: NextFunction) => Promise<void>;
/**
 * 5. requireRoutineDefinitionCRUDAuthority
 * Patient-scoped variant of the canonical routine-definition policy.
 */
export declare function requireRoutineDefinitionCRUDAuthority(patientIdParam?: string): (req: Request, _res: Response, next: NextFunction) => Promise<void>;
/**
 * 5b. requireRoutineTemplateDefinitionAuthority
 * Resource-aware variant for the legacy routine-template compatibility routes.
 * Resolves the template's patient before applying the canonical definition policy,
 * so authorization is based on the patient's care plan—not on who created the row.
 */
export declare function requireRoutineTemplateDefinitionAuthority(templateIdParam?: string): (req: Request, _res: Response, next: NextFunction) => Promise<void>;
/**
 * 6. requireRoutineSignOffAuthority
 * Routine occurrence sign-off / care participation (04-PATIENT-CARE.md §3, §12, §14):
 *   - Patient themselves
 *   - Authorized Family Member coordinating care
 *   - Assigned Professional Caregiver (active relationship / notice period + active patient assignment)
 */
export declare function requireRoutineSignOffAuthority(patientIdParam?: string): (req: Request, _res: Response, next: NextFunction) => Promise<void>;
/**
 * 6b. requireOccurrenceSignOffAuthority
 * Direct occurrence sign-off authorization guard.
 * Loads the occurrence, derives its patient, and independently authorizes the caller:
 *   - Patient self
 *   - Assigned Caregiver (ACTIVE or NOTICE_PERIOD relationship + active patient assignment)
 *   - Authorized Circle Member coordinating the patient
 */
export declare function requireOccurrenceSignOffAuthority(occurrenceIdParam?: string): (req: Request, _res: Response, next: NextFunction) => Promise<void>;
/**
 * 7. requireSafeZoneManagementAuthority
 * Invariant (TARGET_ARCHITECTURE.md §3.5, §4.3):
 *   Safe Zone CRUD is strictly Circle Owner only in V1. Non-Owner members and caregivers
 *   receive 403 Forbidden. No delegatable permission exists for Safe Zone management.
 */
export declare function requireSafeZoneManagementAuthority(circleIdParam?: string): (req: Request, _res: Response, next: NextFunction) => Promise<void>;
/**
 * 8. requireAlertResolutionAuthority
 * Invariant (TARGET_ARCHITECTURE.md §3.6, §4.3):
 *   Resolving a safety alert is strictly Circle Owner only in V1.
 */
export declare function requireAlertResolutionAuthority(circleIdParam?: string): (req: Request, _res: Response, next: NextFunction) => Promise<void>;
/**
 * 9. requirePatientMemoryManagementAuthority
 * Invariant (09-MEMORIES-AND-ACTIVITIES.md §5; TARGET_ARCHITECTURE.md §3.7, §4.2):
 *   Memory creation, editing, and deletion are controlled strictly by Circle Owner
 *   or Circle members holding the delegated canonical permission 'Manage Patient Memories'.
 *   Caregivers (even assigned) receive 403.
 *   Arbitrary Circle members without the permission receive 403.
 */
export declare function requirePatientMemoryManagementAuthority(patientIdParam?: string): (req: Request, _res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=careCircleGuards.d.ts.map