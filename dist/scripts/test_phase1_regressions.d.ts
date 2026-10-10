/**
 * test_phase1_regressions.ts
 *
 * Automated Regression Test Suite for SureStep Phase 1:
 *  1. Multi-Caregiver Removal Isolation & Safety:
 *     - caregiverId required (rejects missing/empty with 400 VALIDATION_ERROR)
 *     - Acting on Caregiver A does not affect Caregiver B
 *     - Established relationships soft-terminate via canonical endCareRelationship
 *  2. Care Request Patient Identity & Authorization:
 *     - Self-managed Patient allowed for self only
 *     - Family member cannot use own ID as patient ID (403 TARGET_PATIENT_UNAUTHORIZED)
 *     - Family member with confirmed patient relationship allowed
 *     - Family member with unconfirmed/unrelated patient ID rejected
 *  3. Extended Family (FAMILY_EXTENDED) Task & Routine Read Access:
 *     - Read access permitted for FAMILY_EXTENDED on today's tasks and adherence
 *     - Read access permitted for FAMILY_EXTENDED on routine templates
 *     - Modification operations remain restricted to CAREGIVER
 *     - Non-family/unrelated users rejected with 403
 */
export {};
//# sourceMappingURL=test_phase1_regressions.d.ts.map