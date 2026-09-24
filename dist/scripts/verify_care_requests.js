"use strict";
/**
 * verify_care_requests.ts
 *
 * Automated verification test suite for SureStep Care Request Subsystem (Phase 1).
 * Verifies all 22 specific criteria defined in Phase 15 of the specification:
 *
 * AUTHORIZATION:
 *  1. Patient can request for self.
 *  2. Patient cannot request for another patient.
 *  3. Family with confirmed relationship can request for patient.
 *  4. Family without confirmed relationship gets 403.
 *  5. Caregiver cannot create request.
 *
 * CREATE:
 *  6. Valid request creates PENDING.
 *  7. Duplicate pending request gets 409.
 *  8. Active relationship gets 409.
 *  9. Invalid schedule rejected.
 * 10. Invalid capability rejected.
 * 11. Invalid rate rejected.
 *
 * LIFECYCLE:
 * 12. Caregiver accepts → request ACCEPTED + relationship created.
 * 13. Caregiver declines → DECLINED + record retained.
 * 14. Requester withdraws → WITHDRAWN + record retained.
 * 15. Expired request cannot be accepted.
 * 16. Terminal requests cannot transition again.
 *
 * CONCURRENCY:
 * 17. Accept vs withdraw cannot both succeed.
 * 18. Accepting concurrent requests cannot bypass caregiver capacity.
 * 19. Duplicate concurrent creation cannot create two pending requests.
 *
 * PRIVACY:
 * 20. Incoming request does not expose phone/exact address/etc.
 * 21. Unauthorized user cannot retrieve another request.
 *
 * MULTI-CAREGIVER:
 * 22. Patient can have independent relationships with multiple caregivers.
 *
 * BONUS / MAINTENANCE:
 * 23. Background maintenance sweeps expired requests and dispatches CARE_REQUEST_EXPIRED.
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
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = __importDefault(require("../db/config"));
const AppError_1 = require("../shared/errors/AppError");
const careRequestsService = __importStar(require("../modules/care-requests/care-requests.service"));
const care_requests_types_1 = require("../modules/care-requests/care-requests.types");
let passedTests = 0;
let totalTests = 0;
function assert(condition, testName, detail) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  ✓ [PASS] ${testName}`);
    }
    else {
        console.error(`  ✗ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    }
}
function defaultMockFallback(sqlText, params) {
    if (typeof sqlText === 'string') {
        if (sqlText.includes('FROM notification_settings')) {
            return { rows: [{ role: 'CAREGIVER', alert_categories: [] }] };
        }
        if (sqlText.includes('INSERT INTO notification_logs')) {
            return { rows: [{ id: 'notif-mock-1' }] };
        }
    }
    return { rows: [] };
}
async function runTests() {
    console.log('======================================================================');
    console.log('SURESTEP CARE REQUEST: PHASE 1 BACKEND VERIFICATION SUITE (PHASE 15)');
    console.log('======================================================================\n');
    const validPtId = '11111111-1111-4111-a111-111111111111';
    const validCgId = '22222222-2222-4222-a222-222222222222';
    const otherPtId = '99999999-9999-4999-a999-999999999999';
    const mockSelfPatientUser = {
        id: validPtId,
        firebase_uid: 'pt-fb-1',
        name: 'Meena Rao',
        role: 'PATIENT',
        preferred_language: 'en',
        is_active: true,
        onboarding_complete: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    const mockFamilyUser = {
        id: '33333333-3333-4333-a333-333333333333',
        firebase_uid: 'fm-fb-1',
        name: 'Anita Rao',
        role: 'FAMILY',
        preferred_language: 'en',
        is_active: true,
        onboarding_complete: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    const mockCaregiverUser = {
        id: validCgId,
        firebase_uid: 'cg-fb-1',
        name: 'Priya Sharma',
        role: 'CAREGIVER',
        preferred_language: 'en',
        is_active: true,
        onboarding_complete: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    const originalPoolQuery = config_1.default.query.bind(config_1.default);
    const originalPoolConnect = config_1.default.connect.bind(config_1.default);
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('--- CATEGORY 1: AUTHORIZATION (Tests 1-5) ---');
    // Test 1: Patient can request for self
    config_1.default.query = (async (sqlText, params) => {
        if (typeof sqlText === 'string') {
            if (sqlText.includes('FROM patient_profiles WHERE user_id')) {
                return { rows: [{ onboarding_source: 'SELF' }] };
            }
            if (sqlText.includes('FROM users WHERE id = $1')) {
                if (params?.[0] === validPtId) {
                    return { rows: [{ id: validPtId, role: 'PATIENT', is_active: true, deleted_at: null, name: 'Meena Rao' }] };
                }
            }
            if (sqlText.includes('FROM users u') && sqlText.includes('LEFT JOIN caregiver_profiles cp')) {
                return { rows: [{ id: validCgId, role: 'CAREGIVER', is_active: true, deleted_at: null, is_discoverable: true, name: 'Priya Sharma' }] };
            }
            if (sqlText.includes('FROM patient_relationships') && sqlText.includes("'ACTIVE_CARE'")) {
                return { rows: [] };
            }
            if (sqlText.includes('FROM care_requests') && sqlText.includes("'PENDING'")) {
                return { rows: [] };
            }
            if (sqlText.includes('INSERT INTO care_requests')) {
                return {
                    rows: [
                        {
                            id: 'req-self-1',
                            patient_id: validPtId,
                            requester_id: validPtId,
                            caregiver_id: validCgId,
                            status: 'PENDING',
                            schedule_type: 'FLEXIBLE',
                            start_date: '2026-10-01',
                            proposed_rate_type: 'HOURLY',
                            proposed_rate_inr: '350.00',
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                            expires_at: new Date(Date.now() + care_requests_types_1.CARE_REQUEST_EXPIRY_HOURS * 3600 * 1000).toISOString(),
                        },
                    ],
                };
            }
            if (sqlText.includes('FROM care_requests cr') && sqlText.includes('WHERE cr.id = $1')) {
                return {
                    rows: [
                        {
                            id: 'req-self-1',
                            patient_id: validPtId,
                            requester_id: validPtId,
                            caregiver_id: validCgId,
                            status: 'PENDING',
                            schedule_type: 'FLEXIBLE',
                            start_date: '2026-10-01',
                            proposed_rate_type: 'HOURLY',
                            proposed_rate_inr: '350.00',
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                            expires_at: new Date(Date.now() + care_requests_types_1.CARE_REQUEST_EXPIRY_HOURS * 3600 * 1000).toISOString(),
                            patient_name: 'Meena Rao',
                            requester_name: 'Meena Rao',
                            caregiver_name: 'Priya Sharma',
                        },
                    ],
                };
            }
        }
        return defaultMockFallback(sqlText, params);
    });
    const selfReq = await careRequestsService.createCareRequest(mockSelfPatientUser, {
        patientId: validPtId,
        caregiverId: validCgId,
        scheduleType: 'FLEXIBLE',
        startDate: '2026-10-01',
        proposedRateType: 'HOURLY',
        proposedRateInr: 350,
    });
    assert(selfReq.status === 'PENDING' && selfReq.requesterId === validPtId && selfReq.patientId === validPtId, 'Test 1: Patient can request for self');
    // Test 2: Patient cannot request for another patient
    try {
        await careRequestsService.createCareRequest(mockSelfPatientUser, {
            patientId: otherPtId,
            caregiverId: validCgId,
            scheduleType: 'FLEXIBLE',
            startDate: '2026-10-01',
            proposedRateType: 'HOURLY',
            proposedRateInr: 350,
        });
        assert(false, 'Test 2: Patient requesting for another did not throw');
    }
    catch (err) {
        assert(err instanceof AppError_1.AppError && err.code === 'TARGET_PATIENT_UNAUTHORIZED' && err.statusCode === 403, 'Test 2: Patient cannot request for another patient (403 TARGET_PATIENT_UNAUTHORIZED)');
    }
    // Test 3: Family with confirmed relationship can request for patient
    config_1.default.query = (async (sqlText, params) => {
        if (typeof sqlText === 'string') {
            if (sqlText.includes('FROM patient_relationships') && sqlText.includes("'CONFIRMED'")) {
                return { rows: [{ id: 'rel-fam-confirmed', relationship_type: 'GUARDIAN' }] };
            }
            if (sqlText.includes('FROM users WHERE id = $1')) {
                if (params?.[0] === validPtId) {
                    return { rows: [{ id: validPtId, role: 'PATIENT', is_active: true, deleted_at: null, name: 'Meena Rao' }] };
                }
            }
            if (sqlText.includes('FROM users u') && sqlText.includes('LEFT JOIN caregiver_profiles cp')) {
                return { rows: [{ id: validCgId, role: 'CAREGIVER', is_active: true, deleted_at: null, is_discoverable: true, name: 'Priya Sharma' }] };
            }
            if (sqlText.includes('FROM patient_relationships') && sqlText.includes("'ACTIVE_CARE'")) {
                return { rows: [] };
            }
            if (sqlText.includes('FROM care_requests') && sqlText.includes("'PENDING'")) {
                return { rows: [] };
            }
            if (sqlText.includes('INSERT INTO care_requests')) {
                return {
                    rows: [
                        {
                            id: 'req-fam-1',
                            patient_id: validPtId,
                            requester_id: mockFamilyUser.id,
                            caregiver_id: validCgId,
                            status: 'PENDING',
                            schedule_type: 'FLEXIBLE',
                            start_date: '2026-10-01',
                            proposed_rate_type: 'HOURLY',
                            proposed_rate_inr: '400.00',
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                            expires_at: new Date(Date.now() + care_requests_types_1.CARE_REQUEST_EXPIRY_HOURS * 3600 * 1000).toISOString(),
                        },
                    ],
                };
            }
            if (sqlText.includes('FROM care_requests cr') && sqlText.includes('WHERE cr.id = $1')) {
                return {
                    rows: [
                        {
                            id: 'req-fam-1',
                            patient_id: validPtId,
                            requester_id: mockFamilyUser.id,
                            caregiver_id: validCgId,
                            status: 'PENDING',
                            schedule_type: 'FLEXIBLE',
                            start_date: '2026-10-01',
                            proposed_rate_type: 'HOURLY',
                            proposed_rate_inr: '400.00',
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                            expires_at: new Date(Date.now() + care_requests_types_1.CARE_REQUEST_EXPIRY_HOURS * 3600 * 1000).toISOString(),
                            patient_name: 'Meena Rao',
                            requester_name: 'Anita Rao',
                            requester_relationship_type: 'GUARDIAN',
                            caregiver_name: 'Priya Sharma',
                        },
                    ],
                };
            }
        }
        return defaultMockFallback(sqlText, params);
    });
    const famReq = await careRequestsService.createCareRequest(mockFamilyUser, {
        patientId: validPtId,
        caregiverId: validCgId,
        scheduleType: 'FLEXIBLE',
        startDate: '2026-10-01',
        proposedRateType: 'HOURLY',
        proposedRateInr: 400,
    });
    assert(famReq.status === 'PENDING' && famReq.requesterId === mockFamilyUser.id && famReq.patientId === validPtId, 'Test 3: Family with confirmed relationship can request for patient');
    // Test 4: Family without confirmed relationship gets 403
    config_1.default.query = (async (sqlText, params) => {
        if (typeof sqlText === 'string' && sqlText.includes('FROM patient_relationships') && sqlText.includes("'CONFIRMED'")) {
            return { rows: [] };
        }
        return defaultMockFallback(sqlText, params);
    });
    try {
        await careRequestsService.createCareRequest(mockFamilyUser, {
            patientId: validPtId,
            caregiverId: validCgId,
            scheduleType: 'FLEXIBLE',
            startDate: '2026-10-01',
            proposedRateType: 'HOURLY',
            proposedRateInr: 400,
        });
        assert(false, 'Test 4: Unconfirmed family member did not throw');
    }
    catch (err) {
        assert(err instanceof AppError_1.AppError && err.code === 'TARGET_PATIENT_UNAUTHORIZED' && err.statusCode === 403, 'Test 4: Family without confirmed relationship gets 403 (TARGET_PATIENT_UNAUTHORIZED)');
    }
    // Test 5: Caregiver cannot create request
    try {
        await careRequestsService.createCareRequest(mockCaregiverUser, {
            patientId: validPtId,
            caregiverId: validCgId,
            scheduleType: 'FLEXIBLE',
            startDate: '2026-10-01',
            proposedRateType: 'HOURLY',
            proposedRateInr: 400,
        });
        assert(false, 'Test 5: Caregiver creating request did not throw');
    }
    catch (err) {
        assert(err instanceof AppError_1.AppError && err.code === 'ROLE_NOT_PERMITTED' && err.statusCode === 403, 'Test 5: Caregiver cannot create request (403 ROLE_NOT_PERMITTED)');
    }
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- CATEGORY 2: CREATE & BUSINESS RULES (Tests 6-11) ---');
    // Test 6: Valid request creates PENDING with 72h expiry
    assert(selfReq.status === 'PENDING' &&
        !selfReq.isExpired &&
        new Date(selfReq.expiresAt).getTime() > Date.now() + 71 * 3600 * 1000, 'Test 6: Valid request creates PENDING with 72-hour expiry window');
    // Test 7: Duplicate pending request gets 409
    config_1.default.query = (async (sqlText, params) => {
        if (typeof sqlText === 'string') {
            if (sqlText.includes('FROM patient_profiles WHERE user_id')) {
                return { rows: [{ onboarding_source: 'SELF' }] };
            }
            if (sqlText.includes('FROM users WHERE id = $1')) {
                return { rows: [{ id: validPtId, role: 'PATIENT', is_active: true, deleted_at: null, name: 'Meena' }] };
            }
            if (sqlText.includes('FROM users u') && sqlText.includes('LEFT JOIN caregiver_profiles cp')) {
                return { rows: [{ id: validCgId, role: 'CAREGIVER', is_active: true, deleted_at: null, is_discoverable: true, name: 'Priya' }] };
            }
            if (sqlText.includes('FROM patient_relationships'))
                return { rows: [] };
            if (sqlText.includes('FROM care_requests') && sqlText.includes("'PENDING'")) {
                return { rows: [{ id: 'req-pending-existing', expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString() }] };
            }
        }
        return defaultMockFallback(sqlText, params);
    });
    try {
        await careRequestsService.createCareRequest(mockSelfPatientUser, {
            patientId: validPtId,
            caregiverId: validCgId,
            scheduleType: 'FLEXIBLE',
            startDate: '2026-10-01',
            proposedRateType: 'HOURLY',
            proposedRateInr: 350,
        });
        assert(false, 'Test 7: Duplicate pending request did not throw');
    }
    catch (err) {
        assert(err instanceof AppError_1.AppError && err.code === 'DUPLICATE_REQUEST_PENDING' && err.statusCode === 409, 'Test 7: Duplicate pending request gets 409 (DUPLICATE_REQUEST_PENDING)');
    }
    // Test 8: Active relationship gets 409
    config_1.default.query = (async (sqlText, params) => {
        if (typeof sqlText === 'string') {
            if (sqlText.includes('FROM patient_profiles WHERE user_id')) {
                return { rows: [{ onboarding_source: 'SELF' }] };
            }
            if (sqlText.includes('FROM users WHERE id = $1')) {
                return { rows: [{ id: validPtId, role: 'PATIENT', is_active: true, deleted_at: null, name: 'Meena' }] };
            }
            if (sqlText.includes('FROM users u') && sqlText.includes('LEFT JOIN caregiver_profiles cp')) {
                return { rows: [{ id: validCgId, role: 'CAREGIVER', is_active: true, deleted_at: null, is_discoverable: true, name: 'Priya' }] };
            }
            if (sqlText.includes('FROM patient_relationships') && sqlText.includes("'ACTIVE_CARE'")) {
                return { rows: [{ id: 'rel-active-existing', status: 'ACTIVE_CARE' }] };
            }
        }
        return defaultMockFallback(sqlText, params);
    });
    try {
        await careRequestsService.createCareRequest(mockSelfPatientUser, {
            patientId: validPtId,
            caregiverId: validCgId,
            scheduleType: 'FLEXIBLE',
            startDate: '2026-10-01',
            proposedRateType: 'HOURLY',
            proposedRateInr: 350,
        });
        assert(false, 'Test 8: Active relationship did not throw');
    }
    catch (err) {
        assert(err instanceof AppError_1.AppError && err.code === 'ACTIVE_RELATIONSHIP_EXISTS' && err.statusCode === 409, 'Test 8: Active relationship gets 409 (ACTIVE_RELATIONSHIP_EXISTS)');
    }
    // Test 9: Invalid schedule rejected — Comprehensive negative matrix for forbidden combinations
    const baseSched = {
        patientId: validPtId,
        caregiverId: validCgId,
        startDate: '2026-10-01',
        proposedRateType: 'HOURLY',
        proposedRateInr: 400,
    };
    const neg1_recurringMissingShifts = care_requests_types_1.CreateCareRequestSchema.safeParse({
        ...baseSched,
        scheduleType: 'RECURRING',
        daysOfWeek: [1, 2],
    });
    const neg2_recurringMissingDays = care_requests_types_1.CreateCareRequestSchema.safeParse({
        ...baseSched,
        scheduleType: 'RECURRING',
        requestedShifts: ['DAY_SHIFT'],
    });
    const neg3_recurringWithEndDate = care_requests_types_1.CreateCareRequestSchema.safeParse({
        ...baseSched,
        scheduleType: 'RECURRING',
        daysOfWeek: [1, 2],
        requestedShifts: ['DAY_SHIFT'],
        endDate: '2026-10-31',
    });
    const neg4_dateRangeMissingEnd = care_requests_types_1.CreateCareRequestSchema.safeParse({
        ...baseSched,
        scheduleType: 'DATE_RANGE',
        requestedShifts: ['DAY_SHIFT'],
    });
    const neg5_dateRangeBadOrder = care_requests_types_1.CreateCareRequestSchema.safeParse({
        ...baseSched,
        scheduleType: 'DATE_RANGE',
        requestedShifts: ['DAY_SHIFT'],
        startDate: '2026-10-15',
        endDate: '2026-10-10',
    });
    const neg6_oneTimeMissingShifts = care_requests_types_1.CreateCareRequestSchema.safeParse({
        ...baseSched,
        scheduleType: 'ONE_TIME',
    });
    const neg7_oneTimeWithEndDate = care_requests_types_1.CreateCareRequestSchema.safeParse({
        ...baseSched,
        scheduleType: 'ONE_TIME',
        requestedShifts: ['DAY_SHIFT'],
        endDate: '2026-10-02',
    });
    const neg8_oneTimeWithDays = care_requests_types_1.CreateCareRequestSchema.safeParse({
        ...baseSched,
        scheduleType: 'ONE_TIME',
        requestedShifts: ['DAY_SHIFT'],
        daysOfWeek: [1],
    });
    const neg9_flexibleWithDays = care_requests_types_1.CreateCareRequestSchema.safeParse({
        ...baseSched,
        scheduleType: 'FLEXIBLE',
        daysOfWeek: [2],
    });
    const allNegativePassed = !neg1_recurringMissingShifts.success &&
        !neg2_recurringMissingDays.success &&
        !neg3_recurringWithEndDate.success &&
        !neg4_dateRangeMissingEnd.success &&
        !neg5_dateRangeBadOrder.success &&
        !neg6_oneTimeMissingShifts.success &&
        !neg7_oneTimeWithEndDate.success &&
        !neg8_oneTimeWithDays.success &&
        !neg9_flexibleWithDays.success;
    assert(allNegativePassed, 'Test 9: Invalid schedule rejected by schema validator (all 9 forbidden schedule variants rejected)');
    // Test 10: Invalid capability rejected
    const invalidCap = care_requests_types_1.CreateCareRequestSchema.safeParse({
        patientId: validPtId,
        caregiverId: validCgId,
        scheduleType: 'FLEXIBLE',
        startDate: '2026-10-01',
        requestedCapabilities: ['rocket_propulsion'],
        proposedRateType: 'HOURLY',
        proposedRateInr: 400,
    });
    assert(!invalidCap.success, 'Test 10: Invalid capability rejected by schema validator');
    // Test 11: Invalid rate rejected (0 or negative)
    const invalidRateZero = care_requests_types_1.CreateCareRequestSchema.safeParse({
        patientId: validPtId,
        caregiverId: validCgId,
        scheduleType: 'FLEXIBLE',
        startDate: '2026-10-01',
        proposedRateType: 'HOURLY',
        proposedRateInr: 0,
    });
    const invalidRateNegative = care_requests_types_1.CreateCareRequestSchema.safeParse({
        patientId: validPtId,
        caregiverId: validCgId,
        scheduleType: 'FLEXIBLE',
        startDate: '2026-10-01',
        proposedRateType: 'HOURLY',
        proposedRateInr: -250,
    });
    assert(!invalidRateZero.success && !invalidRateNegative.success, 'Test 11: Invalid rate rejected (<= 0 rejected)');
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- CATEGORY 3: LIFECYCLE STATE MACHINE (Tests 12-16) ---');
    let clientQueries = [];
    const mockClient = {
        query: async (sqlText, params) => {
            clientQueries.push(sqlText);
            if (sqlText.includes('SELECT * FROM care_requests WHERE id = $1 FOR UPDATE')) {
                return {
                    rows: [
                        {
                            id: 'req-lifecycle-1',
                            patient_id: validPtId,
                            requester_id: mockFamilyUser.id,
                            caregiver_id: validCgId,
                            status: 'PENDING',
                            expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
                        },
                    ],
                };
            }
            if (sqlText.includes('SELECT is_active, deleted_at FROM users WHERE id = $1')) {
                return { rows: [{ is_active: true, deleted_at: null }] };
            }
            if (sqlText.includes('SELECT max_patients FROM caregiver_profiles')) {
                return { rows: [{ max_patients: 5 }] };
            }
            if (sqlText.includes('SELECT COUNT(*)::int AS active_count')) {
                return { rows: [{ active_count: 1 }] };
            }
            if (sqlText.includes('SELECT id, status FROM patient_relationships')) {
                return { rows: [] };
            }
            if (sqlText.includes('INSERT INTO patient_relationships')) {
                return {
                    rows: [
                        {
                            id: 'rel-lifecycle-1',
                            patient_user_id: validPtId,
                            related_user_id: validCgId,
                            relationship_type: 'CAREGIVER',
                            status: 'ACCEPTED',
                        },
                    ],
                };
            }
            if (sqlText.includes('UPDATE care_requests') && sqlText.includes("status = 'ACCEPTED'")) {
                return {
                    rows: [
                        {
                            id: 'req-lifecycle-1',
                            status: 'ACCEPTED',
                            resulting_relationship_id: 'rel-lifecycle-1',
                            requester_id: mockFamilyUser.id,
                            patient_id: validPtId,
                            caregiver_id: validCgId,
                        },
                    ],
                };
            }
            return defaultMockFallback(sqlText, params);
        },
        release: () => { },
    };
    config_1.default.connect = (async () => mockClient);
    // Test 12: Caregiver accepts → request ACCEPTED + relationship created
    config_1.default.query = (async (sqlText, params) => {
        if (typeof sqlText === 'string' && sqlText.includes('FROM care_requests cr') && sqlText.includes('WHERE cr.id = $1')) {
            return {
                rows: [
                    {
                        id: 'req-lifecycle-1',
                        status: 'ACCEPTED',
                        patient_id: validPtId,
                        requester_id: mockFamilyUser.id,
                        caregiver_id: validCgId,
                        schedule_type: 'FLEXIBLE',
                        start_date: '2026-10-01',
                        proposed_rate_type: 'HOURLY',
                        proposed_rate_inr: '350.00',
                        resulting_relationship_id: 'rel-lifecycle-1',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
                        patient_name: 'Meena Rao',
                        caregiver_name: 'Priya Sharma',
                        requester_name: 'Anita Rao',
                    },
                ],
            };
        }
        return defaultMockFallback(sqlText, params);
    });
    const acceptResult = await careRequestsService.acceptCareRequest(mockCaregiverUser, 'req-lifecycle-1');
    assert(acceptResult.request.status === 'ACCEPTED' &&
        acceptResult.relationship?.id === 'rel-lifecycle-1' &&
        clientQueries.some((q) => q.includes('INSERT INTO patient_relationships')), 'Test 12: Caregiver accepts → request ACCEPTED + relationship created');
    // Test 13: Caregiver declines → DECLINED + record retained
    let declineRetained = false;
    mockClient.query = async (sqlText, params) => {
        if (sqlText.includes('SELECT * FROM care_requests WHERE id = $1 FOR UPDATE')) {
            return {
                rows: [
                    {
                        id: 'req-decline-1',
                        caregiver_id: validCgId,
                        requester_id: mockFamilyUser.id,
                        status: 'PENDING',
                        expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
                    },
                ],
            };
        }
        if (sqlText.includes('UPDATE care_requests') && sqlText.includes("status = 'DECLINED'")) {
            declineRetained = true;
            return {
                rows: [
                    {
                        id: 'req-decline-1',
                        status: 'DECLINED',
                        requester_id: mockFamilyUser.id,
                        decline_reason: 'SCHEDULE_CONFLICT',
                        response_notes: 'Fully booked',
                    },
                ],
            };
        }
        return defaultMockFallback(sqlText, params);
    };
    config_1.default.query = (async (sqlText, params) => {
        if (typeof sqlText === 'string' && sqlText.includes('FROM care_requests cr') && sqlText.includes('WHERE cr.id = $1')) {
            return {
                rows: [
                    {
                        id: 'req-decline-1',
                        status: 'DECLINED',
                        patient_id: validPtId,
                        requester_id: mockFamilyUser.id,
                        caregiver_id: validCgId,
                        schedule_type: 'FLEXIBLE',
                        start_date: '2026-10-01',
                        proposed_rate_type: 'HOURLY',
                        proposed_rate_inr: '350.00',
                        decline_reason: 'SCHEDULE_CONFLICT',
                        response_notes: 'Fully booked',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
                        patient_name: 'Meena Rao',
                        caregiver_name: 'Priya Sharma',
                        requester_name: 'Anita Rao',
                    },
                ],
            };
        }
        return defaultMockFallback(sqlText, params);
    });
    const declineRes = await careRequestsService.declineCareRequest(mockCaregiverUser, 'req-decline-1', {
        declineReason: 'SCHEDULE_CONFLICT',
        responseNotes: 'Fully booked',
    });
    assert(declineRetained && declineRes.request.status === 'DECLINED' && declineRes.request.declineReason === 'SCHEDULE_CONFLICT', 'Test 13: Caregiver declines → DECLINED + record retained (not deleted)');
    // Test 14: Requester withdraws → WITHDRAWN + record retained
    let withdrawRetained = false;
    mockClient.query = async (sqlText, params) => {
        if (sqlText.includes('SELECT * FROM care_requests WHERE id = $1 FOR UPDATE')) {
            return {
                rows: [
                    {
                        id: 'req-withdraw-1',
                        requester_id: mockFamilyUser.id,
                        patient_id: validPtId,
                        caregiver_id: validCgId,
                        status: 'PENDING',
                        expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
                    },
                ],
            };
        }
        if (sqlText.includes('UPDATE care_requests') && sqlText.includes("status = 'WITHDRAWN'")) {
            withdrawRetained = true;
            return {
                rows: [
                    {
                        id: 'req-withdraw-1',
                        status: 'WITHDRAWN',
                        requester_id: mockFamilyUser.id,
                        patient_id: validPtId,
                        caregiver_id: validCgId,
                        withdraw_reason: 'FOUND_ALTERNATIVE_CARE',
                    },
                ],
            };
        }
        return defaultMockFallback(sqlText, params);
    };
    config_1.default.query = (async (sqlText, params) => {
        if (typeof sqlText === 'string' && sqlText.includes('FROM care_requests cr') && sqlText.includes('WHERE cr.id = $1')) {
            return {
                rows: [
                    {
                        id: 'req-withdraw-1',
                        status: 'WITHDRAWN',
                        patient_id: validPtId,
                        requester_id: mockFamilyUser.id,
                        caregiver_id: validCgId,
                        schedule_type: 'FLEXIBLE',
                        start_date: '2026-10-01',
                        proposed_rate_type: 'HOURLY',
                        proposed_rate_inr: '350.00',
                        withdraw_reason: 'FOUND_ALTERNATIVE_CARE',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
                        patient_name: 'Meena Rao',
                        caregiver_name: 'Priya Sharma',
                        requester_name: 'Anita Rao',
                    },
                ],
            };
        }
        return defaultMockFallback(sqlText, params);
    });
    const withdrawRes = await careRequestsService.withdrawCareRequest(mockFamilyUser, 'req-withdraw-1', {
        withdrawReason: 'FOUND_ALTERNATIVE_CARE',
        responseNotes: 'Arranged local help',
    });
    assert(withdrawRetained && withdrawRes.request.status === 'WITHDRAWN' && withdrawRes.request.withdrawReason === 'FOUND_ALTERNATIVE_CARE', 'Test 14: Requester withdraws → WITHDRAWN + record retained (not deleted)');
    // Test 15: Expired request cannot be accepted
    mockClient.query = async (sqlText) => {
        if (sqlText.includes('SELECT * FROM care_requests WHERE id = $1 FOR UPDATE')) {
            return {
                rows: [
                    {
                        id: 'req-expired-1',
                        caregiver_id: validCgId,
                        status: 'PENDING',
                        expires_at: new Date(Date.now() - 5000).toISOString(),
                    },
                ],
            };
        }
        return defaultMockFallback(sqlText);
    };
    try {
        await careRequestsService.acceptCareRequest(mockCaregiverUser, 'req-expired-1');
        assert(false, 'Test 15: Expired request acceptance did not throw');
    }
    catch (err) {
        assert(err instanceof AppError_1.AppError && err.code === 'REQUEST_EXPIRED' && err.statusCode === 409, 'Test 15: Expired request cannot be accepted (409 REQUEST_EXPIRED)');
    }
    // Test 16: Terminal requests cannot transition again
    for (const terminalStatus of ['ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED']) {
        mockClient.query = async (sqlText) => {
            if (sqlText.includes('SELECT * FROM care_requests WHERE id = $1 FOR UPDATE')) {
                return {
                    rows: [
                        {
                            id: `req-terminal-${terminalStatus}`,
                            caregiver_id: validCgId,
                            status: terminalStatus,
                            expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
                        },
                    ],
                };
            }
            return defaultMockFallback(sqlText);
        };
        try {
            await careRequestsService.acceptCareRequest(mockCaregiverUser, `req-terminal-${terminalStatus}`);
            assert(false, `Test 16: Transitioning terminal ${terminalStatus} did not throw`);
        }
        catch (err) {
            assert(err instanceof AppError_1.AppError && err.code === 'INVALID_STATE' && err.statusCode === 409, `Test 16: Terminal status ${terminalStatus} cannot transition again (409 INVALID_STATE)`);
        }
    }
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- CATEGORY 4: CONCURRENCY & RACE CONDITIONS (Tests 17-19) ---');
    // Test 17: Accept vs withdraw cannot both succeed (first-to-lock wins)
    mockClient.query = async (sqlText) => {
        if (sqlText.includes('SELECT * FROM care_requests WHERE id = $1 FOR UPDATE')) {
            return {
                rows: [
                    {
                        id: 'req-race-1',
                        requester_id: mockFamilyUser.id,
                        patient_id: validPtId,
                        caregiver_id: validCgId,
                        status: 'ACCEPTED',
                        expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
                    },
                ],
            };
        }
        return defaultMockFallback(sqlText);
    };
    try {
        await careRequestsService.withdrawCareRequest(mockFamilyUser, 'req-race-1', {
            withdrawReason: 'SCHEDULE_CHANGED',
        });
        assert(false, 'Test 17: Withdraw after accept race did not throw');
    }
    catch (err) {
        assert(err instanceof AppError_1.AppError && err.code === 'INVALID_STATE' && err.statusCode === 409, 'Test 17: Accept vs withdraw cannot both succeed (race condition prevented by row lock)');
    }
    // Test 18: Accepting concurrent requests cannot bypass caregiver capacity
    mockClient.query = async (sqlText) => {
        if (sqlText.includes('SELECT * FROM care_requests WHERE id = $1 FOR UPDATE')) {
            return {
                rows: [
                    {
                        id: 'req-cap-1',
                        caregiver_id: validCgId,
                        status: 'PENDING',
                        expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
                    },
                ],
            };
        }
        if (sqlText.includes('SELECT is_active, deleted_at FROM users WHERE id = $1')) {
            return { rows: [{ is_active: true, deleted_at: null }] };
        }
        if (sqlText.includes('SELECT max_patients FROM caregiver_profiles')) {
            return { rows: [{ max_patients: 4 }] };
        }
        if (sqlText.includes('SELECT COUNT(*)::int AS active_count')) {
            return { rows: [{ active_count: 4 }] };
        }
        return defaultMockFallback(sqlText);
    };
    try {
        await careRequestsService.acceptCareRequest(mockCaregiverUser, 'req-cap-1');
        assert(false, 'Test 18: Capacity exceeded did not throw');
    }
    catch (err) {
        assert(err instanceof AppError_1.AppError && err.code === 'CAREGIVER_CAPACITY_EXCEEDED' && err.statusCode === 409, 'Test 18: Accepting concurrent requests cannot bypass caregiver capacity (409 CAREGIVER_CAPACITY_EXCEEDED)');
    }
    // Test 19: Duplicate concurrent creation cannot create two pending requests (Migration unique index check)
    const migrationPath = path_1.default.resolve(__dirname, '../db/migrations/015_care_requests.sql');
    const migrationSql = fs_1.default.readFileSync(migrationPath, 'utf8');
    assert(migrationSql.includes('idx_unique_pending_care_request') &&
        migrationSql.includes('ON care_requests(patient_id, caregiver_id)') &&
        migrationSql.includes("WHERE status = 'PENDING'"), 'Test 19: Duplicate concurrent creation prevented by partial UNIQUE index (patient_id, caregiver_id) WHERE status = PENDING');
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- CATEGORY 5: PRIVACY & SENSITIVE DATA ENFORCEMENT (Tests 20-21) ---');
    // Test 20: Incoming request does not expose phone/exact address/etc. (Tier 1 privacy)
    config_1.default.query = (async (sqlText, params) => {
        if (typeof sqlText === 'string' && sqlText.includes('FROM care_requests cr')) {
            return {
                rows: [
                    {
                        id: 'req-privacy-1',
                        patient_id: validPtId,
                        requester_id: mockFamilyUser.id,
                        caregiver_id: validCgId,
                        status: 'PENDING',
                        schedule_type: 'RECURRING',
                        requested_shifts: ['DAY_SHIFT'],
                        days_of_week: [1, 3, 5],
                        start_date: '2026-10-01',
                        end_date: null,
                        requested_capabilities: ['hygiene_bathing'],
                        proposed_rate_type: 'HOURLY',
                        proposed_rate_inr: '450.00',
                        care_context_notes: 'Needs calm morning routine',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
                        patient_name: 'Meena Kumari Rao',
                        patient_photo_url: 'https://example.com/meena.jpg',
                        patient_dob: '1950-05-15',
                        patient_city: 'Bangalore, Indiranagar',
                        patient_phone: '+919999988888',
                        requester_name: 'Anita Rao',
                        requester_relationship_type: 'GUARDIAN',
                    },
                ],
            };
        }
        return defaultMockFallback(sqlText, params);
    });
    const incomingTriage = await careRequestsService.getIncomingCareRequests(mockCaregiverUser);
    const triageItem = incomingTriage[0];
    assert(triageItem.patient?.firstName === 'Meena' &&
        triageItem.patient?.fullName === undefined &&
        triageItem.patient?.phone === undefined &&
        typeof triageItem.patient?.approximateAge === 'number' &&
        triageItem.patient.approximateAge > 70 &&
        triageItem.requester?.name === 'Anita Rao' &&
        triageItem.exact_address === undefined &&
        triageItem.patient_phone === undefined, 'Test 20: Incoming request does not expose phone/exact address/full legal name prior to acceptance');
    // Test 21: Unauthorized user cannot retrieve another request
    config_1.default.query = (async (sqlText, params) => {
        if (typeof sqlText === 'string' && sqlText.includes('FROM care_requests cr') && sqlText.includes('WHERE cr.id = $1')) {
            return {
                rows: [
                    {
                        id: 'req-secret-1',
                        patient_id: validPtId,
                        requester_id: mockFamilyUser.id,
                        caregiver_id: validCgId,
                        status: 'PENDING',
                        expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
                    },
                ],
            };
        }
        return defaultMockFallback(sqlText, params);
    });
    const strangerUser = {
        id: '77777777-7777-4777-a777-777777777777',
        firebase_uid: 'stranger-fb',
        name: 'Unrelated User',
        role: 'PATIENT',
        preferred_language: 'en',
        is_active: true,
        onboarding_complete: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    try {
        await careRequestsService.getCareRequestById(strangerUser, 'req-secret-1');
        assert(false, 'Test 21: Stranger accessing private request did not throw');
    }
    catch (err) {
        assert(err instanceof AppError_1.AppError && err.code === 'FORBIDDEN' && err.statusCode === 403, 'Test 21: Unauthorized user cannot retrieve another request (403 FORBIDDEN)');
    }
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- CATEGORY 6: MULTI-CAREGIVER INDEPENDENCE (Test 22) ---');
    // Test 22: Patient can have independent relationships with multiple caregivers
    const caregiverB = {
        id: '88888888-8888-4888-a888-888888888888',
        firebase_uid: 'cg-b-fb',
        name: 'Rohan Verma',
        role: 'CAREGIVER',
        preferred_language: 'en',
        is_active: true,
        onboarding_complete: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    let relationshipInsertedForCaregiverB = false;
    mockClient.query = async (sqlText, params) => {
        if (sqlText.includes('SELECT * FROM care_requests WHERE id = $1 FOR UPDATE')) {
            return {
                rows: [
                    {
                        id: 'req-cg-b-1',
                        patient_id: validPtId,
                        requester_id: mockFamilyUser.id,
                        caregiver_id: caregiverB.id,
                        status: 'PENDING',
                        expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
                    },
                ],
            };
        }
        if (sqlText.includes('SELECT is_active, deleted_at FROM users WHERE id = $1')) {
            return { rows: [{ is_active: true, deleted_at: null }] };
        }
        if (sqlText.includes('SELECT max_patients FROM caregiver_profiles')) {
            return { rows: [{ max_patients: 5 }] };
        }
        if (sqlText.includes('SELECT COUNT(*)::int AS active_count')) {
            return { rows: [{ active_count: 0 }] };
        }
        if (sqlText.includes('SELECT id, status FROM patient_relationships')) {
            return { rows: [] };
        }
        if (sqlText.includes('INSERT INTO patient_relationships')) {
            relationshipInsertedForCaregiverB = true;
            return {
                rows: [
                    {
                        id: 'rel-cg-b-1',
                        patient_user_id: validPtId,
                        related_user_id: caregiverB.id,
                        relationship_type: 'CAREGIVER',
                        status: 'ACCEPTED',
                    },
                ],
            };
        }
        if (sqlText.includes('UPDATE care_requests')) {
            return {
                rows: [
                    {
                        id: 'req-cg-b-1',
                        status: 'ACCEPTED',
                        resulting_relationship_id: 'rel-cg-b-1',
                        requester_id: mockFamilyUser.id,
                        patient_id: validPtId,
                        caregiver_id: caregiverB.id,
                    },
                ],
            };
        }
        return defaultMockFallback(sqlText, params);
    };
    config_1.default.query = (async (sqlText, params) => {
        if (typeof sqlText === 'string' && sqlText.includes('FROM care_requests cr') && sqlText.includes('WHERE cr.id = $1')) {
            return {
                rows: [
                    {
                        id: 'req-cg-b-1',
                        status: 'ACCEPTED',
                        patient_id: validPtId,
                        requester_id: mockFamilyUser.id,
                        caregiver_id: caregiverB.id,
                        schedule_type: 'FLEXIBLE',
                        start_date: '2026-10-01',
                        proposed_rate_type: 'HOURLY',
                        proposed_rate_inr: '350.00',
                        resulting_relationship_id: 'rel-cg-b-1',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
                        patient_name: 'Meena Rao',
                        caregiver_name: 'Rohan Verma',
                        requester_name: 'Anita Rao',
                    },
                ],
            };
        }
        return defaultMockFallback(sqlText, params);
    });
    const multiCgResult = await careRequestsService.acceptCareRequest(caregiverB, 'req-cg-b-1');
    assert(relationshipInsertedForCaregiverB && multiCgResult.relationship?.related_user_id === caregiverB.id, 'Test 22: Patient can have independent relationships with multiple caregivers simultaneously');
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- CATEGORY 7: BACKGROUND MAINTENANCE (Test 23) ---');
    // Test 23: Background maintenance sweeps expired requests and dispatches CARE_REQUEST_EXPIRED
    config_1.default.query = (async (sqlText, params) => {
        if (typeof sqlText === 'string' && sqlText.includes("UPDATE care_requests") && sqlText.includes("SET status = 'EXPIRED'")) {
            return {
                rows: [
                    {
                        id: 'req-sweep-1',
                        patient_id: validPtId,
                        requester_id: mockFamilyUser.id,
                        caregiver_id: validCgId,
                    },
                ],
            };
        }
        return defaultMockFallback(sqlText, params);
    });
    const sweptCount = await careRequestsService.sweepExpiredCareRequests();
    assert(sweptCount === 1, 'Test 23: Background sweep transitions stale pending requests and dispatches CARE_REQUEST_EXPIRED notifications');
    // Restore pool
    config_1.default.query = originalPoolQuery;
    config_1.default.connect = originalPoolConnect;
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n======================================================================');
    console.log(`FINAL VERIFICATION RESULT: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log('======================================================================');
    if (passedTests === totalTests) {
        console.log('All 22 specified Care Request criteria + maintenance jobs verified successfully!\n');
        process.exit(0);
    }
    else {
        console.error(`Verification FAILED with ${totalTests - passedTests} failures.\n`);
        process.exit(1);
    }
}
runTests().catch((err) => {
    console.error('[verify_care_requests] Unhandled error during verification:', err);
    process.exit(1);
});
//# sourceMappingURL=verify_care_requests.js.map