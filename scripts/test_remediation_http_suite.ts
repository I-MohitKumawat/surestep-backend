/**
 * SureStep — scripts/test_remediation_http_suite.ts
 *
 * Comprehensive End-to-End HTTP Integration Test Suite for the Audit Remediation:
 * Covers all P0/P1/P2 remediation items over real HTTP requests hitting actual
 * Express routes, middlewares, controllers, and PostgreSQL database.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5433/sure-step';
process.env.NODE_ENV = 'test';

import assert from 'node:assert';
import { AddressInfo } from 'node:net';
import http from 'node:http';
import pool from '../db/config';
import app from '../server';

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

async function runRemediationHttpSuite() {
  console.log('======================================================================');
  console.log('SURESTEP AUDIT REMEDIATION HTTP-LEVEL INTEGRATION TEST SUITE');
  console.log('Target Database: PostgreSQL Engine (dev: sure-step on port 5433)');
  console.log('Testing Actual Routes -> Middlewares -> Controllers -> Services');
  console.log('======================================================================\n');

  // Start ephemeral HTTP server on dynamic port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  // Helper for authenticated HTTP requests
  async function apiRequest(
    method: string,
    endpoint: string,
    options: {
      userUid?: string;
      body?: any;
    } = {}
  ) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.userUid) {
      headers['Authorization'] = `Bearer mock-dev-${options.userUid}-token`;
    }

    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch (_) {
      json = { raw: text };
    }

    return {
      status: res.status,
      headers: res.headers,
      body: json,
    };
  }

  // --- Test Actor Setup ---
  const timestamp = Date.now();
  const ownerUid = `owner-${timestamp}`;
  const memberUid = `member-${timestamp}`;
  const caregiverUid = `caregiver-${timestamp}`;
  const caregiverNoticeUid = `caregiver-notice-${timestamp}`;
  const unassignedCgUid = `unassigned-cg-${timestamp}`;
  const unrelatedUid = `unrelated-${timestamp}`;
  const patientUid = `patient-${timestamp}`;
  const secondPatientUid = `patient2-${timestamp}`;

  console.log('--- Setting up Test Actors & Database Fixtures ---');

  // Create Users
  const insertUser = async (uid: string, name: string, role: string, phone: string) => {
    const res = await pool.query(
      `INSERT INTO users (firebase_uid, name, role, phone, is_active, onboarding_complete)
       VALUES ($1, $2, $3, $4, TRUE, TRUE)
       RETURNING *`,
      [uid, name, role, phone]
    );
    return res.rows[0];
  };

  const owner = await insertUser(ownerUid, 'Test Circle Owner', 'FAMILY', `+91981100${timestamp % 10000}`);
  const member = await insertUser(memberUid, 'Test Circle Member', 'FAMILY', `+91981200${timestamp % 10000}`);
  const assignedCaregiver = await insertUser(caregiverUid, 'Assigned Caregiver', 'CAREGIVER', `+91981300${timestamp % 10000}`);
  const noticeCaregiver = await insertUser(caregiverNoticeUid, 'Notice Caregiver', 'CAREGIVER', `+91981400${timestamp % 10000}`);
  const unassignedCaregiver = await insertUser(unassignedCgUid, 'Unassigned Caregiver', 'CAREGIVER', `+91981500${timestamp % 10000}`);
  const unrelatedUser = await insertUser(unrelatedUid, 'Unrelated User', 'FAMILY', `+91981600${timestamp % 10000}`);
  const patient = await insertUser(patientUid, 'Test Patient', 'PATIENT', `+91981700${timestamp % 10000}`);
  const secondPatient = await insertUser(secondPatientUid, 'Second Patient', 'PATIENT', `+91981800${timestamp % 10000}`);

  // Insert profiles
  await pool.query('INSERT INTO patient_profiles (user_id) VALUES ($1), ($2)', [patient.id, secondPatient.id]);
  await pool.query('INSERT INTO caregiver_profiles (user_id) VALUES ($1), ($2), ($3)', [assignedCaregiver.id, noticeCaregiver.id, unassignedCaregiver.id]);
  await pool.query('INSERT INTO family_profiles (user_id) VALUES ($1), ($2), ($3)', [owner.id, member.id, unrelatedUser.id]);

  // Create Care Circle
  const circleRes = await pool.query(
    `INSERT INTO care_circles (name, owner_id) VALUES ($1, $2) RETURNING *`,
    [`HTTP Test Circle ${timestamp}`, owner.id]
  );
  const circle = circleRes.rows[0];

  // Add Member
  const memberRes = await pool.query(
    `INSERT INTO care_circle_members (circle_id, user_id, role_in_circle) VALUES ($1, $2, 'MEMBER') RETURNING *`,
    [circle.id, member.id]
  );
  const memberRow = memberRes.rows[0];

  // Associate Patient
  await pool.query(
    `INSERT INTO patient_circle_associations (circle_id, patient_id, associated_by) VALUES ($1, $2, $3)`,
    [circle.id, patient.id, owner.id]
  );

  // Establish Caregiver Relationships
  const cgRelRes = await pool.query(
    `INSERT INTO caregiver_relationships (circle_id, caregiver_id, status)
     VALUES ($1, $2, 'ACTIVE') RETURNING *`,
    [circle.id, assignedCaregiver.id]
  );
  const cgRel = cgRelRes.rows[0];

  const noticeRelRes = await pool.query(
    `INSERT INTO caregiver_relationships (circle_id, caregiver_id, status, notice_started_at, notice_expires_at)
     VALUES ($1, $2, 'NOTICE_PERIOD', NOW(), NOW() + INTERVAL '7 days') RETURNING *`,
    [circle.id, noticeCaregiver.id]
  );
  const noticeRel = noticeRelRes.rows[0];

  // Assign Caregivers to Patient
  await pool.query(
    `INSERT INTO patient_assignments (relationship_id, patient_id, assigned_by, is_active) VALUES ($1, $2, $3, TRUE)`,
    [cgRel.id, patient.id, owner.id]
  );
  await pool.query(
    `INSERT INTO patient_assignments (relationship_id, patient_id, assigned_by, is_active) VALUES ($1, $2, $3, TRUE)`,
    [noticeRel.id, patient.id, owner.id]
  );

  // Create Routine Definition & Occurrences
  const routineDefRes = await pool.query(
    `INSERT INTO routine_definitions (patient_id, title, category, schedule_pattern, created_by)
     VALUES ($1, 'Morning Medication', 'MEDICATION', '{"type": "DAILY", "time": "08:00:00"}'::jsonb, $2) RETURNING *`,
    [patient.id, owner.id]
  );
  const routineDef = routineDefRes.rows[0];

  const todayStr = new Date().toISOString().split('T')[0];
  const occ1Res = await pool.query(
    `INSERT INTO routine_occurrences (routine_id, patient_id, scheduled_date, scheduled_time, status)
     VALUES ($1, $2, $3, '08:00:00', 'SCHEDULED') RETURNING *`,
    [routineDef.id, patient.id, todayStr]
  );
  const occ1 = occ1Res.rows[0];

  const occ2Res = await pool.query(
    `INSERT INTO routine_occurrences (routine_id, patient_id, scheduled_date, scheduled_time, status)
     VALUES ($1, $2, $3, '09:00:00', 'SCHEDULED') RETURNING *`,
    [routineDef.id, patient.id, todayStr]
  );
  const occ2 = occ2Res.rows[0];

  const occ3Res = await pool.query(
    `INSERT INTO routine_occurrences (routine_id, patient_id, scheduled_date, scheduled_time, status)
     VALUES ($1, $2, $3, '10:00:00', 'SCHEDULED') RETURNING *`,
    [routineDef.id, patient.id, todayStr]
  );
  const occ3 = occ3Res.rows[0];

  const occ4Res = await pool.query(
    `INSERT INTO routine_occurrences (routine_id, patient_id, scheduled_date, scheduled_time, status)
     VALUES ($1, $2, $3, '11:00:00', 'SCHEDULED') RETURNING *`,
    [routineDef.id, patient.id, todayStr]
  );
  const occ4 = occ4Res.rows[0];

  console.log('Fixtures established successfully.\n');

  try {
    // =========================================================================
    // 1. ROUTINE OCCURRENCE SIGN-OFF IDOR & AUTHORIZATION (P0)
    // =========================================================================
    console.log('>>> 1. Routine Occurrence Sign-off IDOR & Authorization Tests');

    await test('1.1 Unrelated user attempting occurrence sign-off is DENIED (403/404)', async () => {
      const res = await apiRequest('POST', `/routines/occurrences/${occ1.id}/sign-off`, {
        userUid: unrelatedUid,
        body: { notes: 'Malicious sign off' },
      });
      assert.strictEqual(res.status, 403, `Expected 403 FORBIDDEN, got ${res.status}`);

      // Verify occurrence was NOT marked completed
      const check = await pool.query('SELECT status FROM routine_occurrences WHERE id = $1', [occ1.id]);
      assert.strictEqual(check.rows[0].status, 'SCHEDULED', 'Occurrence status must remain SCHEDULED');
    });

    await test('1.2 Unassigned Caregiver attempting occurrence sign-off is DENIED (403)', async () => {
      const res = await apiRequest('POST', `/routines/occurrences/${occ1.id}/sign-off`, {
        userUid: unassignedCgUid,
        body: { notes: 'Unassigned caregiver attempt' },
      });
      assert.strictEqual(res.status, 403, `Expected 403 FORBIDDEN, got ${res.status}`);
      assert.strictEqual(res.body.error?.code, 'CAREGIVER_NOT_ASSIGNED');
    });

    await test('1.3 Assigned Caregiver can sign off occurrence (200 OK)', async () => {
      const res = await apiRequest('POST', `/routines/occurrences/${occ1.id}/sign-off`, {
        userUid: caregiverUid,
        body: { notes: 'Medication administered by caregiver' },
      });
      assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
      assert.strictEqual(res.body.data.occurrence.status, 'COMPLETED');
      assert.strictEqual(res.body.data.completion.completion_source, 'CAREGIVER_ASSISTED');
    });

    await test('1.4 Notice-period Assigned Caregiver can sign off occurrence (200 OK)', async () => {
      const res = await apiRequest('POST', `/routines/occurrences/${occ2.id}/sign-off`, {
        userUid: caregiverNoticeUid,
        body: { notes: 'Medication administered during notice period' },
      });
      assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
      assert.strictEqual(res.body.data.occurrence.status, 'COMPLETED');
    });

    await test('1.5 Authorized Circle Member can sign off occurrence (200 OK)', async () => {
      const res = await apiRequest('POST', `/routines/occurrences/${occ3.id}/sign-off`, {
        userUid: memberUid,
        body: { notes: 'Family verified completion' },
      });
      assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
      assert.strictEqual(res.body.data.occurrence.status, 'COMPLETED');
      assert.strictEqual(res.body.data.completion.completion_source, 'FAMILY');
    });

    await test('1.6 Patient can sign off own occurrence (200 OK)', async () => {
      const res = await apiRequest('POST', `/routines/occurrences/${occ4.id}/sign-off`, {
        userUid: patientUid,
        body: { notes: 'I took my medicine' },
      });
      assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
      assert.strictEqual(res.body.data.occurrence.status, 'COMPLETED');
      assert.strictEqual(res.body.data.completion.completion_source, 'PATIENT_SELF');
    });

    await test('1.7 Professional Caregiver is strictly forbidden from routine definition CRUD (403)', async () => {
      const res = await apiRequest('POST', `/patients/${patient.id}/routines`, {
        userUid: caregiverUid,
        body: {
          title: 'Caregiver Created Routine',
          category: 'ACTIVITY',
          frequency: 'DAILY',
          scheduleTime: '15:00:00',
        },
      });
      assert.strictEqual(res.status, 403, `Expected 403 FORBIDDEN, got ${res.status}`);
      assert.strictEqual(res.body.error?.code, 'CAREGIVER_ROUTINE_CRUD_FORBIDDEN');
    });

    // =========================================================================
    // 2. CARE CIRCLE GOVERNANCE & LIFECYCLE (P1)
    // =========================================================================
    console.log('\n>>> 2. Care Circle Ownership Transfer & Leaving Tests');

    await test('2.1 Non-member cannot become Circle Owner (400)', async () => {
      const res = await apiRequest('POST', `/care-circles/${circle.id}/transfer-ownership`, {
        userUid: ownerUid,
        body: { newOwnerId: unrelatedUser.id },
      });
      assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
      assert.strictEqual(res.body.error?.code, 'MEMBER_NOT_FOUND');
    });

    await test('2.2 Patient cannot become Circle Owner (400)', async () => {
      // First associate patient as a member row to test eligibility check
      await pool.query(
        `INSERT INTO care_circle_members (circle_id, user_id, role_in_circle) VALUES ($1, $2, 'MEMBER')
         ON CONFLICT (circle_id, user_id) DO NOTHING`,
        [circle.id, patient.id]
      );

      const res = await apiRequest('POST', `/care-circles/${circle.id}/transfer-ownership`, {
        userUid: ownerUid,
        body: { newOwnerId: patient.id },
      });
      assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
      assert.strictEqual(res.body.error?.code, 'INVALID_RECIPIENT');

      // Clean up temporary member row
      await pool.query(`DELETE FROM care_circle_members WHERE circle_id = $1 AND user_id = $2`, [circle.id, patient.id]);
    });

    await test('2.3 Owner can transfer ownership to eligible member (200 OK)', async () => {
      const res = await apiRequest('POST', `/care-circles/${circle.id}/transfer-ownership`, {
        userUid: ownerUid,
        body: { newOwnerId: member.id },
      });
      assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
      assert.strictEqual(res.body.data.newOwnerId, member.id);

      // Verify DB state: new owner is in care_circles
      const checkCircle = await pool.query('SELECT owner_id FROM care_circles WHERE id = $1', [circle.id]);
      assert.strictEqual(checkCircle.rows[0].owner_id, member.id);

      // Verify old owner role in care_circle_members is now MEMBER
      const checkOldOwner = await pool.query('SELECT role_in_circle FROM care_circle_members WHERE circle_id = $1 AND user_id = $2', [circle.id, owner.id]);
      assert.strictEqual(checkOldOwner.rows[0].role_in_circle, 'MEMBER');

      // Verify new owner role in care_circle_members is OWNER
      const checkNewOwner = await pool.query('SELECT role_in_circle FROM care_circle_members WHERE circle_id = $1 AND user_id = $2', [circle.id, member.id]);
      assert.strictEqual(checkNewOwner.rows[0].role_in_circle, 'OWNER');
    });

    await test('2.4 Old Owner has lost intrinsic Owner authority (403 on owner-only route)', async () => {
      const res = await apiRequest('PATCH', `/care-circles/${circle.id}`, {
        userUid: ownerUid, // old owner
        body: { name: 'Unauthorized Renaming Attempt' },
      });
      assert.strictEqual(res.status, 403, `Expected 403 OWNER_ONLY, got ${res.status}`);
      assert.strictEqual(res.body.error?.code, 'OWNER_ONLY');
    });

    await test('2.5 Current Owner cannot leave without transfer/termination (400)', async () => {
      const res = await apiRequest('POST', `/care-circles/${circle.id}/leave`, {
        userUid: memberUid, // member is now the owner
      });
      assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
      assert.strictEqual(res.body.error?.code, 'OWNER_CANNOT_LEAVE');
    });

    await test('2.6 Non-owner member can leave Circle (200 OK)', async () => {
      const res = await apiRequest('POST', `/care-circles/${circle.id}/leave`, {
        userUid: ownerUid, // old owner is now a regular member
      });
      assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);

      // Verify DB: membership removed
      const check = await pool.query('SELECT 1 FROM care_circle_members WHERE circle_id = $1 AND user_id = $2', [circle.id, owner.id]);
      assert.strictEqual(check.rows.length, 0, 'Member row must be removed');
    });

    await test('2.7 Caregiver member removal atomically terminates relationship & assignment', async () => {
      // First add assignedCaregiver as a member in care_circle_members
      const cgMemberRes = await pool.query(
        `INSERT INTO care_circle_members (circle_id, user_id, role_in_circle) VALUES ($1, $2, 'CAREGIVER') RETURNING *`,
        [circle.id, assignedCaregiver.id]
      );
      const cgMemberId = cgMemberRes.rows[0].id;

      // Delete member via DELETE /care-circles/:circleId/members/:memberId
      const res = await apiRequest('DELETE', `/care-circles/${circle.id}/members/${cgMemberId}`, {
        userUid: memberUid, // current owner
      });
      assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);

      // Verify caregiver_relationships status is TERMINATED
      const relCheck = await pool.query('SELECT status, termination_reason FROM caregiver_relationships WHERE id = $1', [cgRel.id]);
      assert.strictEqual(relCheck.rows[0].status, 'TERMINATED');
      assert.strictEqual(relCheck.rows[0].termination_reason, 'MEMBER_REMOVED');

      // Verify patient_assignments is deactivated
      const assignCheck = await pool.query('SELECT is_active FROM patient_assignments WHERE relationship_id = $1', [cgRel.id]);
      assert.strictEqual(assignCheck.rows[0].is_active, false, 'Patient assignment must be deactivated');
    });

    // =========================================================================
    // 3. PATIENT ONBOARDING EMERGENCY CONTACT METADATA (P0)
    // =========================================================================
    console.log('\n>>> 3. Patient Onboarding Emergency Contact Tests');

    await test('3.1 Emergency contact phone matching existing user does NOT create relationship', async () => {
      // Patient 2 submits onboarding with emergency contact phone matching owner.phone
      const res = await apiRequest('PUT', `/users/patient`, {
        userUid: secondPatientUid,
        body: {
          emergency_contact_name: 'Emergency Contact Person',
          emergency_contact_phone: owner.phone,
          emergency_contact_relation: 'Sibling',
          living_arrangement: 'ALONE',
          care_needs: ['MOBILITY'],
        },
      });
      assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);

      // Verify ZERO rows in patient_relationships for (secondPatient.id, owner.id)
      const relCheck = await pool.query(
        'SELECT 1 FROM patient_relationships WHERE patient_user_id = $1 AND related_user_id = $2',
        [secondPatient.id, owner.id]
      );
      assert.strictEqual(relCheck.rows.length, 0, 'No relationship row must be created');

      // Verify patient_profiles has UNLINKED status and null emergency_contact_user_id
      const profCheck = await pool.query(
        'SELECT emergency_contact_status, emergency_contact_user_id FROM patient_profiles WHERE user_id = $1',
        [secondPatient.id]
      );
      assert.strictEqual(profCheck.rows[0].emergency_contact_status, 'UNLINKED');
      assert.strictEqual(profCheck.rows[0].emergency_contact_user_id, null);
    });

    // =========================================================================
    // 4. DECOMMISSIONED LEGACY ENDPOINTS (P0 / P2)
    // =========================================================================
    console.log('\n>>> 4. Decommissioned Legacy Endpoints Tests (410 GONE)');

    await test('4.1 POST /relationships/caregiver/confirm returns 410 GONE', async () => {
      const res = await apiRequest('POST', `/relationships/caregiver/confirm`, {
        userUid: patientUid,
        body: { caregiverId: unassignedCaregiver.id },
      });
      assert.strictEqual(res.status, 410, `Expected 410 GONE, got ${res.status}`);
      assert.strictEqual(res.body.error?.code, 'DEPRECATED_ENDPOINT');
    });

    await test('4.2 POST /relationships/caregiver-request returns 410 GONE', async () => {
      const res = await apiRequest('POST', `/relationships/caregiver-request`, {
        userUid: patientUid,
        body: { caregiver_id: unassignedCaregiver.id },
      });
      assert.strictEqual(res.status, 410, `Expected 410 GONE, got ${res.status}`);
    });

    await test('4.3 POST /relationships/invite-code/generate returns 410 GONE', async () => {
      const res = await apiRequest('POST', `/relationships/invite-code/generate`, {
        userUid: caregiverUid,
        body: { patient_id: patient.id, relationship_type: 'FAMILY_CLOSE' },
      });
      assert.strictEqual(res.status, 410, `Expected 410 GONE, got ${res.status}`);
    });

    await test('4.4 POST /family/invite-code/redeem returns 410 GONE', async () => {
      const res = await apiRequest('POST', `/family/invite-code/redeem`, {
        userUid: unrelatedUid,
        body: { code: 'ABC123' },
      });
      assert.strictEqual(res.status, 410, `Expected 410 GONE, got ${res.status}`);
    });

    await test('4.5 Legacy task mutation routes (PATCH /tasks/:id, POST /tasks/:id/status) return 410 GONE', async () => {
      const patchRes = await apiRequest('PATCH', `/tasks/any-id`, {
        userUid: caregiverUid,
        body: { title: 'Updated' },
      });
      assert.strictEqual(patchRes.status, 410, `Expected 410 GONE, got ${patchRes.status}`);

      const statusRes = await apiRequest('POST', `/tasks/any-id/status`, {
        userUid: caregiverUid,
        body: { status: 'skipped' },
      });
      assert.strictEqual(statusRes.status, 410, `Expected 410 GONE, got ${statusRes.status}`);
    });

    await test('4.6 Legacy voice/stories routes return 410 GONE', async () => {
      const storiesRes = await apiRequest('GET', `/voice/stories/patient/${patient.id}`, {
        userUid: unrelatedUid,
      });
      assert.strictEqual(storiesRes.status, 410, `Expected 410 GONE, got ${storiesRes.status}`);
    });

    // =========================================================================
    // 5. ACCOUNT DELETION & PHONE NUMBER CHANGE (P1)
    // =========================================================================
    console.log('\n>>> 5. Account Deletion & Phone Number Change Tests');

    await test('5.1 Circle Owner cannot delete account while owning an active Circle (400)', async () => {
      const res = await apiRequest('DELETE', `/users/me`, {
        userUid: memberUid, // member is currently the circle owner
      });
      assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
      assert.strictEqual(res.body.error?.code, 'CANNOT_DELETE_CIRCLE_OWNER');
    });

    await test('5.2 Non-owner user can delete account (200 OK) with dependency resolution', async () => {
      const res = await apiRequest('DELETE', `/users/me`, {
        userUid: unrelatedUid,
      });
      assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);

      // Verify user is tombstoned
      const userCheck = await pool.query('SELECT is_active, deleted_at, phone FROM users WHERE id = $1', [unrelatedUser.id]);
      assert.strictEqual(userCheck.rows[0].is_active, false);
      assert.notStrictEqual(userCheck.rows[0].deleted_at, null);
      assert(userCheck.rows[0].phone.startsWith('DEL_'), 'Phone should be scrambled');
    });

    await test('5.3 Phone change to an existing active phone is REJECTED (409)', async () => {
      const res = await apiRequest('POST', `/users/change-phone`, {
        userUid: patientUid,
        body: {
          newPhone: owner.phone, // Already belongs to owner
          newPhoneToken: 'mock-dev-token',
        },
      });
      assert.strictEqual(res.status, 409, `Expected 409 CONFLICT, got ${res.status}`);
      assert.strictEqual(res.body.error?.code, 'PHONE_ALREADY_EXISTS');
    });

    await test('5.4 Successful phone change updates phone atomically (200 OK)', async () => {
      const newPhone = `+9199999${timestamp % 100000}`;
      const res = await apiRequest('POST', `/users/change-phone`, {
        userUid: patientUid,
        body: {
          newPhone,
          newPhoneToken: 'mock-dev-token',
        },
      });
      assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
      assert.strictEqual(res.body.data.user.phone, newPhone);

      // Verify in DB
      const check = await pool.query('SELECT phone FROM users WHERE id = $1', [patient.id]);
      assert.strictEqual(check.rows[0].phone, newPhone);
    });

    await test('5.5 Canonical Care Request creation remains functional', async () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      const res = await apiRequest('POST', `/care-requests`, {
        userUid: memberUid, // current owner
        body: {
          patientId: patient.id,
          caregiverId: unassignedCaregiver.id,
          scheduleType: 'ONE_TIME',
          requestedShifts: ['DAY_SHIFT'],
          startDate: tomorrow,
          proposedRateType: 'HOURLY',
          proposedRateInr: 500,
          careContextNotes: 'Would you be available to care for my relative?',
        },
      });
      assert.strictEqual(res.status, 201, `Expected 201 Created, got ${res.status}`);
      assert.strictEqual(res.body.data.request.caregiverId, unassignedCaregiver.id);
      assert.strictEqual(res.body.data.request.status, 'PENDING');
    });

  } finally {
    console.log('\n--- Cleaning up Test Fixtures ---');
    server.close();
    try {
      await pool.query('DELETE FROM care_requests WHERE patient_id = $1', [patient.id]);
      await pool.query('DELETE FROM safety_alerts WHERE circle_id = $1', [circle.id]);
      await pool.query('DELETE FROM safe_zone_monitors WHERE safe_zone_id IN (SELECT id FROM safe_zones WHERE circle_id = $1)', [circle.id]);
      await pool.query('DELETE FROM safe_zones WHERE circle_id = $1', [circle.id]);
      await pool.query('DELETE FROM patient_assignments WHERE relationship_id IN (SELECT id FROM caregiver_relationships WHERE circle_id = $1)', [circle.id]);
      await pool.query('DELETE FROM caregiver_relationships WHERE circle_id = $1', [circle.id]);
      await pool.query('DELETE FROM circle_permissions WHERE member_id IN (SELECT id FROM care_circle_members WHERE circle_id = $1)', [circle.id]);
      await pool.query('DELETE FROM care_circle_members WHERE circle_id = $1', [circle.id]);
      await pool.query('DELETE FROM patient_circle_associations WHERE circle_id = $1', [circle.id]);
      await pool.query('DELETE FROM care_circles WHERE id = $1', [circle.id]);
      await pool.query('DELETE FROM routine_completions WHERE occurrence_id IN ($1, $2, $3, $4)', [occ1.id, occ2.id, occ3.id, occ4.id]);
      await pool.query('DELETE FROM routine_occurrences WHERE routine_id = $1', [routineDef.id]);
      await pool.query('DELETE FROM routine_definitions WHERE id = $1', [routineDef.id]);
      await pool.query('DELETE FROM patient_profiles WHERE user_id IN ($1, $2)', [patient.id, secondPatient.id]);
      await pool.query('DELETE FROM caregiver_profiles WHERE user_id IN ($1, $2, $3)', [assignedCaregiver.id, noticeCaregiver.id, unassignedCaregiver.id]);
      await pool.query('DELETE FROM family_profiles WHERE user_id IN ($1, $2, $3)', [owner.id, member.id, unrelatedUser.id]);
      await pool.query('DELETE FROM users WHERE id IN ($1, $2, $3, $4, $5, $6, $7, $8)', [
        owner.id, member.id, assignedCaregiver.id, noticeCaregiver.id, unassignedCaregiver.id, unrelatedUser.id, patient.id, secondPatient.id
      ]);
      console.log('Cleanup completed.\n');
    } catch (cleanupErr: any) {
      console.warn('Cleanup warning:', cleanupErr?.message);
    }
  }

  console.log('======================================================================');
  console.log(`ALL REMEDIATION HTTP INTEGRATION TESTS PASSED: ${passedTests} / ${totalTests}`);
  console.log('Zero Bypasses, Full End-to-End HTTP Route Verification Complete.');
  console.log('======================================================================\n');
}

runRemediationHttpSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  });
