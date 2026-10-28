/**
 * SureStep — scripts/test_phase1_care_circle_domain.ts
 *
 * Comprehensive End-to-End Integration Test Suite for Phase 1: Care Circle Domain Foundation.
 *
 * Verifies all Phase 1 architectural invariants and workflow requirements:
 *   1. Circle Creation & Ownership Invariants (Family, Caregiver, Patient rejected, 1 active circle per user).
 *   2. 6-Digit Numeric Invitations & Join Request Engine (Strict 6 digits, 72h TTL, Used on join request, no reuse).
 *   3. Patient Join Workflow & Patient-Circle Association (No admin add-patient shortcut, explicit acceptance).
 *   4. Canonical Delegated Permissions Service (Strictly 4 canonical permissions, Intrinsic Owner authority, meta-delegation limits).
 *   5. Caregiver Contractual Relationship Lifecycle (Active, Suspended, Restored, 7-day Notice Period, Immediate Termination, Notice Expiry).
 *   6. Patient Assignment Domain (Explicit scoping, active relationship precondition, independent activation).
 *   7. Resource-Aware Authorization Policy Guards (Caregiver routine CRUD denial, Caregiver sign-off authorization, Safe Zone Owner-only, Alert Resolution Owner-only).
 *   8. Account Deletion Restrictive Behavior (Zero silent cascades, ON DELETE RESTRICT on users.id).
 */
import 'dotenv/config';
//# sourceMappingURL=test_phase1_care_circle_domain.d.ts.map