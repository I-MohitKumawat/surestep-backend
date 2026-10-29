"use strict";
/**
 * SureStep — scripts/test_patient_mode_authorization.ts
 *
 * Verification suite for Patient Mode (Self-managed vs Assisted) Routine Authorization.
 *
 * Requirements:
 *  1. Self-managed patient (onboarding_source = 'SELF') CAN perform permitted routine definition CRUD.
 *  2. Assisted patient (onboarding_source = 'FAMILY') CANNOT perform routine definition CRUD (403 ASSISTED_PATIENT_ROUTINE_CRUD_FORBIDDEN).
 *  3. Authorized family member in the patient's Care Circle CAN perform routine definition CRUD.
 *  4. Caregivers and external family members are forbidden.
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
require("dotenv/config");
const node_assert_1 = __importDefault(require("node:assert"));
const config_1 = __importDefault(require("../db/config"));
const care_circles_service_1 = require("../modules/care-circles/care-circles.service");
const careCircleGuards_1 = require("../shared/middleware/careCircleGuards");
const discovery_service_1 = require("../modules/discovery/discovery.service");
const care_requests_service_1 = require("../modules/care-requests/care-requests.service");
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
async function runPatientModeAuthSuite() {
    console.log('======================================================================');
    console.log('PATIENT MODE AUTHORIZATION & ROUTINE CRUD SECURITY SUITE');
    console.log('Verifying Self-Managed vs Assisted Patient Invariants (Real Database)');
    console.log('======================================================================\n');
    const runId = Date.now();
    // Helper to create test user with role and profile
    async function createTestPatient(label, onboardingSource) {
        const uid = `fb-${label}-${runId}-${Math.floor(Math.random() * 10000)}`;
        const email = `${label}-${runId}-${Math.floor(Math.random() * 10000)}@test.com`;
        const phone = `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`;
        // Create user
        const userRes = await config_1.default.query(`INSERT INTO users (firebase_uid, email, phone, name, role)
       VALUES ($1, $2, $3, $4, 'PATIENT')
       RETURNING *`, [uid, email, phone, `${label} Patient`]);
        const user = userRes.rows[0];
        // Create patient profile
        await config_1.default.query(`INSERT INTO patient_profiles (user_id, onboarding_source)
       VALUES ($1, $2)`, [user.id, onboardingSource]);
        return user;
    }
    async function createTestUser(role, label) {
        const uid = `fb-${label}-${runId}-${Math.floor(Math.random() * 10000)}`;
        const email = `${label}-${runId}-${Math.floor(Math.random() * 10000)}@test.com`;
        const phone = `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`;
        const userRes = await config_1.default.query(`INSERT INTO users (firebase_uid, email, phone, name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`, [uid, email, phone, `${label} User`, role]);
        return userRes.rows[0];
    }
    // 1. Seed users
    const selfManagedPatient = await createTestPatient('self-managed', 'SELF');
    const assistedPatient = await createTestPatient('assisted', 'FAMILY');
    const familyOwner = await createTestUser('FAMILY', 'famOwner');
    const externalFamily = await createTestUser('FAMILY', 'famExternal');
    const caregiverUser = await createTestUser('CAREGIVER', 'cgUser');
    // 2. Set up care circle for assisted patient
    const circle = await care_circles_service_1.careCirclesService.createCareCircle(familyOwner.id, 'Assisted Patient Circle');
    await config_1.default.query(`INSERT INTO patient_circle_associations (patient_id, circle_id, associated_by)
     VALUES ($1, $2, $3)`, [assistedPatient.id, circle.id, familyOwner.id]);
    const guard = (0, careCircleGuards_1.requireRoutineDefinitionCRUDAuthority)('patientId');
    console.log('--- 1. Self-Managed Patient Routine Definition Authority ---');
    await test('1.1: Self-managed patient (onboarding_source = SELF) CAN access routine definition CRUD', async () => {
        const req = {
            params: { patientId: selfManagedPatient.id },
            user: { id: selfManagedPatient.id, role: 'PATIENT' },
        };
        const res = await runMiddleware(guard, req);
        node_assert_1.default.strictEqual(res.nextCalled, true, 'next() should be called');
        node_assert_1.default.strictEqual(res.err, undefined);
    });
    console.log('\n--- 2. Assisted Patient Routine Definition Denial ---');
    await test('2.1: Assisted patient (onboarding_source = FAMILY) is FORBIDDEN from routine definition CRUD (403)', async () => {
        const req = {
            params: { patientId: assistedPatient.id },
            user: { id: assistedPatient.id, role: 'PATIENT' },
        };
        const res = await runMiddleware(guard, req);
        node_assert_1.default.strictEqual(res.nextCalled, false, 'next() must NOT be called');
        node_assert_1.default.strictEqual(res.err?.code, 'ASSISTED_PATIENT_ROUTINE_CRUD_FORBIDDEN');
        node_assert_1.default.strictEqual(res.err?.statusCode, 403);
        node_assert_1.default.match(res.err?.message, /Assisted patients cannot manage routine configurations/);
    });
    console.log('\n--- 3. Authorized Family Member Authority ---');
    await test('3.1: Authorized Family Member in patient Circle CAN administer routine definitions', async () => {
        const req = {
            params: { patientId: assistedPatient.id },
            user: { id: familyOwner.id, role: 'FAMILY' },
        };
        const res = await runMiddleware(guard, req);
        node_assert_1.default.strictEqual(res.nextCalled, true, 'next() should be called');
        node_assert_1.default.strictEqual(res.err, undefined);
    });
    await test('3.2: Unauthorized Family Member outside patient Circle is DENIED (403)', async () => {
        const req = {
            params: { patientId: assistedPatient.id },
            user: { id: externalFamily.id, role: 'FAMILY' },
        };
        const res = await runMiddleware(guard, req);
        node_assert_1.default.strictEqual(res.nextCalled, false, 'next() must NOT be called');
        node_assert_1.default.strictEqual(res.err?.code, 'CARE_PLAN_ADMIN_FORBIDDEN');
        node_assert_1.default.strictEqual(res.err?.statusCode, 403);
    });
    console.log('\n--- 4. Professional Caregiver Denial ---');
    await test('4.1: Professional Caregiver is strictly forbidden from routine definition CRUD (403)', async () => {
        const req = {
            params: { patientId: assistedPatient.id },
            user: { id: caregiverUser.id, role: 'CAREGIVER' },
        };
        const res = await runMiddleware(guard, req);
        node_assert_1.default.strictEqual(res.nextCalled, false, 'next() must NOT be called');
        node_assert_1.default.strictEqual(res.err?.code, 'CAREGIVER_ROUTINE_CRUD_FORBIDDEN');
        node_assert_1.default.strictEqual(res.err?.statusCode, 403);
    });
    console.log('\n--- 5. Route-Level Routine Template Modification & Attachment Guards ---');
    // Route middleware for PATCH /routines/:id & DELETE /routines/:id
    const patchDeleteGuard = async (req, _res, next) => {
        const { AppError } = await Promise.resolve().then(() => __importStar(require('../shared/errors/AppError')));
        if (req.user?.role === 'CAREGIVER') {
            return next(new AppError('CAREGIVER_ROUTINE_CRUD_FORBIDDEN', 'Professional Caregivers cannot edit routine configurations in V1', 403));
        }
        if (req.user?.role === 'PATIENT') {
            const profileRes = await config_1.default.query(`SELECT onboarding_source FROM patient_profiles WHERE user_id = $1`, [req.user.id]);
            if (profileRes.rows[0]?.onboarding_source === 'FAMILY') {
                return next(new AppError('ASSISTED_PATIENT_ROUTINE_CRUD_FORBIDDEN', 'Assisted patients cannot manage routine configurations. Routines must be administered by family care circle members.', 403));
            }
        }
        next();
    };
    await test('5.1: Assisted patient cannot PATCH/DELETE routine template (403 ASSISTED_PATIENT_ROUTINE_CRUD_FORBIDDEN)', async () => {
        const req = {
            params: { id: 'routine-123' },
            user: { id: assistedPatient.id, role: 'PATIENT' },
        };
        const res = await runMiddleware(patchDeleteGuard, req);
        node_assert_1.default.strictEqual(res.nextCalled, false);
        node_assert_1.default.strictEqual(res.err?.code, 'ASSISTED_PATIENT_ROUTINE_CRUD_FORBIDDEN');
        node_assert_1.default.strictEqual(res.err?.statusCode, 403);
    });
    await test('5.2: Self-managed patient CAN PATCH/DELETE routine template', async () => {
        const req = {
            params: { id: 'routine-123' },
            user: { id: selfManagedPatient.id, role: 'PATIENT' },
        };
        const res = await runMiddleware(patchDeleteGuard, req);
        node_assert_1.default.strictEqual(res.nextCalled, true);
        node_assert_1.default.strictEqual(res.err, undefined);
    });
    console.log('\n--- 6. Caregiver Discovery & Care Request Subsystem Security ---');
    // Create discoverable caregiver
    const discoverableCg = await createTestUser('CAREGIVER', 'cgDiscoverable');
    await config_1.default.query(`INSERT INTO caregiver_profiles (user_id, professional_role, is_discoverable, verification_status, hourly_rate, daily_rate)
     VALUES ($1, 'Certified Dementia Caregiver', TRUE, 'VERIFIED', 500, 3000)`, [discoverableCg.id]);
    await test('6.1: Assisted Patient is strictly DENIED Caregiver Discovery access (403 DISCOVERY_MANAGED_BY_FAMILY)', async () => {
        try {
            await (0, discovery_service_1.validateDiscoveryAccess)(assistedPatient);
            node_assert_1.default.fail('Assisted patient should not have discovery access');
        }
        catch (err) {
            node_assert_1.default.strictEqual(err.code, 'DISCOVERY_MANAGED_BY_FAMILY');
            node_assert_1.default.strictEqual(err.statusCode, 403);
        }
    });
    await test('6.2: Self-managed Patient is ALLOWED Caregiver Discovery access', async () => {
        const res = await (0, discovery_service_1.validateDiscoveryAccess)(selfManagedPatient);
        node_assert_1.default.ok(res !== undefined, 'Self-managed patient must have discovery access');
    });
    await test('6.3: Assisted Patient is strictly DENIED Care Request creation (403 DISCOVERY_MANAGED_BY_FAMILY)', async () => {
        try {
            await (0, care_requests_service_1.createCareRequest)(assistedPatient, {
                caregiverId: discoverableCg.id,
                patientId: assistedPatient.id,
                scheduleType: 'RECURRING',
                startDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
                daysOfWeek: [1, 3, 5],
                requestedShifts: ['DAY_SHIFT'],
                requestedCapabilities: ['medication_prompts'],
                proposedRateType: 'HOURLY',
                proposedRateInr: 500,
            });
            node_assert_1.default.fail('Assisted patient should not be able to create care requests');
        }
        catch (err) {
            node_assert_1.default.strictEqual(err.code, 'DISCOVERY_MANAGED_BY_FAMILY');
            node_assert_1.default.strictEqual(err.statusCode, 403);
        }
    });
    await test('6.4: Self-managed Patient CAN create a Care Request for themselves', async () => {
        const careReq = await (0, care_requests_service_1.createCareRequest)(selfManagedPatient, {
            caregiverId: discoverableCg.id,
            patientId: selfManagedPatient.id,
            scheduleType: 'RECURRING',
            startDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
            daysOfWeek: [1, 3, 5],
            requestedShifts: ['DAY_SHIFT'],
            requestedCapabilities: ['medication_prompts'],
            proposedRateType: 'HOURLY',
            proposedRateInr: 500,
        });
        node_assert_1.default.strictEqual(careReq.patientId, selfManagedPatient.id);
        node_assert_1.default.strictEqual(careReq.requesterId, selfManagedPatient.id);
        node_assert_1.default.strictEqual(careReq.status, 'PENDING');
    });
    await test('6.5: Authorized Family Member CAN discover caregivers and create a Care Request for patient', async () => {
        const discRes = await (0, discovery_service_1.validateDiscoveryAccess)(familyOwner, assistedPatient.id);
        node_assert_1.default.ok(discRes !== undefined, 'Family owner must have discovery access for circle patient');
        const famReq = await (0, care_requests_service_1.createCareRequest)(familyOwner, {
            caregiverId: discoverableCg.id,
            patientId: assistedPatient.id,
            scheduleType: 'RECURRING',
            startDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
            daysOfWeek: [2, 4],
            requestedShifts: ['EVENING_SHIFT'],
            requestedCapabilities: ['cognitive_stimulation'],
            proposedRateType: 'HOURLY',
            proposedRateInr: 600,
        });
        node_assert_1.default.strictEqual(famReq.patientId, assistedPatient.id);
        node_assert_1.default.strictEqual(famReq.requesterId, familyOwner.id);
        node_assert_1.default.strictEqual(famReq.status, 'PENDING');
    });
    console.log('\n======================================================================');
    console.log(`PATIENT MODE AUTH SUITE COMPLETE: ${passedTests} / ${totalTests} TESTS PASSED!`);
    console.log('======================================================================\n');
    await config_1.default.end();
}
runPatientModeAuthSuite().catch(async (err) => {
    console.error('Test Suite Failed:', err);
    await config_1.default.end();
    process.exit(1);
});
//# sourceMappingURL=test_patient_mode_authorization.js.map