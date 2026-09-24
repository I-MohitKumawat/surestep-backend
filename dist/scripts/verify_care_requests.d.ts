/**
 * verify_care_requests.ts
 *
 * Automated verification test suite for SureStep Care Request Subsystem (Phase 1).
 * Verifies all 22 specific criteria defined in Phase 15 of the specification:
 *
 * AUTHORIZATION:
 *  1. Patient can request for self.
 *  2. Patient cannot request for another patient.
 *  3. Family with confirmed relationship can request for patient.
 *  4. Family without confirmed relationship gets 403.
 *  5. Caregiver cannot create request.
 *
 * CREATE:
 *  6. Valid request creates PENDING.
 *  7. Duplicate pending request gets 409.
 *  8. Active relationship gets 409.
 *  9. Invalid schedule rejected.
 * 10. Invalid capability rejected.
 * 11. Invalid rate rejected.
 *
 * LIFECYCLE:
 * 12. Caregiver accepts → request ACCEPTED + relationship created.
 * 13. Caregiver declines → DECLINED + record retained.
 * 14. Requester withdraws → WITHDRAWN + record retained.
 * 15. Expired request cannot be accepted.
 * 16. Terminal requests cannot transition again.
 *
 * CONCURRENCY:
 * 17. Accept vs withdraw cannot both succeed.
 * 18. Accepting concurrent requests cannot bypass caregiver capacity.
 * 19. Duplicate concurrent creation cannot create two pending requests.
 *
 * PRIVACY:
 * 20. Incoming request does not expose phone/exact address/etc.
 * 21. Unauthorized user cannot retrieve another request.
 *
 * MULTI-CAREGIVER:
 * 22. Patient can have independent relationships with multiple caregivers.
 *
 * BONUS / MAINTENANCE:
 * 23. Background maintenance sweeps expired requests and dispatches CARE_REQUEST_EXPIRED.
 */
export {};
//# sourceMappingURL=verify_care_requests.d.ts.map