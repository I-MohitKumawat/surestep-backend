/**
 * verify_discovery.ts
 *
 * Automated verification test suite for SureStep Care Discovery (Part 2 & 2.1).
 * Verifies all criteria specified in the redesign requirements:
 *
 *  1. Self-created Patient → allowed
 *  2. Self-created Patient targeting another Patient → forbidden
 *  3. Family without targetPatientId → forbidden
 *  4. Family with authorized targetPatientId → allowed
 *  5. Family with unauthorized targetPatientId → forbidden
 *  6. Family-managed Patient directly attempting discovery → forbidden
 *  7. Caregiver → forbidden
 *  8. Only discoverable caregivers appear in search (cp.is_discoverable = TRUE)
 *  9. Inactive caregivers excluded (u.is_active = TRUE)
 * 10. Soft-deleted caregivers excluded (u.deleted_at IS NULL)
 * 11. Non-caregiver users excluded (u.role = 'CAREGIVER')
 * 12. Full-text / partial search by name, role, bio, qualifications
 * 13. City filter works
 * 14. Specializations filter works
 * 15. Languages filter works
 * 16. Availability filter works
 * 17. Max rate filter works
 * 18. Min experience filter works
 * 19. Unrated caregivers return null rating (not 5.0)
 * 20. Sorting orders work as expected (honest rating NULLS LAST)
 * 21. Phone number, email, and firebase_uid are NEVER returned in discovery results or detailed profile
 * 22. DiscoveryQuerySchema correctly parses and coerces query params
 */
export {};
//# sourceMappingURL=verify_discovery.d.ts.map