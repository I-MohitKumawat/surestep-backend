/**
 * SureStep — scripts/test_phase2_discovery_regressions.ts
 *
 * PHASE 2 REGRESSION TEST SUITE: CAREGIVER DISCOVERY & PATIENT CONTEXT
 *
 * NOTE: This is an IN-MEMORY MOCKED unit/integration test suite.
 * It mocks `pool.query` to verify SQL query generation, parameter binding,
 * city alias normalization, filtering semantics, authorization gates,
 * and context propagation without requiring an active PostgreSQL database connection.
 *
 * Required Test Matrix:
 *  Case 1: Eligible caregivers appear when no explicit city filter is supplied
 *  Case 2: Explicit city filters still work
 *  Case 3: City aliases and descriptive service-area values behave according to normalization rules
 *  Case 4: Missing patient city does not cause accidental exclusion
 *  Case 5: Inactive, deleted, non-caregiver, and non-discoverable profiles remain excluded
 *  Case 6: Family discovery requires an authorized target patient
 *  Case 7: Self-managed Patient discovery works without a separate target patient
 *  Case 8: The correct patient ID survives navigation into Care Request
 *  Case 9: Private caregiver fields are not returned
 *  Case 10: Pagination and existing response shape remain correct
 */
export {};
//# sourceMappingURL=test_phase2_discovery_regressions.d.ts.map