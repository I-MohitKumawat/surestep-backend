/**
 * test_care_requests_real_db.ts
 *
 * Real PostgreSQL Integration Test Suite for SureStep Care Request Subsystem.
 * ZERO MOCKING of pool.query, pool.connect, or PostgreSQL client.
 *
 * Connects to isolated test database: surestep_test
 * Verifies:
 *  - Section 3: Real Database Engine Invariants & Constraints (A-I)
 *  - Section 4: Real Acceptance Transaction & Rollback
 *  - Section 5: Real Caregiver Capacity Enforcement & Concurrent Acceptance Race
 *  - Section 6: Real Duplicate Request Rejection & Unique Index Enforcement
 *  - Section 7: Real Lazy & Scheduled Expiration (sweepExpiredCareRequests)
 *  - Section 8: Real Staged Disclosure Privacy (Pre- vs Post-Acceptance)
 *  - Section 9: Legacy Route Architectural Bypass Documentation
 */
export {};
//# sourceMappingURL=test_care_requests_real_db.d.ts.map