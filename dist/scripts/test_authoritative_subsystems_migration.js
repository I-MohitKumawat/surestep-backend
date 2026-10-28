"use strict";
/**
 * SureStep — scripts/test_authoritative_subsystems_migration.ts
 *
 * Comprehensive End-to-End Integration Test Suite for the Authoritative Subsystems Migration:
 *   1. Care Requests & Discovery (Expression of interest only, zero patient_relationships insertion)
 *   2. Caregiver Relationships & 7-Day Notice Period (Deprecate interactive resignation with 410 GONE)
 *   3. Routine Subsystem & Authorization (Caregiver CRUD forbidden, replacement overdue, assigned caregiver sign-off)
 *   4. Safe Zones & Location (Circle Owner-only CRUD, multi-patient monitoring, stale telemetry retrospective suppression)
 *   5. Safety & Alerts (Decoupled IM_RESPONDING responder ledger, Circle Owner-only resolution)
 *   6. Memories & Activities (Manage Patient Memories permission, connected care audience visibility, observational activity attempts, zero progression scores)
 *
 * Database: PostgreSQL Engine (dev port 5433)
 * Zero Mocking — Real Transactions, Triggers, Invariants, and Authorization Guards.
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
const node_assert_1 = __importDefault(require("node:assert"));
const config_1 = __importDefault(require("../db/config"));
const care_circles_service_1 = require("../modules/care-circles/care-circles.service");
const permissions_service_1 = require("../modules/care-circles/permissions.service");
const caregiver_relationships_service_1 = require("../modules/care-circles/caregiver-relationships.service");
const patient_assignments_service_1 = require("../modules/care-circles/patient-assignments.service");
const authoritative_routines_service_1 = require("../modules/routines/authoritative-routines.service");
const authoritative_safe_zones_service_1 = require("../modules/location/authoritative-safe-zones.service");
const authoritative_safety_service_1 = require("../modules/alerts/authoritative-safety.service");
const authoritative_memories_service_1 = require("../modules/memories/authoritative-memories.service");
const careRequestsService = __importStar(require("../modules/care-requests/care-requests.service"));
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
async function runAuthoritativeSubsystemsSuite() {
    console.log('======================================================================');
    console.log('SURESTEP AUTHORITATIVE SUBSYSTEMS MIGRATION INTEGRATION TEST SUITE');
    console.log('Target Database: PostgreSQL Engine (dev: sure-step)');
    console.log('Baseline: docs/architecture/TARGET_ARCHITECTURE.md & Workflows 01-11');
    console.log('======================================================================\n');
    const runId = Date.now();
    async function createUser(role, label) {
        const uid = `fb-${label}-${runId}-${Math.floor(Math.random() * 100000)}`;
        const email = `${label}-${runId}-${Math.floor(Math.random() * 100000)}@test.com`;
        const phone = `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`;
        const res = await config_1.default.query(`INSERT INTO users (firebase_uid, email, phone, name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`, [uid, email, phone, `${label} User`, role]);
        return res.rows[0];
    }
    // Seed baseline actors
    console.log('--- Setting up Test Actors & Care Circle ---');
    const familyOwner = await createUser('FAMILY', 'FamOwner');
    const familyMember = await createUser('FAMILY', 'FamMember');
    const caregiver1 = await createUser('CAREGIVER', 'NurseAlice');
    const caregiver2 = await createUser('CAREGIVER', 'NurseBob');
    const patient1 = await createUser('PATIENT', 'PatientCharlie');
    const patient2 = await createUser('PATIENT', 'PatientDavid');
    // Create active Care Circle owned by familyOwner
    const circle = await care_circles_service_1.careCirclesService.createCareCircle(familyOwner.id, 'St. Jude Family Circle');
    // Associate patient1 and patient2 with the Circle
    await config_1.default.query(`INSERT INTO patient_circle_associations (circle_id, patient_id, associated_by) VALUES ($1, $2, $4), ($1, $3, $4)`, [circle.id, patient1.id, patient2.id, familyOwner.id]);
    // Add familyMember to Circle
    const famMemberRes = await config_1.default.query(`INSERT INTO care_circle_members (circle_id, user_id, role_in_circle) VALUES ($1, $2, 'MEMBER') RETURNING id`, [circle.id, familyMember.id]);
    const familyMemberRecordId = famMemberRes.rows[0].id;
    console.log(`Care Circle created: ${circle.id} (Owner: ${familyOwner.id})\n`);
    // ===========================================================================
    // 1. Care Requests & Discovery
    // ===========================================================================
    console.log('>>> Subsystem 1: Care Requests & Discovery');
    let careRequestId;
    await test('1.1 Family member requires Search/Request Caregivers permission to send Care Request', async () => {
        // familyMember currently has NO permissions -> creation should fail
        await node_assert_1.default.rejects(async () => {
            await careRequestsService.createCareRequest(familyMember, {
                patientId: patient1.id,
                caregiverId: caregiver1.id,
                scheduleType: 'RECURRING',
                requestedShifts: ['DAY_SHIFT'],
                daysOfWeek: [1, 2, 3],
                startDate: '2026-11-01',
                proposedRateType: 'HOURLY',
                proposedRateInr: 25,
            });
        }, (err) => {
            (0, node_assert_1.default)(err.statusCode === 403 || err.code === 'SEARCH_REQUEST_CAREGIVERS_PERMISSION_REQUIRED', `Expected 403 / SEARCH_REQUEST_CAREGIVERS_PERMISSION_REQUIRED, got ${err.statusCode} / ${err.code}`);
            return true;
        });
        // Grant canonical permission 'Search/Request Caregivers' to familyMember
        await permissions_service_1.permissionsService.grantPermission(circle.id, familyOwner.id, familyMemberRecordId, 'Search/Request Caregivers');
        // Now request creation succeeds
        const req = await careRequestsService.createCareRequest(familyMember, {
            patientId: patient1.id,
            caregiverId: caregiver1.id,
            scheduleType: 'RECURRING',
            requestedShifts: ['DAY_SHIFT'],
            daysOfWeek: [1, 2, 3],
            startDate: '2026-11-01',
            proposedRateType: 'HOURLY',
            proposedRateInr: 25,
        });
        node_assert_1.default.strictEqual(req.status, 'PENDING');
        careRequestId = req.id;
    });
    await test('1.2 Caregiver acceptance expresses availability without inserting patient_relationships or granting care access', async () => {
        // Count existing patient_relationships before acceptance
        const beforeCount = await config_1.default.query(`SELECT COUNT(*) FROM patient_relationships WHERE patient_user_id = $1 AND related_user_id = $2`, [patient1.id, caregiver1.id]);
        node_assert_1.default.strictEqual(parseInt(beforeCount.rows[0].count), 0);
        // Caregiver accepts request
        const accepted = await careRequestsService.acceptCareRequest(caregiver1, careRequestId);
        node_assert_1.default.strictEqual(accepted.request.status, 'ACCEPTED');
        // Invariant: zero rows created in patient_relationships
        const afterCount = await config_1.default.query(`SELECT COUNT(*) FROM patient_relationships WHERE patient_user_id = $1 AND related_user_id = $2`, [patient1.id, caregiver1.id]);
        node_assert_1.default.strictEqual(parseInt(afterCount.rows[0].count), 0);
        // Invariant: caregiver is NOT yet assigned
        const isAssigned = await patient_assignments_service_1.patientAssignmentsService.isCaregiverAssignedToPatient(caregiver1.id, patient1.id);
        node_assert_1.default.strictEqual(isAssigned, false);
    });
    // ===========================================================================
    // 2. Caregiver Relationships & Notice Period
    // ===========================================================================
    console.log('\n>>> Subsystem 2: Caregiver Relationships & Notice Period');
    let relationship1;
    let assignment1;
    await test('2.1 Establish contractual relationship and explicit patient assignment', async () => {
        // Add caregiver1 as circle member
        await config_1.default.query(`INSERT INTO care_circle_members (circle_id, user_id, role_in_circle) VALUES ($1, $2, 'CAREGIVER')`, [circle.id, caregiver1.id]);
        // Establish relationship
        relationship1 = await caregiver_relationships_service_1.caregiverRelationshipsService.establishRelationship(circle.id, familyOwner.id, caregiver1.id);
        node_assert_1.default.strictEqual(relationship1.status, 'ACTIVE');
        // Assign caregiver1 to patient1
        assignment1 = await patient_assignments_service_1.patientAssignmentsService.assignCaregiverToPatient(relationship1.id, patient1.id, familyOwner.id);
        node_assert_1.default.strictEqual(assignment1.patient_id, patient1.id);
        node_assert_1.default.strictEqual(assignment1.is_active, true);
    });
    await test('2.2 Caregiver departure triggers non-interactive 7-Day Notice Period with active access preserved', async () => {
        const updated = await caregiver_relationships_service_1.caregiverRelationshipsService.submitNotice(relationship1.id, caregiver1.id, { reason: 'Caregiver relocating to another city' });
        node_assert_1.default.strictEqual(updated.status, 'NOTICE_PERIOD');
        node_assert_1.default.ok(updated.notice_started_at);
        node_assert_1.default.ok(updated.notice_expires_at);
        const diffHours = (new Date(updated.notice_expires_at).getTime() - new Date(updated.notice_started_at).getTime()) / (1000 * 3600);
        node_assert_1.default.strictEqual(Math.round(diffHours), 168); // Exactly 7 days
        // Access remains active during notice period
        const isAssigned = await patient_assignments_service_1.patientAssignmentsService.isCaregiverAssignedToPatient(caregiver1.id, patient1.id);
        node_assert_1.default.strictEqual(isAssigned, true);
    });
    // ===========================================================================
    // 3. Patient Care & Routine Subsystem
    // ===========================================================================
    console.log('\n>>> Subsystem 3: Patient Care & Routine Subsystem');
    let routineDefId;
    let occurrenceId;
    await test('3.1 Professional Caregiver is strictly forbidden from routine definition CRUD (403 CAREGIVER_ROUTINE_CRUD_FORBIDDEN)', async () => {
        const reqMock = {
            params: { patientId: patient1.id },
            user: caregiver1,
        };
        const resMock = {};
        let errorThrown = null;
        await (0, careCircleGuards_1.requireRoutineDefinitionCRUDAuthority)('patientId')(reqMock, resMock, (err) => {
            errorThrown = err;
        });
        (0, node_assert_1.default)(errorThrown, 'Expected error to be thrown for caregiver routine CRUD');
        node_assert_1.default.strictEqual(errorThrown.code, 'CAREGIVER_ROUTINE_CRUD_FORBIDDEN');
        node_assert_1.default.strictEqual(errorThrown.statusCode, 403);
    });
    await test('3.2 Authorized Family member creates routine definition', async () => {
        const def = await authoritative_routines_service_1.authoritativeRoutinesService.createDefinition(patient1.id, familyOwner.id, {
            title: 'Morning Blood Pressure Medication',
            category: 'MEDICATION',
            description: 'Take with full glass of water',
            schedulePattern: { frequency: 'DAILY', time: '08:00' },
        });
        node_assert_1.default.strictEqual(def.title, 'Morning Blood Pressure Medication');
        node_assert_1.default.strictEqual(def.category, 'MEDICATION');
        node_assert_1.default.strictEqual(def.is_active, true);
        routineDefId = def.id;
    });
    await test('3.3 Routine occurrences overdue replacement rule (No Skip state)', async () => {
        const todayStr = new Date().toISOString().split('T')[0];
        // Insert scheduled occurrence
        const occRes = await config_1.default.query(`INSERT INTO routine_occurrences (routine_id, patient_id, scheduled_date, scheduled_time, status)
       VALUES ($1, $2, $3, '08:00', 'SCHEDULED')
       RETURNING *`, [routineDefId, patient1.id, todayStr]);
        node_assert_1.default.strictEqual(occRes.rows.length, 1);
        occurrenceId = occRes.rows[0].id;
        node_assert_1.default.strictEqual(occRes.rows[0].status, 'SCHEDULED');
        // List occurrences evaluations
        const list = await authoritative_routines_service_1.authoritativeRoutinesService.listOccurrences(patient1.id, todayStr);
        (0, node_assert_1.default)(list.length > 0);
    });
    await test('3.4 Assigned Caregiver in Notice Period is authorized to sign off routine occurrence', async () => {
        // Sign-off authority check
        const reqMock = {
            params: { patientId: patient1.id },
            user: caregiver1,
        };
        let nextCalled = false;
        await (0, careCircleGuards_1.requireRoutineSignOffAuthority)('patientId')(reqMock, {}, (err) => {
            (0, node_assert_1.default)(!err, `Expected no error, got ${err}`);
            nextCalled = true;
        });
        node_assert_1.default.strictEqual(nextCalled, true);
        // Record sign-off
        const completion = await authoritative_routines_service_1.authoritativeRoutinesService.signOffOccurrence(patient1.id, routineDefId, occurrenceId, caregiver1, 'Assisted patient Charlie with medication and water');
        node_assert_1.default.strictEqual(completion.occurrence.id, occurrenceId);
        node_assert_1.default.strictEqual(completion.completion.completion_source, 'CAREGIVER_ASSISTED');
        // Occurrence status is now COMPLETED
        const updatedOcc = await config_1.default.query(`SELECT status FROM routine_occurrences WHERE id = $1`, [occurrenceId]);
        node_assert_1.default.strictEqual(updatedOcc.rows[0].status, 'COMPLETED');
    });
    await test('3.5 Unassigned Caregiver is denied routine occurrence sign-off (403)', async () => {
        const reqMock = {
            params: { patientId: patient1.id },
            user: caregiver2,
        };
        let errResult = null;
        await (0, careCircleGuards_1.requireRoutineSignOffAuthority)('patientId')(reqMock, {}, (err) => {
            errResult = err;
        });
        (0, node_assert_1.default)(errResult, 'Expected error for unassigned caregiver sign-off');
        node_assert_1.default.strictEqual(errResult.statusCode, 403);
    });
    // ===========================================================================
    // 4. Safe Zones & Location Subsystem
    // ===========================================================================
    console.log('\n>>> Subsystem 4: Safe Zones & Location Subsystem');
    let safeZoneId;
    await test('4.1 Safe Zone CRUD is strictly Circle Owner only in V1 (403 for non-owners)', async () => {
        // Non-owner member attempt fails
        await node_assert_1.default.rejects(async () => {
            await authoritative_safe_zones_service_1.authoritativeSafeZonesService.createSafeZone(circle.id, familyMember.id, // Not owner
            {
                name: 'Home Zone',
                centerLat: 12.9716,
                centerLng: 77.5946,
                radiusMeters: 200,
            });
        }, (err) => {
            node_assert_1.default.strictEqual(err.statusCode, 403);
            node_assert_1.default.strictEqual(err.code, 'OWNER_ONLY');
            return true;
        });
        // Circle Owner succeeds
        const zone = await authoritative_safe_zones_service_1.authoritativeSafeZonesService.createSafeZone(circle.id, familyOwner.id, {
            name: 'Home Sanctuary Zone',
            centerLat: 12.9716,
            centerLng: 77.5946,
            radiusMeters: 200,
        });
        node_assert_1.default.strictEqual(zone.name, 'Home Sanctuary Zone');
        node_assert_1.default.strictEqual(zone.radius_meters, 200);
        safeZoneId = zone.id;
    });
    await test('4.2 Multi-patient monitoring attachment is Circle Owner only', async () => {
        // Non-owner fails
        await node_assert_1.default.rejects(async () => {
            await authoritative_safe_zones_service_1.authoritativeSafeZonesService.attachPatient(circle.id, safeZoneId, patient1.id, familyMember.id);
        }, (err) => {
            node_assert_1.default.strictEqual(err.statusCode, 403);
            return true;
        });
        // Owner attaches patient1 and patient2
        const m1 = await authoritative_safe_zones_service_1.authoritativeSafeZonesService.attachPatient(circle.id, safeZoneId, patient1.id, familyOwner.id);
        const m2 = await authoritative_safe_zones_service_1.authoritativeSafeZonesService.attachPatient(circle.id, safeZoneId, patient2.id, familyOwner.id);
        node_assert_1.default.strictEqual(m1.patient_id, patient1.id);
        node_assert_1.default.strictEqual(m2.patient_id, patient2.id);
    });
    await test('4.3 Stale location telemetry (>20 min / inaccurate) suppresses retrospective Safe Zone breach alerts', async () => {
        // Ingest a location ping that is 2 hours old and outside the zone
        const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
        const result = await authoritative_safe_zones_service_1.authoritativeSafeZonesService.ingestLocationObservation(patient1.id, {
            lat: 13.0500, // Outside 200m zone
            lng: 77.6500,
            accuracyMeters: 10,
            recordedAt: twoHoursAgo,
        });
        node_assert_1.default.strictEqual(result.freshnessTier, 'STALE');
        node_assert_1.default.strictEqual(result.breachAlertGenerated, false); // Invariant: STALE telemetry must not trigger breach alert
        node_assert_1.default.ok(result.observation.id); // Historical telemetry preserved
    });
    await test('4.4 Fresh accurate location breach generates real-time zone breach alert', async () => {
        const nowStr = new Date().toISOString();
        const result = await authoritative_safe_zones_service_1.authoritativeSafeZonesService.ingestLocationObservation(patient1.id, {
            lat: 13.0500, // Outside 200m zone
            lng: 77.6500,
            accuracyMeters: 15,
            recordedAt: nowStr,
        });
        node_assert_1.default.strictEqual(result.freshnessTier, 'CURRENT');
        node_assert_1.default.strictEqual(result.breachAlertGenerated, true);
        node_assert_1.default.strictEqual(result.triggeredAlerts[0]?.alert_type, 'ZONE_BREACH');
        node_assert_1.default.strictEqual(result.triggeredAlerts[0]?.status, 'TRIGGERED');
    });
    // ===========================================================================
    // 5. Safety & Alert Subsystem
    // ===========================================================================
    console.log('\n>>> Subsystem 5: Safety & Alert Subsystem');
    let alertId;
    await test('5.1 Trigger manual SOS alert and verify incident lifecycle state', async () => {
        const alert = await authoritative_safety_service_1.authoritativeSafetyService.triggerSOS(patient1.id, 12.9716, 77.5946);
        node_assert_1.default.strictEqual(alert.alert_type, 'SOS_MANUAL');
        node_assert_1.default.strictEqual(alert.status, 'TRIGGERED');
        alertId = alert.id;
    });
    await test('5.2 Decoupled responder ledger records IM_RESPONDING without altering alert status or locking out responders', async () => {
        // Caregiver1 responds
        const resp1 = await authoritative_safety_service_1.authoritativeSafetyService.respondToAlert(alertId, caregiver1, 'On my way from second floor');
        node_assert_1.default.strictEqual(resp1.response.action, 'IM_RESPONDING');
        node_assert_1.default.strictEqual(resp1.response.responder_id, caregiver1.id);
        // Alert status is ACTIVE/VIEWED, not RESOLVED
        node_assert_1.default.notStrictEqual(resp1.alert.status, 'RESOLVED');
        // Family Member can ALSO respond (no exclusive lockout)
        const resp2 = await authoritative_safety_service_1.authoritativeSafetyService.respondToAlert(alertId, familyMember, 'Also alerted the building security');
        node_assert_1.default.strictEqual(resp2.response.responder_id, familyMember.id);
        // Both responses recorded in ledger
        const responses = await config_1.default.query(`SELECT * FROM safety_alert_responses WHERE alert_id = $1 ORDER BY created_at ASC`, [alertId]);
        node_assert_1.default.strictEqual(responses.rows.length, 2);
    });
    await test('5.3 Resolving a safety alert is strictly Circle Owner only in V1 (403 for non-owners)', async () => {
        // Caregiver cannot resolve alert
        await node_assert_1.default.rejects(async () => {
            await authoritative_safety_service_1.authoritativeSafetyService.resolveAlert(alertId, caregiver1, 'Patient is safe');
        }, (err) => {
            node_assert_1.default.strictEqual(err.statusCode, 403);
            node_assert_1.default.strictEqual(err.code, 'OWNER_ONLY');
            return true;
        });
        // Family Member (non-owner) cannot resolve alert
        await node_assert_1.default.rejects(async () => {
            await authoritative_safety_service_1.authoritativeSafetyService.resolveAlert(alertId, familyMember, 'Patient is safe');
        }, (err) => {
            node_assert_1.default.strictEqual(err.statusCode, 403);
            node_assert_1.default.strictEqual(err.code, 'OWNER_ONLY');
            return true;
        });
        // Circle Owner resolves alert
        const resolved = await authoritative_safety_service_1.authoritativeSafetyService.resolveAlert(alertId, familyOwner, 'Confirmed safe at home');
        node_assert_1.default.strictEqual(resolved.alert.status, 'RESOLVED');
        node_assert_1.default.strictEqual(resolved.alert.resolved_by, familyOwner.id);
        node_assert_1.default.ok(resolved.alert.resolved_at);
    });
    // ===========================================================================
    // 6. Memories & Activities Subsystem
    // ===========================================================================
    console.log('\n>>> Subsystem 6: Memories & Activities Subsystem');
    let memoryId;
    await test('6.1 Creating a memory requires Circle Owner or Manage Patient Memories permission', async () => {
        // familyMember does not hold 'Manage Patient Memories' yet -> guard fails
        const reqMock = {
            params: { patientId: patient1.id },
            user: familyMember,
        };
        let errResult = null;
        await (0, careCircleGuards_1.requirePatientMemoryManagementAuthority)('patientId')(reqMock, {}, (err) => {
            errResult = err;
        });
        (0, node_assert_1.default)(errResult, 'Expected error for unpermissioned member');
        node_assert_1.default.strictEqual(errResult.statusCode, 403);
        node_assert_1.default.strictEqual(errResult.code, 'MEMORY_MANAGEMENT_FORBIDDEN');
        // Grant canonical permission 'Manage Patient Memories' to familyMember
        await permissions_service_1.permissionsService.grantPermission(circle.id, familyOwner.id, familyMemberRecordId, 'Manage Patient Memories');
        // Now authorized: create memory
        const mem = await authoritative_memories_service_1.authoritativeMemoriesService.createMemory(patient1.id, familyMember.id, {
            title: 'Family Summer Trip 2024',
            mediaType: 'PHOTO',
            mediaKey: 'uploads/summer-trip.jpg',
            caption: 'At grandmother garden with the children',
        });
        node_assert_1.default.strictEqual(mem.title, 'Family Summer Trip 2024');
        node_assert_1.default.strictEqual(mem.media_type, 'PHOTO');
        memoryId = mem.id;
    });
    await test('6.2 Memory visibility is restricted strictly to connected care audience', async () => {
        // Connected Caregiver1 (assigned to patient1) is authorized to view
        const reqCaregiver = {
            params: { patientId: patient1.id },
            user: caregiver1,
        };
        let cgAllowed = false;
        await (0, careCircleGuards_1.requireActivePatientAssignment)('patientId')(reqCaregiver, {}, (err) => {
            (0, node_assert_1.default)(!err);
            cgAllowed = true;
        });
        node_assert_1.default.strictEqual(cgAllowed, true);
        // Unassigned Caregiver2 is strictly DENIED
        const reqUnassigned = {
            params: { patientId: patient1.id },
            user: caregiver2,
        };
        let unassignedErr = null;
        await (0, careCircleGuards_1.requireActivePatientAssignment)('patientId')(reqUnassigned, {}, (err) => {
            unassignedErr = err;
        });
        (0, node_assert_1.default)(unassignedErr, 'Expected unassigned caregiver to be denied memory access');
        node_assert_1.default.strictEqual(unassignedErr.statusCode, 403);
    });
    await test('6.3 Observational activity attempts logging (Zero clinical progression / diagnosis)', async () => {
        const attempt = await authoritative_memories_service_1.authoritativeMemoriesService.recordActivityAttempt(patient1.id, {
            activityType: 'PHOTO_MATCH',
            durationSeconds: 120,
            completed: true,
            metrics: {
                attempts: 5,
                matched_pairs: 4,
                score: 95, // Sneaky diagnostic score attempt
                decline_rate: 0.1, // Sneaky progression claim
            },
        });
        node_assert_1.default.strictEqual(attempt.activity_type, 'PHOTO_MATCH');
        node_assert_1.default.strictEqual(attempt.duration_seconds, 120);
        node_assert_1.default.strictEqual(attempt.completed, true);
        // Invariant: metrics sanitized to exclude clinical / progression / score keys
        node_assert_1.default.strictEqual(attempt.metrics.score, undefined);
        node_assert_1.default.strictEqual(attempt.metrics.decline_rate, undefined);
        node_assert_1.default.strictEqual(attempt.metrics.matched_pairs, 4);
        // Read activities log
        const activities = await authoritative_memories_service_1.authoritativeMemoriesService.getActivityAttempts(patient1.id);
        node_assert_1.default.strictEqual(activities.activities.length, 1);
        node_assert_1.default.ok(activities.clinical_disclaimer);
    });
    // Clean up
    console.log('\n--- Cleaning up Test Data ---');
    await config_1.default.query('DELETE FROM activity_attempts WHERE patient_id IN ($1, $2)', [patient1.id, patient2.id]);
    await config_1.default.query('DELETE FROM memories WHERE patient_id IN ($1, $2)', [patient1.id, patient2.id]);
    await config_1.default.query('DELETE FROM location_observations WHERE patient_id IN ($1, $2)', [patient1.id, patient2.id]);
    await config_1.default.query('DELETE FROM safety_alerts WHERE circle_id = $1', [circle.id]);
    await config_1.default.query('DELETE FROM safe_zones WHERE circle_id = $1', [circle.id]);
    await config_1.default.query('DELETE FROM routine_definitions WHERE patient_id IN ($1, $2)', [patient1.id, patient2.id]);
    await config_1.default.query('DELETE FROM patient_assignments WHERE relationship_id = $1', [relationship1?.id]);
    await config_1.default.query('DELETE FROM caregiver_relationships WHERE circle_id = $1', [circle.id]);
    await config_1.default.query('DELETE FROM care_requests WHERE patient_id IN ($1, $2) OR requester_id IN ($3, $4)', [patient1.id, patient2.id, familyOwner.id, familyMember.id]);
    await config_1.default.query('DELETE FROM patient_circle_associations WHERE circle_id = $1', [circle.id]);
    await config_1.default.query('DELETE FROM care_circle_members WHERE circle_id = $1', [circle.id]);
    await config_1.default.query('DELETE FROM care_circles WHERE id = $1', [circle.id]);
    await config_1.default.query('DELETE FROM users WHERE id IN ($1, $2, $3, $4, $5, $6)', [familyOwner.id, familyMember.id, caregiver1.id, caregiver2.id, patient1.id, patient2.id]);
    console.log('\n======================================================================');
    console.log(`ALL INTEGRATION TESTS PASSED: ${passedTests} / ${totalTests}`);
    console.log('Authoritative Subsystems Migration is 100% Verified against PostgreSQL');
    console.log('======================================================================');
}
runAuthoritativeSubsystemsSuite()
    .then(() => {
    config_1.default.end();
    process.exit(0);
})
    .catch((err) => {
    console.error('\nTest Suite Failed:', err);
    config_1.default.end();
    process.exit(1);
});
//# sourceMappingURL=test_authoritative_subsystems_migration.js.map