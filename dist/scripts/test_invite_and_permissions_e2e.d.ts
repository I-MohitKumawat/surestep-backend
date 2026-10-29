/**
 * SureStep — scripts/test_invite_and_permissions_e2e.ts
 *
 * End-to-end verification of:
 * 1. 6-digit invite code generation.
 * 2. Multi-role redemption: Patient, Caregiver, Family Member submitting join requests.
 * 3. Owner review and acceptance:
 *    - Patient: added to patient_circle_associations + care_circle_members + assigned to existing caregivers.
 *    - Caregiver: added to care_circle_members + relationship established & active + assigned to circle patients.
 *    - Family: added to care_circle_members.
 * 4. Intrinsic Owner Authority: Owner gets all 4 permissions by default in getCircleMembers.
 * 5. Delegated Permissions: Updating member permissions via setMemberPermissions.
 */
import 'dotenv/config';
//# sourceMappingURL=test_invite_and_permissions_e2e.d.ts.map