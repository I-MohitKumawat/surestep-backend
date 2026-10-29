/**
 * SureStep — scripts/test_patient_mode_authorization.ts
 *
 * Verification suite for Patient Mode (Self-managed vs Assisted) Routine Authorization.
 *
 * Requirements:
 *  1. Self-managed patient (onboarding_source = 'SELF') CAN perform permitted routine definition CRUD.
 *  2. Assisted patient (onboarding_source = 'FAMILY') CANNOT perform routine definition CRUD (403 ASSISTED_PATIENT_ROUTINE_CRUD_FORBIDDEN).
 *  3. Authorized family member in the patient's Care Circle CAN perform routine definition CRUD.
 *  4. Caregivers and external family members are forbidden.
 */
import 'dotenv/config';
//# sourceMappingURL=test_patient_mode_authorization.d.ts.map