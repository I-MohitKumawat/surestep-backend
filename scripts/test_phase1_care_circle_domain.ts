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
import assert from 'node:assert';
import pool from '../db/config';
import { careCirclesService } from '../modules/care-circles/care-circles.service';
import { invitationsService } from '../modules/care-circles/invitations.service';
import { permissionsService } from '../modules/care-circles/permissions.service';
import { caregiverRelationshipsService } from '../modules/care-circles/caregiver-relationships.service';
import { patientAssignmentsService } from '../modules/care-circles/patient-assignments.service';
import {
  requireRoutineDefinitionCRUDAuthority,
  requireRoutineSignOffAuthority,
  requireSafeZoneManagementAuthority,
  requireAlertResolutionAuthority,
} from '../shared/middleware/careCircleGuards';
import { CanonicalPermissionName } from '../modules/care-circles/care-circles.types';

let totalTests = 0;
let passedTests = 0;

async function test(name: string, fn: () => Promise<void>) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err: any) {
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
  async function createUser(role: 'FAMILY' | 'CAREGIVER' | 'PATIENT', label: string) {
    const uid = `fb-${label}-${runId}-${Math.floor(Math.random() * 10000)}`;
    const email = `${label}-${runId}-${Math.floor(Math.random() * 10000)}@test.com`;
    const phone = `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    const res = await pool.query(
      `INSERT INTO users (firebase_uid, email, phone, name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [uid, email, phone, `${label} User`, role]
    );
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

  let circle1: any;
  await test('1.1: Family member can create a Care Circle and becomes intrinsic Owner', async () => {
    circle1 = await careCirclesService.createCareCircle(familyOwner.id, 'Oak Family Care Circle');
    assert.strictEqual(circle1.name, 'Oak Family Care Circle');
    assert.strictEqual(circle1.owner_id, familyOwner.id);
    assert.strictEqual(circle1.membership.role_in_circle, 'OWNER');
    assert.strictEqual(circle1.terminated_at, null);
  });

  await test('1.2: Professional Caregiver can create and own a Care Circle', async () => {
    const cgCircle = await careCirclesService.createCareCircle(caregiverOwner.id, 'Apex Care Agency Circle');
    assert.strictEqual(cgCircle.owner_id, caregiverOwner.id);
    assert.strictEqual(cgCircle.membership.role_in_circle, 'OWNER');
  });

  await test('1.3: Patient CANNOT create a Care Circle (rejected with 403 PATIENT_CANNOT_CREATE_CIRCLE)', async () => {
    try {
      await careCirclesService.createCareCircle(patientUser.id, 'Patient Self Circle');
      assert.fail('Should have rejected Patient circle creation');
    } catch (err: any) {
      assert.strictEqual(err.code, 'PATIENT_CANNOT_CREATE_CIRCLE');
      assert.strictEqual(err.statusCode, 403);
    }
  });

  await test('1.4: Single active Circle invariant: Owner cannot create a second active Circle', async () => {
    try {
      await careCirclesService.createCareCircle(familyOwner.id, 'Duplicate Active Circle');
      assert.fail('Should have rejected duplicate active circle creation');
    } catch (err: any) {
      assert.strictEqual(err.code, 'ACTIVE_CIRCLE_EXISTS');
      assert.strictEqual(err.statusCode, 409);
    }
  });

  await test('1.5: Short circle name (< 2 characters) is rejected with 400 INVALID_INPUT', async () => {
    const tempUser = await createUser('FAMILY', 'tempOwner');
    try {
      await careCirclesService.createCareCircle(tempUser.id, ' ');
      assert.fail('Should have rejected empty name');
    } catch (err: any) {
      assert.strictEqual(err.code, 'INVALID_INPUT');
      assert.strictEqual(err.statusCode, 400);
    }
  });

  console.log('\n--- 2. 6-Digit Numeric Invitations & Join Request Engine ---');

  let inviteCode: string;
  let invitationId: string;

  await test('2.1: Owner can generate a 6-digit numeric invitation code with 72h TTL', async () => {
    const inv = await invitationsService.generateInvitation(circle1.id, familyOwner.id);
    assert.match(inv.code, /^[0-9]{6}$/, 'Code must be strictly 6 numeric digits');
    assert.strictEqual(inv.status, 'ACTIVE');
    assert.strictEqual(inv.circle_id, circle1.id);
    assert.ok(new Date(inv.expires_at).getTime() > Date.now() + 71 * 60 * 60 * 1000);
    inviteCode = inv.code;
    invitationId = inv.id;
  });

  await test('2.2: Regenerating an invitation revokes the previous active invitation', async () => {
    const newInv = await invitationsService.generateInvitation(circle1.id, familyOwner.id);
    assert.notStrictEqual(newInv.code, inviteCode);
    const oldCheck = await pool.query('SELECT status FROM circle_invitations WHERE id = $1', [invitationId]);
    assert.strictEqual(oldCheck.rows[0].status, 'REVOKED');
    inviteCode = newInv.code;
    invitationId = newInv.id;
  });

  await test('2.3: Looking up an invitation code returns basic circle info without exposing Patient data', async () => {
    const resolved = await invitationsService.getInvitationByCode(inviteCode);
    assert.strictEqual(resolved.circleId, circle1.id);
    assert.strictEqual(resolved.circleName, 'Oak Family Care Circle');
    assert.strictEqual(resolved.ownerName, familyOwner.name);
    assert.strictEqual((resolved as any).patients, undefined, 'Must not expose patient data');
  });

  let familyJoinReq: any;
  await test('2.4: Submitting a join request marks invitation as USED immediately', async () => {
    familyJoinReq = await invitationsService.submitJoinRequest(inviteCode, familyMember.id);
    assert.strictEqual(familyJoinReq.status, 'PENDING');
    assert.strictEqual(familyJoinReq.circle_id, circle1.id);
    assert.strictEqual(familyJoinReq.user_id, familyMember.id);

    const invCheck = await pool.query('SELECT status, used_at FROM circle_invitations WHERE id = $1', [invitationId]);
    assert.strictEqual(invCheck.rows[0].status, 'USED');
    assert.ok(invCheck.rows[0].used_at !== null);
  });

  await test('2.5: A USED invitation cannot be reused to submit another join request', async () => {
    try {
      await invitationsService.submitJoinRequest(inviteCode, caregiverMember.id);
      assert.fail('Should have rejected reusing USED invitation');
    } catch (err: any) {
      assert.strictEqual(err.code, 'INVITATION_INACTIVE');
      assert.strictEqual(err.statusCode, 400);
    }
  });

  await test('2.6: Review join request: Owner accepts family member into Circle', async () => {
    const reviewResult = await invitationsService.reviewJoinRequest(familyJoinReq.id, familyOwner.id, { decision: 'ACCEPTED' });
    assert.strictEqual(reviewResult.request.status, 'ACCEPTED');
    assert.strictEqual(reviewResult.membership.role_in_circle, 'MEMBER');
    assert.strictEqual(reviewResult.membership.user_id, familyMember.id);
  });

  let rejectedJoinReq: any;
  await test('2.7: Review join request: Owner can reject an applicant', async () => {
    const newInv = await invitationsService.generateInvitation(circle1.id, familyOwner.id);
    const applicantToReject = await createUser('FAMILY', 'rejectMe');
    rejectedJoinReq = await invitationsService.submitJoinRequest(newInv.code, applicantToReject.id);

    const reviewResult = await invitationsService.reviewJoinRequest(rejectedJoinReq.id, familyOwner.id, { decision: 'REJECTED' });
    assert.strictEqual(reviewResult.request.status, 'REJECTED');
    assert.strictEqual(reviewResult.membership, null);
  });

  console.log('\n--- 3. Patient Join Workflow & Patient-Circle Association ---');

  let patientJoinReq: any;
  let patientAssoc: any;
  await test('3.1: Patient enters 6-digit code and explicitly submits join request', async () => {
    const patientInv = await invitationsService.generateInvitation(circle1.id, familyOwner.id);
    patientJoinReq = await invitationsService.submitJoinRequest(patientInv.code, patientUser.id);
    assert.strictEqual(patientJoinReq.status, 'PENDING');
    assert.strictEqual(patientJoinReq.user_id, patientUser.id);
  });

  await test('3.2: Reviewer accepts Patient -> creates patient_circle_associations row + membership', async () => {
    const reviewResult = await invitationsService.reviewJoinRequest(patientJoinReq.id, familyOwner.id, { decision: 'ACCEPTED' });
    assert.strictEqual(reviewResult.request.status, 'ACCEPTED');
    assert.ok(reviewResult.association !== null);
    assert.strictEqual(reviewResult.association.patient_id, patientUser.id);
    assert.strictEqual(reviewResult.association.circle_id, circle1.id);
    assert.strictEqual(reviewResult.membership.role_in_circle, 'MEMBER');
    patientAssoc = reviewResult.association;
  });

  await test('3.3: Patient-Circle association is retrievable via getCirclePatients', async () => {
    const patients = await careCirclesService.getCirclePatients(circle1.id);
    assert.strictEqual(patients.length, 1);
    assert.strictEqual(patients[0].patient_id, patientUser.id);
  });

  console.log('\n--- 4. Canonical Delegated Permissions Service ---');

  let familyMemberId: string;
  await test('4.1: Retrieve member ID of family member', async () => {
    const members = await careCirclesService.getCircleMembers(circle1.id);
    const fm = members.find((m: any) => m.user_id === familyMember.id);
    assert.ok(fm, 'Family member must exist in circle');
    familyMemberId = fm.member_id;
  });

  await test('4.2: Owner can grant canonical "Manage Member Permissions" to family member', async () => {
    const p1 = await permissionsService.grantPermission(
      circle1.id,
      familyOwner.id,
      familyMemberId,
      'Manage Member Permissions'
    );
    assert.strictEqual(p1.permission_name, 'Manage Member Permissions');
    assert.strictEqual(p1.member_id, familyMemberId);

    const hasP = await permissionsService.hasPermission(circle1.id, familyMember.id, 'Manage Member Permissions');
    assert.strictEqual(hasP, true);
  });

  await test('4.3: Owner has intrinsic authority for all 4 canonical operations without permission rows', async () => {
    for (const perm of [
      'Manage Member Permissions',
      'Manage Caregiver Relationships',
      'Search/Request Caregivers',
      'Manage Patient Memories',
    ] as CanonicalPermissionName[]) {
      const hasIt = await permissionsService.hasPermission(circle1.id, familyOwner.id, perm);
      assert.strictEqual(hasIt, true, `Owner must have intrinsic authority for ${perm}`);
    }

    // Assert zero permission rows exist for Owner
    const ownerRows = await pool.query(
      `SELECT p.id FROM circle_permissions p
       JOIN care_circle_members m ON p.member_id = m.id
       WHERE m.circle_id = $1 AND m.user_id = $2`,
      [circle1.id, familyOwner.id]
    );
    assert.strictEqual(ownerRows.rows.length, 0, 'Owner must NOT have persisted permission rows');
  });

  await test('4.4: Non-canonical permission names are strictly rejected (e.g. Care Execution Authority)', async () => {
    try {
      await permissionsService.grantPermission(
        circle1.id,
        familyOwner.id,
        familyMemberId,
        'Care Execution Authority' as any
      );
      assert.fail('Should have rejected non-canonical permission');
    } catch (err: any) {
      assert.strictEqual(err.code, 'INVALID_PERMISSION');
      assert.strictEqual(err.statusCode, 400);
    }
  });

  await test('4.5: Delegated member CANNOT grant permissions to themselves', async () => {
    try {
      await permissionsService.grantPermission(
        circle1.id,
        familyMember.id,
        familyMemberId,
        'Search/Request Caregivers'
      );
      assert.fail('Should have rejected self-granting of permissions');
    } catch (err: any) {
      assert.strictEqual(err.code, 'SELF_GRANT_FORBIDDEN');
      assert.strictEqual(err.statusCode, 403);
    }
  });

  await test('4.6: Delegated member CANNOT grant "Manage Member Permissions" (Owner only)', async () => {
    // Add another member
    const anotherMemberUser = await createUser('FAMILY', 'anotherMember');
    const anotherMem = await pool.query(
      `INSERT INTO care_circle_members (circle_id, user_id, role_in_circle)
       VALUES ($1, $2, 'MEMBER') RETURNING id`,
      [circle1.id, anotherMemberUser.id]
    );
    const anotherMemberId = anotherMem.rows[0].id;

    try {
      await permissionsService.grantPermission(
        circle1.id,
        familyMember.id,
        anotherMemberId,
        'Manage Member Permissions'
      );
      assert.fail('Should have rejected delegating Manage Member Permissions by non-owner');
    } catch (err: any) {
      assert.strictEqual(err.code, 'OWNER_ONLY_PERMISSION');
      assert.strictEqual(err.statusCode, 403);
    }
  });

  await test('4.7: Revoking a permission removes it immediately', async () => {
    await permissionsService.revokePermission(
      circle1.id,
      familyOwner.id,
      familyMemberId,
      'Manage Member Permissions'
    );
    const hasP = await permissionsService.hasPermission(circle1.id, familyMember.id, 'Manage Member Permissions');
    assert.strictEqual(hasP, false);

    // Re-grant Manage Member Permissions and Manage Caregiver Relationships for subsequent tests
    await permissionsService.grantPermission(circle1.id, familyOwner.id, familyMemberId, 'Manage Member Permissions');
    await permissionsService.grantPermission(circle1.id, familyOwner.id, familyMemberId, 'Manage Caregiver Relationships');
  });

  console.log('\n--- 5. Caregiver Contractual Relationship Lifecycle ---');

  let caregiverRelationshipId: string;
  await test('5.1: Caregiver joins Circle and formal relationship is established in ACTIVE status', async () => {
    // Caregiver joins circle first
    const cgInv = await invitationsService.generateInvitation(circle1.id, familyOwner.id);
    const cgJoinReq = await invitationsService.submitJoinRequest(cgInv.code, caregiverMember.id);
    await invitationsService.reviewJoinRequest(cgJoinReq.id, familyOwner.id, { decision: 'ACCEPTED' });

    // Establish caregiver relationship
    const rel = await caregiverRelationshipsService.establishRelationship(circle1.id, familyOwner.id, caregiverMember.id);
    assert.strictEqual(rel.status, 'ACTIVE');
    assert.strictEqual(rel.circle_id, circle1.id);
    assert.strictEqual(rel.caregiver_id, caregiverMember.id);
    caregiverRelationshipId = rel.id;
  });

  await test('5.2: Suspending a relationship transitions status to SUSPENDED and deactivates assignments', async () => {
    // Create an assignment first
    await patientAssignmentsService.assignCaregiverToPatient(caregiverRelationshipId, patientUser.id, familyOwner.id);
    let isAssigned = await patientAssignmentsService.isCaregiverAssignedToPatient(caregiverMember.id, patientUser.id);
    assert.strictEqual(isAssigned, true);

    // Suspend
    const suspended = await caregiverRelationshipsService.suspendRelationship(caregiverRelationshipId, familyOwner.id);
    assert.strictEqual(suspended.status, 'SUSPENDED');

    // Assignment must now be inactive
    isAssigned = await patientAssignmentsService.isCaregiverAssignedToPatient(caregiverMember.id, patientUser.id);
    assert.strictEqual(isAssigned, false, 'Suspended caregiver cannot have active patient assignment');
  });

  await test('5.3: Restoring a suspended relationship returns status to ACTIVE and restores assignments', async () => {
    const restored = await caregiverRelationshipsService.restoreRelationship(caregiverRelationshipId, familyOwner.id);
    assert.strictEqual(restored.status, 'ACTIVE');

    const isAssigned = await patientAssignmentsService.isCaregiverAssignedToPatient(caregiverMember.id, patientUser.id);
    assert.strictEqual(isAssigned, true, 'Restored caregiver assignments are reactivated');
  });

  await test('5.4: Caregiver-initiated departure enters 7-day NOTICE_PERIOD and preserves care access', async () => {
    const notice = await caregiverRelationshipsService.submitNotice(
      caregiverRelationshipId,
      caregiverMember.id,
      { reason: 'RELOCATION' }
    );
    assert.strictEqual(notice.status, 'NOTICE_PERIOD');
    assert.ok(notice.notice_started_at !== null);
    assert.ok(notice.notice_expires_at !== null);
    assert.strictEqual(notice.termination_reason, 'RELOCATION');

    // Care access preserved during notice period
    const isAssigned = await patientAssignmentsService.isCaregiverAssignedToPatient(caregiverMember.id, patientUser.id);
    assert.strictEqual(isAssigned, true, 'Notice period preserves active patient assignment and care access');
  });

  await test('5.5: Immediate Family termination ends relationship immediately from NOTICE_PERIOD', async () => {
    const term = await caregiverRelationshipsService.terminateImmediate(
      caregiverRelationshipId,
      familyOwner.id,
      { reason: 'REPLACEMENT_FOUND', notes: 'Replacement caregiver started' }
    );
    assert.strictEqual(term.status, 'TERMINATED');
    assert.ok(term.ended_at !== null);

    const isAssigned = await patientAssignmentsService.isCaregiverAssignedToPatient(caregiverMember.id, patientUser.id);
    assert.strictEqual(isAssigned, false, 'Terminated caregiver cannot have active assignment');
  });

  await test('5.6: Automatic 7-day notice expiration transitions relationship to TERMINATED', async () => {
    // Establish a second caregiver relationship for notice expiration test
    const cg2 = await createUser('CAREGIVER', 'cgNoticeExpired');
    const inv2 = await invitationsService.generateInvitation(circle1.id, familyOwner.id);
    const jr2 = await invitationsService.submitJoinRequest(inv2.code, cg2.id);
    await invitationsService.reviewJoinRequest(jr2.id, familyOwner.id, { decision: 'ACCEPTED' });
    const rel2 = await caregiverRelationshipsService.establishRelationship(circle1.id, familyOwner.id, cg2.id);
    await patientAssignmentsService.assignCaregiverToPatient(rel2.id, patientUser.id, familyOwner.id);

    // Set notice_expires_at in the past
    await pool.query(
      `UPDATE caregiver_relationships
       SET status = 'NOTICE_PERIOD', notice_started_at = NOW() - INTERVAL '8 days', notice_expires_at = NOW() - INTERVAL '1 day'
       WHERE id = $1`,
      [rel2.id]
    );

    // Process expired notices
    const result = await caregiverRelationshipsService.processExpiredNotices();
    assert.ok(result.expiredIds.includes(rel2.id), 'rel2 must be expired');

    const check = await pool.query('SELECT status, termination_reason FROM caregiver_relationships WHERE id = $1', [rel2.id]);
    assert.strictEqual(check.rows[0].status, 'TERMINATED');
    assert.strictEqual(check.rows[0].termination_reason, 'NOTICE_PERIOD_EXPIRED');

    const isAssigned = await patientAssignmentsService.isCaregiverAssignedToPatient(cg2.id, patientUser.id);
    assert.strictEqual(isAssigned, false);
  });

  console.log('\n--- 6. Patient Assignment Domain & Scoping ---');

  let activeRel: any;
  let activeCg: any;
  await test('6.1: Active caregiver can be assigned to multiple patients within the Circle', async () => {
    activeCg = await createUser('CAREGIVER', 'cgMultiAssign');
    const inv = await invitationsService.generateInvitation(circle1.id, familyOwner.id);
    const jr = await invitationsService.submitJoinRequest(inv.code, activeCg.id);
    await invitationsService.reviewJoinRequest(jr.id, familyOwner.id, { decision: 'ACCEPTED' });
    activeRel = await caregiverRelationshipsService.establishRelationship(circle1.id, familyOwner.id, activeCg.id);

    // Assign to Patient 1
    const a1 = await patientAssignmentsService.assignCaregiverToPatient(activeRel.id, patientUser.id, familyOwner.id);
    assert.strictEqual(a1.is_active, true);
    assert.strictEqual(a1.patient_id, patientUser.id);

    // Add Patient 2 to Circle
    const patient2 = await createUser('PATIENT', 'patient2');
    const invP2 = await invitationsService.generateInvitation(circle1.id, familyOwner.id);
    const jrP2 = await invitationsService.submitJoinRequest(invP2.code, patient2.id);
    await invitationsService.reviewJoinRequest(jrP2.id, familyOwner.id, { decision: 'ACCEPTED' });

    // Assign to Patient 2
    const a2 = await patientAssignmentsService.assignCaregiverToPatient(activeRel.id, patient2.id, familyOwner.id);
    assert.strictEqual(a2.is_active, true);
    assert.strictEqual(a2.patient_id, patient2.id);

    // Verify assigned list
    const assignedList = await patientAssignmentsService.getCaregiverAssignedPatients(activeCg.id);
    assert.strictEqual(assignedList.length, 2);
  });

  await test('6.2: Revoking an assignment sets is_active = FALSE without deleting relationship', async () => {
    await patientAssignmentsService.revokePatientAssignment(activeRel.id, patientUser.id, familyOwner.id);
    const isAssigned = await patientAssignmentsService.isCaregiverAssignedToPatient(activeCg.id, patientUser.id);
    assert.strictEqual(isAssigned, false);

    const relCheck = await pool.query('SELECT status FROM caregiver_relationships WHERE id = $1', [activeRel.id]);
    assert.strictEqual(relCheck.rows[0].status, 'ACTIVE');

    // Re-assign for subsequent guard tests
    await patientAssignmentsService.assignCaregiverToPatient(activeRel.id, patientUser.id, familyOwner.id);
  });

  console.log('\n--- 7. Resource-Aware Authorization Policy Guards ---');

  // Helper to run express middleware
  function runMiddleware(middleware: any, req: any): Promise<{ nextCalled: boolean; err?: any }> {
    return new Promise((resolve) => {
      middleware(req, {} as any, (err?: any) => {
        if (err) resolve({ nextCalled: false, err });
        else resolve({ nextCalled: true });
      });
    });
  }

  await test('7.1: requireRoutineDefinitionCRUDAuthority DENIES Professional Caregiver (even if Circle Owner or assigned)', async () => {
    const guard = requireRoutineDefinitionCRUDAuthority('patientId');
    const req = {
      params: { patientId: patientUser.id },
      user: { id: activeCg.id, role: 'CAREGIVER' },
    };
    const res = await runMiddleware(guard, req);
    assert.strictEqual(res.nextCalled, false);
    assert.strictEqual(res.err?.code, 'CAREGIVER_ROUTINE_CRUD_FORBIDDEN');
    assert.strictEqual(res.err?.statusCode, 403);
  });

  await test('7.2: requireRoutineDefinitionCRUDAuthority ALLOWS authorized Family Member in patient Circle', async () => {
    const guard = requireRoutineDefinitionCRUDAuthority('patientId');
    const req = {
      params: { patientId: patientUser.id },
      user: { id: familyOwner.id, role: 'FAMILY' },
    };
    const res = await runMiddleware(guard, req);
    assert.strictEqual(res.nextCalled, true);
    assert.strictEqual(res.err, undefined);
  });

  await test('7.3: requireRoutineSignOffAuthority ALLOWS Caregiver WITH active relationship & patient assignment', async () => {
    const guard = requireRoutineSignOffAuthority('patientId');
    const req = {
      params: { patientId: patientUser.id },
      user: { id: activeCg.id, role: 'CAREGIVER' },
    };
    const res = await runMiddleware(guard, req);
    assert.strictEqual(res.nextCalled, true);
    assert.strictEqual(res.err, undefined);
  });

  await test('7.4: requireRoutineSignOffAuthority DENIES Caregiver WITHOUT patient assignment', async () => {
    const unassignedCg = await createUser('CAREGIVER', 'cgUnassigned');
    const guard = requireRoutineSignOffAuthority('patientId');
    const req = {
      params: { patientId: patientUser.id },
      user: { id: unassignedCg.id, role: 'CAREGIVER' },
    };
    const res = await runMiddleware(guard, req);
    assert.strictEqual(res.nextCalled, false);
    assert.strictEqual(res.err?.code, 'CAREGIVER_NOT_ASSIGNED');
    assert.strictEqual(res.err?.statusCode, 403);
  });

  await test('7.5: requireSafeZoneManagementAuthority is strictly Circle Owner only (non-owner member denied with 403)', async () => {
    const guard = requireSafeZoneManagementAuthority('circleId');
    const req = {
      params: { circleId: circle1.id },
      user: { id: familyMember.id, role: 'FAMILY' },
    };
    const res = await runMiddleware(guard, req);
    assert.strictEqual(res.nextCalled, false);
    assert.strictEqual(res.err?.code, 'OWNER_ONLY');
    assert.strictEqual(res.err?.statusCode, 403);
  });

  await test('7.6: requireSafeZoneManagementAuthority ALLOWS Circle Owner', async () => {
    const guard = requireSafeZoneManagementAuthority('circleId');
    const req = {
      params: { circleId: circle1.id },
      user: { id: familyOwner.id, role: 'FAMILY' },
    };
    const res = await runMiddleware(guard, req);
    assert.strictEqual(res.nextCalled, true);
    assert.strictEqual(res.err, undefined);
  });

  await test('7.7: requireAlertResolutionAuthority is strictly Circle Owner only', async () => {
    const guard = requireAlertResolutionAuthority('circleId');

    // Caregiver denied
    const cgReq = {
      params: { circleId: circle1.id },
      user: { id: activeCg.id, role: 'CAREGIVER' },
    };
    const cgRes = await runMiddleware(guard, cgReq);
    assert.strictEqual(cgRes.nextCalled, false);
    assert.strictEqual(cgRes.err?.code, 'OWNER_ONLY');

    // Family Member denied
    const fmReq = {
      params: { circleId: circle1.id },
      user: { id: familyMember.id, role: 'FAMILY' },
    };
    const fmRes = await runMiddleware(guard, fmReq);
    assert.strictEqual(fmRes.nextCalled, false);
    assert.strictEqual(fmRes.err?.code, 'OWNER_ONLY');

    // Owner allowed
    const ownerReq = {
      params: { circleId: circle1.id },
      user: { id: familyOwner.id, role: 'FAMILY' },
    };
    const ownerRes = await runMiddleware(guard, ownerReq);
    assert.strictEqual(ownerRes.nextCalled, true);
  });

  console.log('\n--- 8. Account Deletion Restrictive Behavior (Zero Silent Cascades) ---');

  await test('8.1: Deleting Circle Owner is blocked by ON DELETE RESTRICT on care_circles.owner_id', async () => {
    try {
      await pool.query('DELETE FROM users WHERE id = $1', [familyOwner.id]);
      assert.fail('Should have blocked deleting circle owner');
    } catch (err: any) {
      assert.ok(
        err.code === '23001' || err.code === '23503',
        `Expected SQLSTATE 23001 or 23503, got ${err.code}`
      );
    }
  });

  await test('8.2: Deleting Patient is blocked by ON DELETE RESTRICT on patient_id in associations and assignments', async () => {
    try {
      await pool.query('DELETE FROM users WHERE id = $1', [patientUser.id]);
      assert.fail('Should have blocked deleting patient with active dependencies');
    } catch (err: any) {
      assert.ok(
        err.code === '23001' || err.code === '23503',
        `Expected SQLSTATE 23001 or 23503, got ${err.code}`
      );
    }
  });

  await test('8.3: Deleting Caregiver is blocked by ON DELETE RESTRICT on caregiver_relationships.caregiver_id', async () => {
    try {
      await pool.query('DELETE FROM users WHERE id = $1', [activeCg.id]);
      assert.fail('Should have blocked deleting caregiver with active contract');
    } catch (err: any) {
      assert.ok(
        err.code === '23001' || err.code === '23503',
        `Expected SQLSTATE 23001 or 23503, got ${err.code}`
      );
    }
  });

  console.log('\n======================================================================');
  console.log(`PHASE 1 INTEGRATION SUITE COMPLETE: ${passedTests} / ${totalTests} TESTS PASSED!`);
  console.log('100% Core Domain Services, Invariants, and Authorization Guards Verified!');
  console.log('======================================================================\n');
}

runPhase1Suite()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Test suite failed:', err);
    pool.end();
    process.exit(1);
  });

