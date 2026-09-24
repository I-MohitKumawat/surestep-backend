/**
 * test_end_care_relationship_real_db.ts
 *
 * Real PostgreSQL Integration Test Suite for Phase 3A: End Care Relationship.
 * ZERO MOCKING of database connection, queries, locks, or constraints.
 *
 * Connects to live PostgreSQL database: surestep_test
 * Verifies all 20 required specifications:
 *  1. Authorized patient can end active caregiver relationship.
 *  2. Authorized family member can end where existing authority permits.
 *  3. Unauthorized family member cannot end.
 *  4. Caregiver cannot use requester endpoint.
 *  5. Pending Care Request cannot be ended through relationship endpoint.
 *  6. Active relationship transitions to ENDED.
 *  7. ENDED relationship cannot be ended again.
 *  8. ENDED relationship cannot be resurrected (terminal state trigger).
 *  9. End reason is stored.
 * 10. Notes are stored.
 * 11. >500 character notes rejected.
 * 12. Invalid reason rejected.
 * 13. Concurrent End Care requests produce exactly one successful transition.
 * 14. Ending caregiver A does not affect caregiver B (multi-caregiver safety).
 * 15. Active Care Team excludes ENDED.
 * 16. Care History includes ENDED.
 * 17. Historical Care Request remains ACCEPTED.
 * 18. Transaction rollback leaves relationship unchanged.
 * 19. Notifications/events occur only after successful commit.
 * 20. Active-care authorization no longer applies after ENDED.
 */
export {};
//# sourceMappingURL=test_end_care_relationship_real_db.d.ts.map