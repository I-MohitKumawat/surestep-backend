/**
 * test_caregiver_resignation_real_db.ts
 *
 * Real PostgreSQL Integration Test Suite for Phase 3B: Caregiver Resignation & Handover.
 * ZERO MOCKING of database connection, queries, locks, triggers, or constraints.
 *
 * Connects to live PostgreSQL database: surestep_test
 * Verifies all 20 required specifications:
 *  1. Caregiver creates resignation request.
 *  2. Unauthorized caregiver rejected (403 Forbidden).
 *  3. Patient/family cannot create caregiver resignation (403 Forbidden).
 *  4. Duplicate pending resignation rejected (409 Conflict / Unique Index).
 *  5. Patient accepts resignation.
 *  6. Authorized family accepts resignation.
 *  7. Unauthorized family rejected (403 Forbidden).
 *  8. Patient/family declines resignation.
 *  9. Caregiver withdraws resignation.
 * 10. Accepted resignation ends relationship (status = ENDED).
 * 11. Declined resignation leaves relationship ACTIVE_CARE.
 * 12. Withdrawn resignation leaves relationship ACTIVE_CARE.
 * 13. Pending resignation does not revoke caregiver access (status stays ACTIVE_CARE).
 * 14. Accepted resignation revokes active-care access (status is ENDED).
 * 15. Original Care Request remains ACCEPTED.
 * 16. Relationship history preserved and retrievable.
 * 17. Concurrent resignation acceptance vs patient End Care.
 * 18. Concurrent double acceptance (exactly one succeeds, one receives 409).
 * 19. Concurrent caregiver withdrawal vs acceptance (exactly one wins).
 * 20. Transaction rollback preserves consistent state.
 */
export {};
//# sourceMappingURL=test_caregiver_resignation_real_db.d.ts.map