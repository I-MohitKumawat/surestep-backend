"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const node_assert_1 = __importDefault(require("node:assert"));
const config_1 = __importDefault(require("../db/config"));
const care_circles_service_1 = require("../modules/care-circles/care-circles.service");
const invitations_service_1 = require("../modules/care-circles/invitations.service");
const permissions_service_1 = require("../modules/care-circles/permissions.service");
const caregiver_relationships_service_1 = require("../modules/care-circles/caregiver-relationships.service");
const patient_assignments_service_1 = require("../modules/care-circles/patient-assignments.service");
const careCircleGuards_1 = require("../shared/middleware/careCircleGuards");
let totalTests = 0;
let passedTests = 0;
async function test(name, fn) {
    totalTests++;
    try {
        await fn();
        passedTests++;
        console.log(`  ✓ [PASS] ${name}`);
    }
    catch (err) {
        console.error(`  ✗ [FAIL] ${name}:`, err.message || err);
        throw err;
    }
}
async function runPhase1Suite() {
    console.log('======================================================================');
    console.log('SURESTEP PHASE 1: CARE CIRCLE DOMAIN FOUNDATION INTEGRATION SUITE');
    console.log('Target Database: PostgreSQL Engine (Port 5433 / dev)');
    console.log('Zero Mocking — Real Database Queries, Invariants, and Transactions');
    console.log('======================================================================\n');
    const runId = Date.now();
    // Helper to create test users
    async function createUser(role, label) {
        const uid = `fb-${label}-${runId}-${Math.floor(Math.random() * 10000)}`;
        const email = `${label}-${runId}-${Math.floor(Math.random() * 10000)}@test.com`;
        const phone = `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`;
        const res = await config_1.default.query(`INSERT INTO users (firebase_uid, email, phone, name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`, [uid, email, phone, `${label} User`, role]);
        return res.rows[0];
    }
    // Seed test users
    const familyOwner = await createUser('FAMILY', 'owner1');
    const caregiverOwner = await createUser('CAREGIVER', 'cgOwner');
    const patientUser = await createUser('PATIENT', 'patient1');
    const familyMember = await createUser('FAMILY', 'member1');
    const caregiverMember = await createUser('CAREGIVER', 'cgMember1');
    const externalUser = await createUser('FAMILY', 'unauthorized1');
    console.log('--- 1. Circle Creation & Ownership Invariants ---');
    let circle1;
    await test('1.1: Family member can create a Care Circle and becomes intrinsic Owner', async () => {
        circle1 = await care_circles_service_1.careCirclesService.createCareCircle(familyOwner.id, 'Oak Family Care Circle');
        node_assert_1.default.strictEqual(circle1.name, 'Oak Family Care Circle');
        node_assert_1.default.strictEqual(circle1.owner_id, familyOwner.id);
        node_assert_1.default.strictEqual(circle1.membership.role_in_circle, 'OWNER');
        node_assert_1.default.strictEqual(circle1.terminated_at, null);
    });
    await test('1.2: Professional Caregiver can create and own a Care Circle', async () => {
        const cgCircle = await care_circles_service_1.careCirclesService.createCareCircle(caregiverOwner.id, 'Apex Care Agency Circle');
        node_assert_1.default.strictEqual(cgCircle.owner_id, caregiverOwner.id);
        node_assert_1.default.strictEqual(cgCircle.membership.role_in_circle, 'OWNER');
    });
    await test('1.3: Patient CANNOT create a Care Circle (rejected with 403 PATIENT_CANNOT_CREATE_CIRCLE)', async () => {
        try {
            await care_circles_service_1.careCirclesService.createCareCircle(patientUser.id, 'Patient Self Circle');
            node_assert_1.default.fail('Should have rejected Patient circle creation');
        }
        catch (err) {
            node_assert_1.default.strictEqual(err.code, 'PATIENT_CANNOT_CREATE_CIRCLE');
            node_assert_1.default.strictEqual(err.statusCode, 403);
        }
    });
    await test('1.4: Single active Circle invariant: Owner cannot create a second active Circle', async () => {
        try {
            await care_circles_service_1.careCirclesService.createCareCircle(familyOwner.id, 'Duplicate Active Circle');
            node_assert_1.default.fail('Should have rejected duplicate active circle creation');
        }
        catch (err) {
            node_assert_1.default.strictEqual(err.code, 'ACTIVE_CIRCLE_EXISTS');
            node_assert_1.default.strictEqual(err.statusCode, 409);
        }
    });
    await test('1.5: Short circle name (< 2 characters) is rejected with 400 INVALID_INPUT', async () => {
        const tempUser = await createUser('FAMILY', 'tempOwner');
        try {
            await care_circles_service_1.careCirclesService.createCareCircle(tempUser.id, ' ');
            node_assert_1.default.fail('Should have rejected empty name');
        }
        catch (err) {
            node_assert_1.default.strictEqual(err.code, 'INVALID_INPUT');
            node_assert_1.default.strictEqual(err.statusCode, 400);
        }
    });
    console.log('\n--- 2. 6-Digit Numeric Invitations & Join Request Engine ---');
    let inviteCode;
    let invitationId;
    await test('2.1: Owner can generate a 6-digit numeric invitation code with 72h TTL', async () => {
        const inv = await invitations_service_1.invitationsService.generateInvitation(circle1.id, familyOwner.id);
        node_assert_1.default.match(inv.code, /^[0-9]{6}$/, 'Code must be strictly 6 numeric digits');
        node_assert_1.default.strictEqual(inv.status, 'ACTIVE');
        node_assert_1.default.strictEqual(inv.circle_id, circle1.id);
        node_assert_1.default.ok(new Date(inv.expires_at).getTime() > Date.now() + 71 * 60 * 60 * 1000);
        inviteCode = inv.code;
        invitationId = inv.id;
    });
    await test('2.2: Regenerating an invitation revokes the previous active invitation', async () => {
        const newInv = await invitations_service_1.invitationsService.generateInvitation(circle1.id, familyOwner.id);
        node_assert_1.default.notStrictEqual(newInv.code, inviteCode);
        const oldCheck = await config_1.default.query('SELECT status FROM circle_invitations WHERE id = $1', [invitationId]);
        node_assert_1.default.strictEqual(oldCheck.rows[0].status, 'REVOKED');
        inviteCode = newInv.code;
        invitationId = newInv.id;
    });
    await test('2.3: Looking up an invitation code returns basic circle info without exposing Patient data', async () => {
        const resolved = await invitations_service_1.invitationsService.getInvitationByCode(inviteCode);
        node_assert_1.default.strictEqual(resolved.circleId, circle1.id);
        node_assert_1.default.strictEqual(resolved.circleName, 'Oak Family Care Circle');
        node_assert_1.default.strictEqual(resolved.ownerName, familyOwner.name);
        node_assert_1.default.strictEqual(resolved.patients, undefined, 'Must not expose patient data');
    });
    let familyJoinReq;
    await test('2.4: Submitting a join request marks invitation as USED immediately', async () => {
        familyJoinReq = await invitations_service_1.invitationsService.submitJoinRequest(inviteCode, familyMember.id);
        node_assert_1.default.strictEqual(familyJoinReq.status, 'PENDING');
        node_assert_1.default.strictEqual(familyJoinReq.circle_id, circle1.id);
        node_assert_1.default.strictEqual(familyJoinReq.user_id, familyMember.id);
        const invCheck = await config_1.default.query('SELECT status, used_at FROM circle_invitations WHERE id = $1', [invitationId]);
        node_assert_1.default.strictEqual(invCheck.rows[0].status, 'USED');
        node_assert_1.default.ok(invCheck.rows[0].used_at !== null);
    });
    await test('2.5: A USED invitation cannot be reused to submit another join request', async () => {
        try {
            await invitations_service_1.invitationsService.submitJoinRequest(inviteCode, caregiverMember.id);
            node_assert_1.default.fail('Should have rejected reusing USED invitation');
        }
        catch (err) {
            node_assert_1.default.strictEqual(err.code, 'INVITATION_INACTIVE');
            node_assert_1.default.strictEqual(err.statusCode, 400);
        }
    });
    await test('2.6: Review join request: Owner accepts family member into Circle', async () => {
        const reviewResult = await invitations_service_1.invitationsService.reviewJoinRequest(familyJoinReq.id, familyOwner.id, { decision: 'ACCEPTED' });
        node_assert_1.default.strictEqual(reviewResult.request.status, 'ACCEPTED');
        node_assert_1.default.strictEqual(reviewResult.membership.role_in_circle, 'MEMBER');
        node_assert_1.default.strictEqual(reviewResult.membership.user_id, familyMember.id);
    });
    let rejectedJoinReq;
    await test('2.7: Review join request: Owner can reject an applicant', async () => {
        const newInv = await invitations_service_1.invitationsService.generateInvitation(circle1.id, familyOwner.id);
        const applicantToReject = await createUser('FAMILY', 'rejectMe');
        rejectedJoinReq = await invitations_service_1.invitationsService.submitJoinRequest(newInv.code, applicantToReject.id);
        const reviewResult = await invitations_service_1.invitationsService.reviewJoinRequest(rejectedJoinReq.id, familyOwner.id, { decision: 'REJECTED' });
        node_assert_1.default.strictEqual(reviewResult.request.status, 'REJECTED');
        node_assert_1.default.strictEqual(reviewResult.membership, null);
    });
    console.log('\n--- 3. Patient Join Workflow & Patient-Circle Association ---');
    let patientJoinReq;
    let patientAssoc;
    await test('3.1: Patient enters 6-digit code and explicitly submits join request', async () => {
        const patientInv = await invitations_service_1.invitationsService.generateInvitation(circle1.id, familyOwner.id);
        patientJoinReq = await invitations_service_1.invitationsService.submitJoinRequest(patientInv.code, patientUser.id);
        node_assert_1.default.strictEqual(patientJoinReq.status, 'PENDING');
        node_assert_1.default.strictEqual(patientJoinReq.user_id, patientUser.id);
    });
    await test('3.2: Reviewer accepts Patient -> creates patient_circle_associations row + membership', async () => {
        const reviewResult = await invitations_service_1.invitationsService.reviewJoinRequest(patientJoinReq.id, familyOwner.id, { decision: 'ACCEPTED' });
        node_assert_1.default.strictEqual(reviewResult.request.status, 'ACCEPTED');
        node_assert_1.default.ok(reviewResult.association !== null);
        node_assert_1.default.strictEqual(reviewResult.association.patient_id, patientUser.id);
        node_assert_1.default.strictEqual(reviewResult.association.circle_id, circle1.id);
        node_assert_1.default.strictEqual(reviewResult.membership.role_in_circle, 'MEMBER');
        patientAssoc = reviewResult.association;
    });
    await test('3.3: Patient-Circle association is retrievable via getCirclePatients', async () => {
        const patients = await care_circles_service_1.careCirclesService.getCirclePatients(circle1.id);
        node_assert_1.default.strictEqual(patients.length, 1);
        node_assert_1.default.strictEqual(patients[0].patient_id, patientUser.id);
    });
    console.log('\n--- 4. Canonical Delegated Permissions Service ---');
    let familyMemberId;
    await test('4.1: Retrieve member ID of family member', async () => {
        const members = await care_circles_service_1.careCirclesService.getCircleMembers(circle1.id);
        const fm = members.find((m) => m.user_id === familyMember.id);
        node_assert_1.default.ok(fm, 'Family member must exist in circle');
        familyMemberId = fm.member_id;
    });
    await test('4.2: Owner can grant canonical "Manage Member Permissions" to family member', async () => {
        const p1 = await permissions_service_1.permissionsService.grantPermission(circle1.id, familyOwner.id, familyMemberId, 'Manage Member Permissions');
        node_assert_1.default.strictEqual(p1.permission_name, 'Manage Member Permissions');
        node_assert_1.default.strictEqual(p1.member_id, familyMemberId);
        const hasP = await permissions_service_1.permissionsService.hasPermission(circle1.id, familyMember.id, 'Manage Member Permissions');
        node_assert_1.default.strictEqual(hasP, true);
    });
    await test('4.3: Owner has intrinsic authority for all 4 canonical operations without permission rows', async () => {
        for (const perm of [
            'Manage Member Permissions',
            'Manage Caregiver Relationships',
            'Search/Request Caregivers',
            'Manage Patient Memories',
        ]) {
            const hasIt = await permissions_service_1.permissionsService.hasPermission(circle1.id, familyOwner.id, perm);
            node_assert_1.default.strictEqual(hasIt, true, `Owner must have intrinsic authority for ${perm}`);
        }
        // Assert zero permission rows exist for Owner
        const ownerRows = await config_1.default.query(`SELECT p.id FROM circle_permissions p
       JOIN care_circle_members m ON p.member_id = m.id
       WHERE m.circle_id = $1 AND m.user_id = $2`, [circle1.id, familyOwner.id]);
        node_assert_1.default.strictEqual(ownerRows.rows.length, 0, 'Owner must NOT have persisted permission rows');
    });
    await test('4.4: Non-canonical permission names are strictly rejected (e.g. Care Execution Authority)', async () => {
        try {
            await permissions_service_1.permissionsService.grantPermission(circle1.id, familyOwner.id, familyMemberId, 'Care Execution Authority');
            node_assert_1.default.fail('Should have rejected non-canonical permission');
        }
        catch (err) {
            node_assert_1.default.strictEqual(err.code, 'INVALID_PERMISSION');
            node_assert_1.default.strictEqual(err.statusCode, 400);
        }
    });
    await test('4.5: Delegated member CANNOT grant permissions to themselves', async () => {
        try {
            await permissions_service_1.permissionsService.grantPermission(circle1.id, familyMember.id, familyMemberId, 'Search/Request Caregivers');
            node_assert_1.default.fail('Should have rejected self-granting of permissions');
        }
        catch (err) {
            node_assert_1.default.strictEqual(err.code, 'SELF_GRANT_FORBIDDEN');
            node_assert_1.default.strictEqual(err.statusCode, 403);
        }
    });
    await test('4.6: Delegated member CANNOT grant "Manage Member Permissions" (Owner only)', async () => {
        // Add another member
        const anotherMemberUser = await createUser('FAMILY', 'anotherMember');
        const anotherMem = await config_1.default.query(`INSERT INTO care_circle_members (circle_id, user_id, role_in_circle)
       VALUES ($1, $2, 'MEMBER') RETURNING id`, [circle1.id, anotherMemberUser.id]);
        const anotherMemberId = anotherMem.rows[0].id;
        try {
            await permissions_service_1.permissionsService.grantPermission(circle1.id, familyMember.id, anotherMemberId, 'Manage Member Permissions');
            node_assert_1.default.fail('Should have rejected delegating Manage Member Permissions by non-owner');
        }
        catch (err) {
            node_assert_1.default.strictEqual(err.code, 'OWNER_ONLY_PERMISSION');
            node_assert_1.default.strictEqual(err.statusCode, 403);
        }
    });
    await test('4.7: Revoking a permission removes it immediately', async () => {
        await permissions_service_1.permissionsService.revokePermission(circle1.id, familyOwner.id, familyMemberId, 'Manage Member Permissions');
        const hasP = await permissions_service_1.permissionsService.hasPermission(circle1.id, familyMember.id, 'Manage Member Permissions');
        node_assert_1.default.strictEqual(hasP, false);
        // Re-grant Manage Member Permissions and Manage Caregiver Relationships for subsequent tests
        await permissions_service_1.permissionsService.grantPermission(circle1.id, familyOwner.id, familyMemberId, 'Manage Member Permissions');
        await permissions_service_1.permissionsService.grantPermission(circle1.id, familyOwner.id, familyMemberId, 'Manage Caregiver Relationships');
    });
    console.log('\n--- 5. Caregiver Contractual Relationship Lifecycle ---');
    let caregiverRelationshipId;
    await test('5.1: Caregiver joins Circle and formal relationship is established in ACTIVE status', async () => {
        // Caregiver joins circle first
        const cgInv = await invitations_service_1.invitationsService.generateInvitation(circle1.id, familyOwner.id);
        const cgJoinReq = await invitations_service_1.invitationsService.submitJoinRequest(cgInv.code, caregiverMember.id);
        await invitations_service_1.invitationsService.reviewJoinRequest(cgJoinReq.id, familyOwner.id, { decision: 'ACCEPTED' });
        // Establish caregiver relationship
        const rel = await caregiver_relationships_service_1.caregiverRelationshipsService.establishRelationship(circle1.id, familyOwner.id, caregiverMember.id);
        node_assert_1.default.strictEqual(rel.status, 'ACTIVE');
        node_assert_1.default.strictEqual(rel.circle_id, circle1.id);
        node_assert_1.default.strictEqual(rel.caregiver_id, caregiverMember.id);
        caregiverRelationshipId = rel.id;
    });
    await test('5.2: Suspending a relationship transitions status to SUSPENDED and deactivates assignments', async () => {
        // Create an assignment first
        await patient_assignments_service_1.patientAssignmentsService.assignCaregiverToPatient(caregiverRelationshipId, patientUser.id, familyOwner.id);
        let isAssigned = await patient_assignments_service_1.patientAssignmentsService.isCaregiverAssignedToPatient(caregiverMember.id, patientUser.id);
        node_assert_1.default.strictEqual(isAssigned, true);
        // Suspend
        const suspended = await caregiver_relationships_service_1.caregiverRelationshipsService.suspendRelationship(caregiverRelationshipId, familyOwner.id);
        node_assert_1.default.strictEqual(suspended.status, 'SUSPENDED');
        // Assignment must now be inactive
        isAssigned = await patient_assignments_service_1.patientAssignmentsService.isCaregiverAssignedToPatient(caregiverMember.id, patientUser.id);
        node_assert_1.default.strictEqual(isAssigned, false, 'Suspended caregiver cannot have active patient assignment');
    });
    await test('5.3: Restoring a suspended relationship returns status to ACTIVE and restores assignments', async () => {
        const restored = await caregiver_relationships_service_1.caregiverRelationshipsService.restoreRelationship(caregiverRelationshipId, familyOwner.id);
        node_assert_1.default.strictEqual(restored.status, 'ACTIVE');
        const isAssigned = await patient_assignments_service_1.patientAssignmentsService.isCaregiverAssignedToPatient(caregiverMember.id, patientUser.id);
        node_assert_1.default.strictEqual(isAssigned, true, 'Restored caregiver assignments are reactivated');
    });
    await test('5.4: Caregiver-initiated departure enters 7-day NOTICE_PERIOD and preserves care access', async () => {
        const notice = await caregiver_relationships_service_1.caregiverRelationshipsService.submitNotice(caregiverRelationshipId, caregiverMember.id, { reason: 'RELOCATION' });
        node_assert_1.default.strictEqual(notice.status, 'NOTICE_PERIOD');
        node_assert_1.default.ok(notice.notice_started_at !== null);
        node_assert_1.default.ok(notice.notice_expires_at !== null);
        node_assert_1.default.strictEqual(notice.termination_reason, 'RELOCATION');
        // Care access preserved during notice period
        const isAssigned = await patient_assignments_service_1.patientAssignmentsService.isCaregiverAssignedToPatient(caregiverMember.id, patientUser.id);
        node_assert_1.default.strictEqual(isAssigned, true, 'Notice period preserves active patient assignment and care access');
    });
    await test('5.5: Immediate Family termination ends relationship immediately from NOTICE_PERIOD', async () => {
        const term = await caregiver_relationships_service_1.caregiverRelationshipsService.terminateImmediate(caregiverRelationshipId, familyOwner.id, { reason: 'REPLACEMENT_FOUND', notes: 'Replacement caregiver started' });
        node_assert_1.default.strictEqual(term.status, 'TERMINATED');
        node_assert_1.default.ok(term.ended_at !== null);
        const isAssigned = await patient_assignments_service_1.patientAssignmentsService.isCaregiverAssignedToPatient(caregiverMember.id, patientUser.id);
        node_assert_1.default.strictEqual(isAssigned, false, 'Terminated caregiver cannot have active assignment');
    });
    await test('5.6: Automatic 7-day notice expiration transitions relationship to TERMINATED', async () => {
        // Establish a second caregiver relationship for notice expiration test
        const cg2 = await createUser('CAREGIVER', 'cgNoticeExpired');
        const inv2 = await invitations_service_1.invitationsService.generateInvitation(circle1.id, familyOwner.id);
        const jr2 = await invitations_service_1.invitationsService.submitJoinRequest(inv2.code, cg2.id);
        await invitations_service_1.invitationsService.reviewJoinRequest(jr2.id, familyOwner.id, { decision: 'ACCEPTED' });
        const rel2 = await caregiver_relationships_service_1.caregiverRelationshipsService.establishRelationship(circle1.id, familyOwner.id, cg2.id);
        await patient_assignments_service_1.patientAssignmentsService.assignCaregiverToPatient(rel2.id, patientUser.id, familyOwner.id);
        // Set notice_expires_at in the past
        await config_1.default.query(`UPDATE caregiver_relationships
       SET status = 'NOTICE_PERIOD', notice_started_at = NOW() - INTERVAL '8 days', notice_expires_at = NOW() - INTERVAL '1 day'
       WHERE id = $1`, [rel2.id]);
        // Process expired notices
        const result = await caregiver_relationships_service_1.caregiverRelationshipsService.processExpiredNotices();
        node_assert_1.default.ok(result.expiredIds.includes(rel2.id), 'rel2 must be expired');
        const check = await config_1.default.query('SELECT status, termination_reason FROM caregiver_relationships WHERE id = $1', [rel2.id]);
        node_assert_1.default.strictEqual(check.rows[0].status, 'TERMINATED');
        node_assert_1.default.strictEqual(check.rows[0].termination_reason, 'NOTICE_PERIOD_EXPIRED');
        const isAssigned = await patient_assignments_service_1.patientAssignmentsService.isCaregiverAssignedToPatient(cg2.id, patientUser.id);
        node_assert_1.default.strictEqual(isAssigned, false);
    });
    console.log('\n--- 6. Patient Assignment Domain & Scoping ---');
    let activeRel;
    let activeCg;
    await test('6.1: Active caregiver can be assigned to multiple patients within the Circle', async () => {
        activeCg = await createUser('CAREGIVER', 'cgMultiAssign');
        const inv = await invitations_service_1.invitationsService.generateInvitation(circle1.id, familyOwner.id);
        const jr = await invitations_service_1.invitationsService.submitJoinRequest(inv.code, activeCg.id);
        await invitations_service_1.invitationsService.reviewJoinRequest(jr.id, familyOwner.id, { decision: 'ACCEPTED' });
        activeRel = await caregiver_relationships_service_1.caregiverRelationshipsService.establishRelationship(circle1.id, familyOwner.id, activeCg.id);
        // Assign to Patient 1
        const a1 = await patient_assignments_service_1.patientAssignmentsService.assignCaregiverToPatient(activeRel.id, patientUser.id, familyOwner.id);
        node_assert_1.default.strictEqual(a1.is_active, true);
        node_assert_1.default.strictEqual(a1.patient_id, patientUser.id);
        // Add Patient 2 to Circle
        const patient2 = await createUser('PATIENT', 'patient2');
        const invP2 = await invitations_service_1.invitationsService.generateInvitation(circle1.id, familyOwner.id);
        const jrP2 = await invitations_service_1.invitationsService.submitJoinRequest(invP2.code, patient2.id);
        await invitations_service_1.invitationsService.reviewJoinRequest(jrP2.id, familyOwner.id, { decision: 'ACCEPTED' });
        // Assign to Patient 2
        const a2 = await patient_assignments_service_1.patientAssignmentsService.assignCaregiverToPatient(activeRel.id, patient2.id, familyOwner.id);
        node_assert_1.default.strictEqual(a2.is_active, true);
        node_assert_1.default.strictEqual(a2.patient_id, patient2.id);
        // Verify assigned list
        const assignedList = await patient_assignments_service_1.patientAssignmentsService.getCaregiverAssignedPatients(activeCg.id);
        node_assert_1.default.strictEqual(assignedList.length, 2);
    });
    await test('6.2: Revoking an assignment sets is_active = FALSE without deleting relationship', async () => {
        await patient_assignments_service_1.patientAssignmentsService.revokePatientAssignment(activeRel.id, patientUser.id, familyOwner.id);
        const isAssigned = await patient_assignments_service_1.patientAssignmentsService.isCaregiverAssignedToPatient(activeCg.id, patientUser.id);
        node_assert_1.default.strictEqual(isAssigned, false);
        const relCheck = await config_1.default.query('SELECT status FROM caregiver_relationships WHERE id = $1', [activeRel.id]);
        node_assert_1.default.strictEqual(relCheck.rows[0].status, 'ACTIVE');
        // Re-assign for subsequent guard tests
        await patient_assignments_service_1.patientAssignmentsService.assignCaregiverToPatient(activeRel.id, patientUser.id, familyOwner.id);
    });
    console.log('\n--- 7. Resource-Aware Authorization Policy Guards ---');
    // Helper to run express middleware
    function runMiddleware(middleware, req) {
        return new Promise((resolve) => {
            middleware(req, {}, (err) => {
                if (err)
                    resolve({ nextCalled: false, err });
                else
                    resolve({ nextCalled: true });
            });
        });
    }
    await test('7.1: requireRoutineDefinitionCRUDAuthority DENIES Professional Caregiver (even if Circle Owner or assigned)', async () => {
        const guard = (0, careCircleGuards_1.requireRoutineDefinitionCRUDAuthority)('patientId');
        const req = {
            params: { patientId: patientUser.id },
            user: { id: activeCg.id, role: 'CAREGIVER' },
        };
        const res = await runMiddleware(guard, req);
        node_assert_1.default.strictEqual(res.nextCalled, false);
        node_assert_1.default.strictEqual(res.err?.code, 'CAREGIVER_ROUTINE_CRUD_FORBIDDEN');
        node_assert_1.default.strictEqual(res.err?.statusCode, 403);
    });
    await test('7.2: requireRoutineDefinitionCRUDAuthority ALLOWS authorized Family Member in patient Circle', async () => {
        const guard = (0, careCircleGuards_1.requireRoutineDefinitionCRUDAuthority)('patientId');
        const req = {
            params: { patientId: patientUser.id },
            user: { id: familyOwner.id, role: 'FAMILY' },
        };
        const res = await runMiddleware(guard, req);
        node_assert_1.default.strictEqual(res.nextCalled, true);
        node_assert_1.default.strictEqual(res.err, undefined);
    });
    await test('7.3: requireRoutineSignOffAuthority ALLOWS Caregiver WITH active relationship & patient assignment', async () => {
        const guard = (0, careCircleGuards_1.requireRoutineSignOffAuthority)('patientId');
        const req = {
            params: { patientId: patientUser.id },
            user: { id: activeCg.id, role: 'CAREGIVER' },
        };
        const res = await runMiddleware(guard, req);
        node_assert_1.default.strictEqual(res.nextCalled, true);
        node_assert_1.default.strictEqual(res.err, undefined);
    });
    await test('7.4: requireRoutineSignOffAuthority DENIES Caregiver WITHOUT patient assignment', async () => {
        const unassignedCg = await createUser('CAREGIVER', 'cgUnassigned');
        const guard = (0, careCircleGuards_1.requireRoutineSignOffAuthority)('patientId');
        const req = {
            params: { patientId: patientUser.id },
            user: { id: unassignedCg.id, role: 'CAREGIVER' },
        };
        const res = await runMiddleware(guard, req);
        node_assert_1.default.strictEqual(res.nextCalled, false);
        node_assert_1.default.strictEqual(res.err?.code, 'CAREGIVER_NOT_ASSIGNED');
        node_assert_1.default.strictEqual(res.err?.statusCode, 403);
    });
    await test('7.5: requireSafeZoneManagementAuthority is strictly Circle Owner only (non-owner member denied with 403)', async () => {
        const guard = (0, careCircleGuards_1.requireSafeZoneManagementAuthority)('circleId');
        const req = {
            params: { circleId: circle1.id },
            user: { id: familyMember.id, role: 'FAMILY' },
        };
        const res = await runMiddleware(guard, req);
        node_assert_1.default.strictEqual(res.nextCalled, false);
        node_assert_1.default.strictEqual(res.err?.code, 'OWNER_ONLY');
        node_assert_1.default.strictEqual(res.err?.statusCode, 403);
    });
    await test('7.6: requireSafeZoneManagementAuthority ALLOWS Circle Owner', async () => {
        const guard = (0, careCircleGuards_1.requireSafeZoneManagementAuthority)('circleId');
        const req = {
            params: { circleId: circle1.id },
            user: { id: familyOwner.id, role: 'FAMILY' },
        };
        const res = await runMiddleware(guard, req);
        node_assert_1.default.strictEqual(res.nextCalled, true);
        node_assert_1.default.strictEqual(res.err, undefined);
    });
    await test('7.7: requireAlertResolutionAuthority is strictly Circle Owner only', async () => {
        const guard = (0, careCircleGuards_1.requireAlertResolutionAuthority)('circleId');
        // Caregiver denied
        const cgReq = {
            params: { circleId: circle1.id },
            user: { id: activeCg.id, role: 'CAREGIVER' },
        };
        const cgRes = await runMiddleware(guard, cgReq);
        node_assert_1.default.strictEqual(cgRes.nextCalled, false);
        node_assert_1.default.strictEqual(cgRes.err?.code, 'OWNER_ONLY');
        // Family Member denied
        const fmReq = {
            params: { circleId: circle1.id },
            user: { id: familyMember.id, role: 'FAMILY' },
        };
        const fmRes = await runMiddleware(guard, fmReq);
        node_assert_1.default.strictEqual(fmRes.nextCalled, false);
        node_assert_1.default.strictEqual(fmRes.err?.code, 'OWNER_ONLY');
        // Owner allowed
        const ownerReq = {
            params: { circleId: circle1.id },
            user: { id: familyOwner.id, role: 'FAMILY' },
        };
        const ownerRes = await runMiddleware(guard, ownerReq);
        node_assert_1.default.strictEqual(ownerRes.nextCalled, true);
    });
    console.log('\n--- 8. Account Deletion Restrictive Behavior (Zero Silent Cascades) ---');
    await test('8.1: Deleting Circle Owner is blocked by ON DELETE RESTRICT on care_circles.owner_id', async () => {
        try {
            await config_1.default.query('DELETE FROM users WHERE id = $1', [familyOwner.id]);
            node_assert_1.default.fail('Should have blocked deleting circle owner');
        }
        catch (err) {
            node_assert_1.default.ok(err.code === '23001' || err.code === '23503', `Expected SQLSTATE 23001 or 23503, got ${err.code}`);
        }
    });
    await test('8.2: Deleting Patient is blocked by ON DELETE RESTRICT on patient_id in associations and assignments', async () => {
        try {
            await config_1.default.query('DELETE FROM users WHERE id = $1', [patientUser.id]);
            node_assert_1.default.fail('Should have blocked deleting patient with active dependencies');
        }
        catch (err) {
            node_assert_1.default.ok(err.code === '23001' || err.code === '23503', `Expected SQLSTATE 23001 or 23503, got ${err.code}`);
        }
    });
    await test('8.3: Deleting Caregiver is blocked by ON DELETE RESTRICT on caregiver_relationships.caregiver_id', async () => {
        try {
            await config_1.default.query('DELETE FROM users WHERE id = $1', [activeCg.id]);
            node_assert_1.default.fail('Should have blocked deleting caregiver with active contract');
        }
        catch (err) {
            node_assert_1.default.ok(err.code === '23001' || err.code === '23503', `Expected SQLSTATE 23001 or 23503, got ${err.code}`);
        }
    });
    console.log('\n======================================================================');
    console.log(`PHASE 1 INTEGRATION SUITE COMPLETE: ${passedTests} / ${totalTests} TESTS PASSED!`);
    console.log('100% Core Domain Services, Invariants, and Authorization Guards Verified!');
    console.log('======================================================================\n');
}
runPhase1Suite()
    .then(() => config_1.default.end())
    .catch((err) => {
    console.error('Test suite failed:', err);
    config_1.default.end();
    process.exit(1);
});
//# sourceMappingURL=test_phase1_care_circle_domain.js.map