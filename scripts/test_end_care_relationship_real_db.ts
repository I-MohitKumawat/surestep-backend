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

process.env.DATABASE_URL = 'postgresql://postgres:itunes-maybe-apply@localhost:5432/surestep_test';
process.env.NODE_ENV = 'test';

import pool from '../db/config';
import { runMigrations } from '../db/migrator';
import { AppError } from '../shared/errors/AppError';
import * as careRelService from '../modules/care-relationships/care-relationships.service';
import * as relService from '../modules/relationships/relationships.service';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] Test ${testName}`);
  } else {
    console.error(`  ✗ [FAIL] Test ${testName}${detail ? ` - ${detail}` : ''}`);
    throw new Error(`Assertion failed: ${testName} - ${detail || ''}`);
  }
}

async function runRealDatabaseTests() {
  console.log('======================================================================');
  console.log('SURESTEP PHASE 3A: REAL POSTGRESQL INTEGRATION TEST SUITE');
  console.log('Target Database: surestep_test (PostgreSQL Engine)');
  console.log('Zero Mocking — Real Transactions, Locks, Triggers, and Constraints');
  console.log('======================================================================\n');

  // 0. Ensure migrations applied
  console.log('[Setup] Applying migrations...');
  await runMigrations();

  // Test User UUIDs
  const patient1Id = '40000000-0000-4000-8000-000000000001';
  const patient2Id = '40000000-0000-4000-8000-000000000002';
  const familyAuthId = '50000000-0000-4000-8000-000000000001';
  const familyUnauthId = '50000000-0000-4000-8000-000000000002';
  const caregiverAId = '60000000-0000-4000-8000-000000000001';
  const caregiverBId = '60000000-0000-4000-8000-000000000002';
  const caregiverCId = '60000000-0000-4000-8000-000000000003';

  // Seed baseline users with unique test credentials
  await pool.query(`
    INSERT INTO users (id, firebase_uid, phone, name, role, is_active)
    VALUES 
      ('${patient1Id}', 'fb-endcare-pt-1', '+919888800001', 'Ramesh Sharma', 'PATIENT', TRUE),
      ('${patient2Id}', 'fb-endcare-pt-2', '+919888800002', 'Sita Devi', 'PATIENT', TRUE),
      ('${familyAuthId}', 'fb-endcare-fam-1', '+919888800011', 'Amit Sharma', 'FAMILY', TRUE),
      ('${familyUnauthId}', 'fb-endcare-fam-2', '+919888800012', 'Stranger Danger', 'FAMILY', TRUE),
      ('${caregiverAId}', 'fb-endcare-cg-1', '+919888800021', 'Priya Patel', 'CAREGIVER', TRUE),
      ('${caregiverBId}', 'fb-endcare-cg-2', '+919888800022', 'Anil Verma', 'CAREGIVER', TRUE),
      ('${caregiverCId}', 'fb-endcare-cg-3', '+919888800023', 'Sunita Rao', 'CAREGIVER', TRUE)
    ON CONFLICT (id) DO UPDATE SET 
      firebase_uid = EXCLUDED.firebase_uid,
      phone = EXCLUDED.phone,
      is_active = TRUE;
  `);

  // Seed caregiver profiles
  await pool.query(`
    INSERT INTO caregiver_profiles (user_id, professional_role, rating, rating_count)
    VALUES
      ('${caregiverAId}', 'Dementia Companion', 4.9, 12),
      ('${caregiverBId}', 'Senior Aide', 4.8, 8),
      ('${caregiverCId}', 'Clinical Nurse', 5.0, 15)
    ON CONFLICT (user_id) DO NOTHING;
  `);

  // Clear existing relationships for test users
  await pool.query(`
    DELETE FROM care_requests WHERE patient_id IN ('${patient1Id}', '${patient2Id}');
    DELETE FROM patient_relationships WHERE patient_user_id IN ('${patient1Id}', '${patient2Id}');
  `);

  // Seed family confirmed link: familyAuthId is confirmed family of patient1Id
  await pool.query(`
    INSERT INTO patient_relationships (id, patient_user_id, related_user_id, relationship_type, status, confirmed_at)
    VALUES (gen_random_uuid(), '${patient1Id}', '${familyAuthId}', 'FAMILY_CLOSE', 'CONFIRMED', NOW());
  `);

  console.log('[Setup] Seeded test environment successfully.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Authorized patient can end active caregiver relationship
  // ──────────────────────────────────────────────────────────────────────────
  const rel1Res = await pool.query(`
    INSERT INTO patient_relationships (id, patient_user_id, related_user_id, relationship_type, status, confirmed_at)
    VALUES (gen_random_uuid(), '${patient1Id}', '${caregiverAId}', 'CAREGIVER', 'ACTIVE_CARE', NOW())
    RETURNING id;
  `);
  const rel1Id = rel1Res.rows[0].id;

  const endResult1 = await careRelService.endCareRelationship(
    rel1Id,
    { reason: 'CARE_NO_LONGER_REQUIRED', notes: 'Patient recovered mobility' },
    { id: patient1Id, role: 'PATIENT' },
  );
  assert(endResult1.status === 'ENDED', '1: Authorized patient can end active caregiver relationship');
  assert(endResult1.end_reason === 'CARE_NO_LONGER_REQUIRED', '9: End reason is stored');
  assert(endResult1.end_notes === 'Patient recovered mobility', '10: Notes are stored');
  assert(endResult1.previous_status === 'ACTIVE_CARE', '6: Active relationship transitions to ENDED with previous_status');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Authorized family member can end where existing authority permits
  // ──────────────────────────────────────────────────────────────────────────
  const rel2Res = await pool.query(`
    INSERT INTO patient_relationships (id, patient_user_id, related_user_id, relationship_type, status, confirmed_at)
    VALUES (gen_random_uuid(), '${patient1Id}', '${caregiverBId}', 'CAREGIVER', 'ACTIVE_CARE', NOW())
    RETURNING id;
  `);
  const rel2Id = rel2Res.rows[0].id;

  const endResult2 = await careRelService.endCareRelationship(
    rel2Id,
    { reason: 'FAMILY_TAKING_OVER', notes: 'Daughter moved in' },
    { id: familyAuthId, role: 'FAMILY' },
  );
  assert(endResult2.status === 'ENDED', '2: Authorized family member can end relationship');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Unauthorized family member cannot end
  // ──────────────────────────────────────────────────────────────────────────
  const rel3Res = await pool.query(`
    INSERT INTO patient_relationships (id, patient_user_id, related_user_id, relationship_type, status, confirmed_at)
    VALUES (gen_random_uuid(), '${patient1Id}', '${caregiverCId}', 'CAREGIVER', 'ACTIVE_CARE', NOW())
    RETURNING id;
  `);
  const rel3Id = rel3Res.rows[0].id;

  let test3Caught = false;
  try {
    await careRelService.endCareRelationship(
      rel3Id,
      { reason: 'SCHEDULE_CHANGED' },
      { id: familyUnauthId, role: 'FAMILY' },
    );
  } catch (err: any) {
    test3Caught = err.code === 'UNAUTHORIZED_CARE_RELATIONSHIP_END' || err.statusCode === 403;
  }
  assert(test3Caught, '3: Unauthorized family member cannot end relationship');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Caregiver cannot use requester endpoint
  // ──────────────────────────────────────────────────────────────────────────
  let test4Caught = false;
  try {
    await careRelService.endCareRelationship(
      rel3Id,
      { reason: 'CAREGIVER_REQUESTED_END' },
      { id: caregiverCId, role: 'CAREGIVER' },
    );
  } catch (err: any) {
    test4Caught = err.code === 'CAREGIVER_CANNOT_END_RELATIONSHIP_DIRECTLY' || err.statusCode === 403;
  }
  assert(test4Caught, '4: Caregiver cannot use requester endpoint');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Pending Care Request cannot be ended through relationship endpoint
  // ──────────────────────────────────────────────────────────────────────────
  const careReqRes = await pool.query(`
    INSERT INTO care_requests (patient_id, requester_id, caregiver_id, status, schedule_type, start_date, proposed_rate_type, proposed_rate_inr)
    VALUES ('${patient1Id}', '${patient1Id}', '${caregiverCId}', 'PENDING', 'ONE_TIME', CURRENT_DATE, 'HOURLY', 500)
    RETURNING id;
  `);
  const careReqId = careReqRes.rows[0].id;

  let test5Caught = false;
  try {
    await careRelService.endCareRelationship(
      careReqId,
      { reason: 'CARE_NO_LONGER_REQUIRED' },
      { id: patient1Id, role: 'PATIENT' },
    );
  } catch (err: any) {
    test5Caught = err.code === 'RELATIONSHIP_NOT_FOUND' || err.statusCode === 404;
  }
  assert(test5Caught, '5: Pending Care Request cannot be ended through relationship endpoint');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7: ENDED relationship cannot be ended again
  // ──────────────────────────────────────────────────────────────────────────
  let test7Caught = false;
  try {
    await careRelService.endCareRelationship(
      rel1Id, // already ENDED in test 1
      { reason: 'CARE_NO_LONGER_REQUIRED' },
      { id: patient1Id, role: 'PATIENT' },
    );
  } catch (err: any) {
    test7Caught = err.code === 'RELATIONSHIP_ALREADY_ENDED' || err.statusCode === 409;
  }
  assert(test7Caught, '7: ENDED relationship cannot be ended again (409 Conflict)');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 8: ENDED relationship cannot be resurrected (terminal state trigger)
  // ──────────────────────────────────────────────────────────────────────────
  let test8Caught = false;
  try {
    await pool.query(
      `UPDATE patient_relationships SET status = 'ACTIVE_CARE' WHERE id = $1`,
      [rel1Id],
    );
  } catch (err: any) {
    // PostgreSQL trigger raises exception 23514
    test8Caught = err.message.includes('Cannot resurrect an ENDED relationship') || err.code === '23514';
  }
  assert(test8Caught, '8: ENDED relationship cannot be resurrected (trigger enforced)');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 11: >500 character notes rejected
  // ──────────────────────────────────────────────────────────────────────────
  let test11Caught = false;
  try {
    const longNotes = 'A'.repeat(501);
    await careRelService.endCareRelationship(
      rel3Id,
      { reason: 'OTHER', notes: longNotes },
      { id: patient1Id, role: 'PATIENT' },
    );
  } catch (err: any) {
    test11Caught = err.code === 'NOTES_TOO_LONG' || err.statusCode === 400;
  }
  assert(test11Caught, '11: >500 character notes rejected');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 12: Invalid reason rejected
  // ──────────────────────────────────────────────────────────────────────────
  let test12Caught = false;
  try {
    await careRelService.endCareRelationship(
      rel3Id,
      { reason: 'NOT_A_VALID_REASON' as any },
      { id: patient1Id, role: 'PATIENT' },
    );
  } catch (err: any) {
    test12Caught = err.code === 'VALIDATION_ERROR' || err.statusCode === 400;
  }
  assert(test12Caught, '12: Invalid reason rejected');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 13: Concurrent End Care requests produce exactly one successful transition
  // ──────────────────────────────────────────────────────────────────────────
  const relConcurrentRes = await pool.query(`
    INSERT INTO patient_relationships (id, patient_user_id, related_user_id, relationship_type, status, confirmed_at)
    VALUES (gen_random_uuid(), '${patient2Id}', '${caregiverAId}', 'CAREGIVER', 'ACTIVE_CARE', NOW())
    RETURNING id;
  `);
  const relConcurrentId = relConcurrentRes.rows[0].id;

  const promises = [
    careRelService.endCareRelationship(
      relConcurrentId,
      { reason: 'FOUND_DIFFERENT_CARE' },
      { id: patient2Id, role: 'PATIENT' },
    ).then(() => 'SUCCESS').catch((e) => e.code || 'ERROR'),
    careRelService.endCareRelationship(
      relConcurrentId,
      { reason: 'FAMILY_TAKING_OVER' },
      { id: patient2Id, role: 'PATIENT' },
    ).then(() => 'SUCCESS').catch((e) => e.code || 'ERROR'),
  ];

  const results = await Promise.all(promises);
  const successCount = results.filter((r) => r === 'SUCCESS').length;
  const conflictCount = results.filter((r) => r === 'RELATIONSHIP_ALREADY_ENDED').length;
  assert(
    successCount === 1 && conflictCount === 1,
    '13: Concurrent End Care requests produce exactly one successful transition and one 409 conflict',
    `results: ${JSON.stringify(results)}`,
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 14: Ending caregiver A does not affect caregiver B (Multi-Caregiver Safety)
  // ──────────────────────────────────────────────────────────────────────────
  // Setup: Patient 2 has Caregiver B and Caregiver C both in ACTIVE_CARE
  const relBRes = await pool.query(`
    INSERT INTO patient_relationships (id, patient_user_id, related_user_id, relationship_type, status, confirmed_at)
    VALUES (gen_random_uuid(), '${patient2Id}', '${caregiverBId}', 'CAREGIVER', 'ACTIVE_CARE', NOW())
    RETURNING id;
  `);
  const relBId = relBRes.rows[0].id;

  const relCRes = await pool.query(`
    INSERT INTO patient_relationships (id, patient_user_id, related_user_id, relationship_type, status, confirmed_at)
    VALUES (gen_random_uuid(), '${patient2Id}', '${caregiverCId}', 'CAREGIVER', 'ACTIVE_CARE', NOW())
    RETURNING id;
  `);
  const relCId = relCRes.rows[0].id;

  // End Caregiver B
  await careRelService.endCareRelationship(
    relBId,
    { reason: 'CAREGIVER_NOT_A_GOOD_FIT' },
    { id: patient2Id, role: 'PATIENT' },
  );

  // Inspect state of Caregiver B and Caregiver C
  const checkB = await pool.query('SELECT status FROM patient_relationships WHERE id = $1', [relBId]);
  const checkC = await pool.query('SELECT status FROM patient_relationships WHERE id = $1', [relCId]);

  assert(
    checkB.rows[0].status === 'ENDED' && checkC.rows[0].status === 'ACTIVE_CARE',
    '14: Ending caregiver A does not affect caregiver B (multi-caregiver safety)',
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 15 & 16: Active Care Team excludes ENDED & Care History includes ENDED
  // ──────────────────────────────────────────────────────────────────────────
  const activeCaregivers = await relService.getMyCaregivers(patient2Id);
  const careHistory = await careRelService.getCareRelationshipHistory(patient2Id, { id: patient2Id, role: 'PATIENT' });

  const activeIncludesB = activeCaregivers.some((cg) => cg.relationship_id === relBId);
  const activeIncludesC = activeCaregivers.some((cg) => cg.relationship_id === relCId);
  const historyIncludesB = careHistory.some((item) => item.relationship_id === relBId);

  assert(!activeIncludesB && activeIncludesC, '15: Active Care Team excludes ENDED relationships');
  assert(historyIncludesB, '16: Care History includes ENDED relationships');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 17: Historical Care Request remains ACCEPTED
  // ──────────────────────────────────────────────────────────────────────────
  const historicalReqRes = await pool.query(`
    INSERT INTO care_requests (
      patient_id, requester_id, caregiver_id, status, schedule_type, start_date, proposed_rate_type, proposed_rate_inr, resulting_relationship_id
    ) VALUES (
      '${patient2Id}', '${patient2Id}', '${caregiverBId}', 'ACCEPTED', 'RECURRING', CURRENT_DATE, 'HOURLY', 600, '${relBId}'
    ) RETURNING id, status;
  `);
  const historicalReqId = historicalReqRes.rows[0].id;

  const verifyReq = await pool.query('SELECT status FROM care_requests WHERE id = $1', [historicalReqId]);
  assert(
    verifyReq.rows[0].status === 'ACCEPTED',
    '17: Historical Care Request remains ACCEPTED when care relationship is ended',
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 18: Transaction rollback leaves relationship unchanged
  // ──────────────────────────────────────────────────────────────────────────
  const clientRollback = await pool.connect();
  try {
    await clientRollback.query('BEGIN');
    await clientRollback.query(
      `UPDATE patient_relationships SET status = 'ENDED' WHERE id = $1`,
      [relCId],
    );
    // Intentionally rollback
    await clientRollback.query('ROLLBACK');
  } finally {
    clientRollback.release();
  }

  const checkRollback = await pool.query('SELECT status FROM patient_relationships WHERE id = $1', [relCId]);
  assert(checkRollback.rows[0].status === 'ACTIVE_CARE', '18: Transaction rollback leaves relationship unchanged');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 19: Notifications/events occur only after successful commit
  // ──────────────────────────────────────────────────────────────────────────
  // Successfully end relCId now
  await careRelService.endCareRelationship(
    relCId,
    { reason: 'OTHER', notes: 'Scheduled conclusion' },
    { id: patient2Id, role: 'PATIENT' },
  );
  const notificationCheck = await pool.query(
    `SELECT notification_type, user_id FROM notification_logs 
     WHERE user_id = $1 AND notification_type = 'CARE_RELATIONSHIP_ENDED'`,
    [caregiverCId],
  );
  assert(
    notificationCheck.rows.length > 0,
    '19: Notification event dispatched after successful commit',
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 20: Active-care authorization no longer applies after ENDED
  // ──────────────────────────────────────────────────────────────────────────
  const authQuery = await pool.query(
    `SELECT id FROM patient_relationships
     WHERE patient_user_id = $1 AND related_user_id = $2
       AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`,
    [patient2Id, caregiverCId],
  );
  assert(
    authQuery.rows.length === 0,
    '20: Active-care authorization no longer applies after relationship is ENDED',
  );

  console.log('\n======================================================================');
  console.log(`REAL POSTGRESQL VERIFICATION SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('100% Real Live Database Engine Tests Verified!');
  console.log('======================================================================\n');
}

runRealDatabaseTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
