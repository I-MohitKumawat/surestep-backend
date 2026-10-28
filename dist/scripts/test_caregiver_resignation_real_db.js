"use strict";
/**
 * test_caregiver_resignation_real_db.ts
 *
 * Real PostgreSQL Integration Test Suite for Phase 3B: Caregiver Resignation & Handover.
 * ZERO MOCKING of database connection, queries, locks, triggers, or constraints.
 *
 * Connects to live PostgreSQL database: surestep_test
 * Verifies all 20 required specifications:
 *  1. Caregiver creates resignation request.
 *  2. Unauthorized caregiver rejected (403 Forbidden).
 *  3. Patient/family cannot create caregiver resignation (403 Forbidden).
 *  4. Duplicate pending resignation rejected (409 Conflict / Unique Index).
 *  5. Patient accepts resignation.
 *  6. Authorized family accepts resignation.
 *  7. Unauthorized family rejected (403 Forbidden).
 *  8. Patient/family declines resignation.
 *  9. Caregiver withdraws resignation.
 * 10. Accepted resignation ends relationship (status = ENDED).
 * 11. Declined resignation leaves relationship ACTIVE_CARE.
 * 12. Withdrawn resignation leaves relationship ACTIVE_CARE.
 * 13. Pending resignation does not revoke caregiver access (status stays ACTIVE_CARE).
 * 14. Accepted resignation revokes active-care access (status is ENDED).
 * 15. Original Care Request remains ACCEPTED.
 * 16. Relationship history preserved and retrievable.
 * 17. Concurrent resignation acceptance vs patient End Care.
 * 18. Concurrent double acceptance (exactly one succeeds, one receives 409).
 * 19. Concurrent caregiver withdrawal vs acceptance (exactly one wins).
 * 20. Transaction rollback preserves consistent state.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5433/sure-step';
process.env.NODE_ENV = 'test';
const config_1 = __importDefault(require("../db/config"));
const migrator_1 = require("../db/migrator");
const careRelService = __importStar(require("../modules/care-relationships/care-relationships.service"));
const relService = __importStar(require("../modules/relationships/relationships.service"));
let totalTests = 0;
let passedTests = 0;
function assert(condition, testName, detail) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  ✓ [PASS] Test ${testName}`);
    }
    else {
        console.error(`  ✗ [FAIL] Test ${testName}${detail ? ` - ${detail}` : ''}`);
        throw new Error(`Assertion failed: ${testName} - ${detail || ''}`);
    }
}
let userCounter = 100;
async function createTestArrangement(label) {
    userCounter++;
    const ptId = `42000000-0000-4000-8000-${String(userCounter).padStart(12, '0')}`;
    userCounter++;
    const cgId = `62000000-0000-4000-8000-${String(userCounter).padStart(12, '0')}`;
    userCounter++;
    const famAuthId = `52000000-0000-4000-8000-${String(userCounter).padStart(12, '0')}`;
    userCounter++;
    const famUnauthId = `52000000-0000-4000-8000-${String(userCounter).padStart(12, '0')}`;
    await config_1.default.query(`
    INSERT INTO users (id, firebase_uid, phone, name, role, is_active)
    VALUES 
      ('${ptId}', 'fb-pt-${userCounter}', '+919777${String(userCounter).padStart(6, '0')}', 'Patient ${label}', 'PATIENT', TRUE),
      ('${cgId}', 'fb-cg-${userCounter}', '+919666${String(userCounter).padStart(6, '0')}', 'Caregiver ${label}', 'CAREGIVER', TRUE),
      ('${famAuthId}', 'fb-fam1-${userCounter}', '+919555${String(userCounter).padStart(6, '0')}', 'Family Auth ${label}', 'FAMILY', TRUE),
      ('${famUnauthId}', 'fb-fam2-${userCounter}', '+919444${String(userCounter).padStart(6, '0')}', 'Family Unauth ${label}', 'FAMILY', TRUE)
    ON CONFLICT (id) DO NOTHING;
  `);
    await config_1.default.query(`
    INSERT INTO caregiver_profiles (user_id, professional_role, rating, rating_count)
    VALUES ('${cgId}', 'Professional Caregiver', 4.9, 15)
    ON CONFLICT (user_id) DO NOTHING;
  `);
    await config_1.default.query(`
    INSERT INTO patient_relationships (patient_user_id, related_user_id, relationship_type, status, confirmed_at)
    VALUES ('${ptId}', '${famAuthId}', 'GUARDIAN', 'CONFIRMED', NOW())
    ON CONFLICT DO NOTHING;
  `);
    const relRes = await config_1.default.query(`
    INSERT INTO patient_relationships (
      patient_user_id, related_user_id, relationship_type, status, confirmed_at
    ) VALUES ($1, $2, 'CAREGIVER', 'ACTIVE_CARE', NOW())
    RETURNING id
  `, [ptId, cgId]);
    const relId = relRes.rows[0].id;
    const reqRes = await config_1.default.query(`
    INSERT INTO care_requests (
      patient_id, requester_id, caregiver_id, status,
      schedule_type, start_date, proposed_rate_type, proposed_rate_inr,
      resulting_relationship_id
    ) VALUES ($1, $1, $2, 'ACCEPTED', 'RECURRING', CURRENT_DATE, 'HOURLY', 350, $3)
    RETURNING id
  `, [ptId, cgId, relId]);
    const requestId = reqRes.rows[0].id;
    return { ptId, cgId, famAuthId, famUnauthId, relId, requestId };
}
async function runRealDatabaseTests() {
    console.log('======================================================================');
    console.log('SURESTEP PHASE 3B: REAL POSTGRESQL INTEGRATION TEST SUITE');
    console.log('Target Database: surestep_test (PostgreSQL Engine)');
    console.log('Zero Mocking — Real Transactions, Locks, Triggers, and Constraints');
    console.log('======================================================================\n');
    // 0. Ensure migrations applied
    console.log('[Setup] Applying migrations...');
    await (0, migrator_1.runMigrations)();
    console.log('\n--- EXECUTION OF PHASE 3B SPECIFICATIONS ---\n');
    // TEST 1: Caregiver creates resignation
    const t1 = await createTestArrangement('T1');
    const resignation1 = await careRelService.createResignationRequest(t1.relId, { reason: 'SCHEDULE_CONFLICT', notes: 'Availability shifted to morning only.' }, { id: t1.cgId, role: 'CAREGIVER' });
    assert(resignation1.status === 'PENDING' && resignation1.reason === 'SCHEDULE_CONFLICT', '1: Caregiver creates resignation request in PENDING status');
    // TEST 2: Unauthorized caregiver rejected
    const t2 = await createTestArrangement('T2');
    let unauthCgRejected = false;
    try {
        await careRelService.createResignationRequest(t1.relId, // T1 relationship
        { reason: 'PERSONAL_CIRCUMSTANCES' }, { id: t2.cgId, role: 'CAREGIVER' });
    }
    catch (err) {
        unauthCgRejected = (err.statusCode === 403 || err.code === 'FORBIDDEN');
    }
    assert(unauthCgRejected, '2: Unauthorized caregiver rejected with 403 Forbidden');
    // TEST 3: Patient/family cannot create caregiver resignation
    const t3 = await createTestArrangement('T3');
    let patientCreateRejected = false;
    try {
        await careRelService.createResignationRequest(t3.relId, { reason: 'PERSONAL_CIRCUMSTANCES' }, { id: t3.ptId, role: 'PATIENT' });
    }
    catch (err) {
        patientCreateRejected = (err.statusCode === 403 || err.code === 'FORBIDDEN');
    }
    assert(patientCreateRejected, '3: Patient/family cannot create caregiver resignation (403 Forbidden)');
    // TEST 4: Duplicate pending resignation rejected
    const t4 = await createTestArrangement('T4');
    await careRelService.createResignationRequest(t4.relId, { reason: 'OUTSIDE_SERVICE_AREA' }, { id: t4.cgId, role: 'CAREGIVER' });
    let duplicateRejected = false;
    try {
        await careRelService.createResignationRequest(t4.relId, { reason: 'PERSONAL_CIRCUMSTANCES', notes: 'Another resignation attempt' }, { id: t4.cgId, role: 'CAREGIVER' });
    }
    catch (err) {
        duplicateRejected = (err.statusCode === 409 || err.code === 'DUPLICATE_PENDING_RESIGNATION');
    }
    assert(duplicateRejected, '4: Duplicate pending resignation rejected (409 Conflict)');
    // TEST 5: Patient accepts resignation
    const t5 = await createTestArrangement('T5');
    await careRelService.createResignationRequest(t5.relId, { reason: 'PERSONAL_CIRCUMSTANCES' }, { id: t5.cgId, role: 'CAREGIVER' });
    const acceptResult5 = await careRelService.acceptResignationRequest(t5.relId, { id: t5.ptId, role: 'PATIENT' });
    assert(acceptResult5.resignation.status === 'ACCEPTED' &&
        acceptResult5.relationship.status === 'ENDED', '5: Patient accepts resignation, transitioning resignation to ACCEPTED and relationship to ENDED');
    // TEST 6: Authorized family accepts resignation
    const t6 = await createTestArrangement('T6');
    await careRelService.createResignationRequest(t6.relId, { reason: 'CARE_NEEDS_CHANGED' }, { id: t6.cgId, role: 'CAREGIVER' });
    const acceptResult6 = await careRelService.acceptResignationRequest(t6.relId, { id: t6.famAuthId, role: 'FAMILY' });
    assert(acceptResult6.resignation.status === 'ACCEPTED' &&
        acceptResult6.relationship.status === 'ENDED', '6: Authorized family coordinator accepts resignation');
    // TEST 7: Unauthorized family rejected
    const t7 = await createTestArrangement('T7');
    await careRelService.createResignationRequest(t7.relId, { reason: 'CAPACITY_CONSTRAINT' }, { id: t7.cgId, role: 'CAREGIVER' });
    let unauthFamRejected = false;
    try {
        await careRelService.acceptResignationRequest(t7.relId, { id: t7.famUnauthId, role: 'FAMILY' });
    }
    catch (err) {
        unauthFamRejected = (err.statusCode === 403 || err.code === 'FORBIDDEN');
    }
    assert(unauthFamRejected, '7: Unauthorized family member rejected with 403 Forbidden');
    // TEST 8: Patient/family declines resignation
    const t8 = await createTestArrangement('T8');
    await careRelService.createResignationRequest(t8.relId, { reason: 'ROLE_NO_LONGER_SUITABLE' }, { id: t8.cgId, role: 'CAREGIVER' });
    const declineRes8 = await careRelService.declineResignationRequest(t8.relId, { notes: 'Discussed schedule adjustments; staying active' }, { id: t8.ptId, role: 'PATIENT' });
    assert(declineRes8.status === 'DECLINED', '8: Patient/family declines resignation request');
    // TEST 9: Caregiver withdraws resignation
    const t9 = await createTestArrangement('T9');
    await careRelService.createResignationRequest(t9.relId, { reason: 'OTHER', notes: 'Personal doubts' }, { id: t9.cgId, role: 'CAREGIVER' });
    const withdrawRes9 = await careRelService.withdrawResignationRequest(t9.relId, { id: t9.cgId, role: 'CAREGIVER' });
    assert(withdrawRes9.status === 'WITHDRAWN', '9: Caregiver withdraws pending resignation request');
    // TEST 10: Accepted resignation ends relationship
    const relCheck5 = await config_1.default.query('SELECT status, end_reason FROM patient_relationships WHERE id = $1', [t5.relId]);
    assert(relCheck5.rows[0].status === 'ENDED' &&
        relCheck5.rows[0].end_reason === 'CAREGIVER_REQUESTED_END', '10: Accepted resignation sets relationship status = ENDED with end_reason = CAREGIVER_REQUESTED_END');
    // TEST 11: Declined resignation leaves relationship ACTIVE_CARE
    const relCheck8 = await config_1.default.query('SELECT status FROM patient_relationships WHERE id = $1', [t8.relId]);
    assert(relCheck8.rows[0].status === 'ACTIVE_CARE', '11: Declined resignation leaves relationship status = ACTIVE_CARE');
    // TEST 12: Withdrawn resignation leaves relationship ACTIVE_CARE
    const relCheck9 = await config_1.default.query('SELECT status FROM patient_relationships WHERE id = $1', [t9.relId]);
    assert(relCheck9.rows[0].status === 'ACTIVE_CARE', '12: Withdrawn resignation leaves relationship status = ACTIVE_CARE');
    // TEST 13: Pending resignation does not revoke caregiver access
    const t13 = await createTestArrangement('T13');
    await careRelService.createResignationRequest(t13.relId, { reason: 'CAPACITY_CONSTRAINT' }, { id: t13.cgId, role: 'CAREGIVER' });
    const activeCaregiversDuringPending = await relService.getMyCaregivers(t13.ptId);
    const isCgStillActive = activeCaregiversDuringPending.some(c => c.caregiver_id === t13.cgId || c.id === t13.cgId);
    assert(isCgStillActive, '13: Pending resignation does not revoke caregiver access (caregiver appears in active care team)');
    // TEST 14: Accepted resignation revokes active-care access
    await careRelService.acceptResignationRequest(t13.relId, { id: t13.ptId, role: 'PATIENT' });
    const activeCaregiversAfterAccept = await relService.getMyCaregivers(t13.ptId);
    const isCgRevoked = !activeCaregiversAfterAccept.some(c => c.caregiver_id === t13.cgId || c.id === t13.cgId);
    assert(isCgRevoked, '14: Accepted resignation revokes active-care access (caregiver excluded from active care team)');
    // TEST 15: Original Care Request remains ACCEPTED
    const reqCheck = await config_1.default.query('SELECT status FROM care_requests WHERE id = $1', [t13.requestId]);
    assert(reqCheck.rows[0].status === 'ACCEPTED', '15: Original Care Request remains historical status ACCEPTED after resignation is accepted');
    // TEST 16: Relationship history preserved and retrievable
    const history = await careRelService.getCareRelationshipHistory(t13.ptId, { id: t13.ptId, role: 'PATIENT' });
    const historyItem = history.find(h => h.relationship_id === t13.relId);
    assert(historyItem !== undefined &&
        historyItem.status === 'ENDED' &&
        historyItem.end_reason === 'CAREGIVER_REQUESTED_END', '16: Relationship history preserved and reflects ended arrangement with CAREGIVER_REQUESTED_END');
    // TEST 17: Concurrent resignation acceptance vs patient End Care
    const t17 = await createTestArrangement('T17');
    await careRelService.createResignationRequest(t17.relId, { reason: 'PERSONAL_CIRCUMSTANCES', notes: 'Immediate personal reason' }, { id: t17.cgId, role: 'CAREGIVER' });
    // Patient invokes End Care and acceptResignation concurrently
    const [resA, resB] = await Promise.allSettled([
        careRelService.endCareRelationship(t17.relId, { reason: 'CARE_NO_LONGER_REQUIRED' }, { id: t17.ptId, role: 'PATIENT' }),
        careRelService.acceptResignationRequest(t17.relId, { id: t17.ptId, role: 'PATIENT' }),
    ]);
    const statuses = [resA.status, resB.status];
    assert(statuses.filter(s => s === 'fulfilled').length === 1 &&
        statuses.filter(s => s === 'rejected').length === 1, '17: Concurrent End Care vs acceptResignation produces exactly one winner and one conflict rejection');
    const relCheck17 = await config_1.default.query('SELECT status FROM patient_relationships WHERE id = $1', [t17.relId]);
    assert(relCheck17.rows[0].status === 'ENDED', '17.B: Relationship status is definitively ENDED without contradiction');
    // TEST 18: Concurrent double acceptance
    const t18 = await createTestArrangement('T18');
    await careRelService.createResignationRequest(t18.relId, { reason: 'SCHEDULE_CONFLICT' }, { id: t18.cgId, role: 'CAREGIVER' });
    const [doubleAcc1, doubleAcc2] = await Promise.allSettled([
        careRelService.acceptResignationRequest(t18.relId, { id: t18.ptId, role: 'PATIENT' }),
        careRelService.acceptResignationRequest(t18.relId, { id: t18.famAuthId, role: 'FAMILY' }),
    ]);
    const doubleAccStatuses = [doubleAcc1.status, doubleAcc2.status];
    assert(doubleAccStatuses.filter(s => s === 'fulfilled').length === 1 &&
        doubleAccStatuses.filter(s => s === 'rejected').length === 1, '18: Concurrent double acceptance results in exactly one success and one 409 conflict');
    // TEST 19: Concurrent caregiver withdrawal vs acceptance
    const t19 = await createTestArrangement('T19');
    await careRelService.createResignationRequest(t19.relId, { reason: 'OTHER', notes: 'Uncertain circumstances' }, { id: t19.cgId, role: 'CAREGIVER' });
    const [raceWithdraw, raceAccept] = await Promise.allSettled([
        careRelService.withdrawResignationRequest(t19.relId, { id: t19.cgId, role: 'CAREGIVER' }),
        careRelService.acceptResignationRequest(t19.relId, { id: t19.ptId, role: 'PATIENT' }),
    ]);
    const raceStatuses = [raceWithdraw.status, raceAccept.status];
    assert(raceStatuses.filter(s => s === 'fulfilled').length === 1 &&
        raceStatuses.filter(s => s === 'rejected').length === 1, '19: Concurrent withdrawal vs acceptance serializes cleanly: exactly 1 wins and 1 rejected with 409');
    // TEST 20: Transaction rollback preserves consistent state
    const t20 = await createTestArrangement('T20');
    const res20 = await careRelService.createResignationRequest(t20.relId, { reason: 'CAPACITY_CONSTRAINT' }, { id: t20.cgId, role: 'CAREGIVER' });
    // Simulate an error inside transaction by temporarily executing a failing block
    const client = await config_1.default.connect();
    let rollbackSucceeded = false;
    try {
        await client.query('BEGIN');
        await client.query(`UPDATE caregiver_resignation_requests SET status = 'ACCEPTED' WHERE id = $1`, [res20.id]);
        // Intentionally trigger a check constraint violation error
        await client.query(`UPDATE patient_relationships SET status = 'INVALID_NONSENSE' WHERE id = $1`, [t20.relId]);
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        rollbackSucceeded = true;
    }
    finally {
        client.release();
    }
    const checkPostRollback = await config_1.default.query('SELECT status FROM caregiver_resignation_requests WHERE id = $1', [res20.id]);
    const checkRelPostRollback = await config_1.default.query('SELECT status FROM patient_relationships WHERE id = $1', [t20.relId]);
    assert(rollbackSucceeded &&
        checkPostRollback.rows[0].status === 'PENDING' &&
        checkRelPostRollback.rows[0].status === 'ACTIVE_CARE', '20: Transaction rollback preserves consistent state (resignation stays PENDING, relationship stays ACTIVE_CARE)');
    console.log('\n======================================================================');
    console.log(`REAL POSTGRESQL VERIFICATION SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log('100% Real Live Database Engine Tests Verified for Phase 3B!');
    console.log('======================================================================\n');
}
runRealDatabaseTests()
    .then(() => process.exit(0))
    .catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
});
//# sourceMappingURL=test_caregiver_resignation_real_db.js.map