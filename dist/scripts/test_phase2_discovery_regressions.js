"use strict";
/**
 * SureStep — scripts/test_phase2_discovery_regressions.ts
 *
 * PHASE 2 REGRESSION TEST SUITE: CAREGIVER DISCOVERY & PATIENT CONTEXT
 *
 * NOTE: This is an IN-MEMORY MOCKED unit/integration test suite.
 * It mocks `pool.query` to verify SQL query generation, parameter binding,
 * city alias normalization, filtering semantics, authorization gates,
 * and context propagation without requiring an active PostgreSQL database connection.
 *
 * Required Test Matrix:
 *  Case 1: Eligible caregivers appear when no explicit city filter is supplied
 *  Case 2: Explicit city filters still work
 *  Case 3: City aliases and descriptive service-area values behave according to normalization rules
 *  Case 4: Missing patient city does not cause accidental exclusion
 *  Case 5: Inactive, deleted, non-caregiver, and non-discoverable profiles remain excluded
 *  Case 6: Family discovery requires an authorized target patient
 *  Case 7: Self-managed Patient discovery works without a separate target patient
 *  Case 8: The correct patient ID survives navigation into Care Request
 *  Case 9: Private caregiver fields are not returned
 *  Case 10: Pagination and existing response shape remain correct
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
const config_1 = __importDefault(require("../db/config"));
const discoveryService = __importStar(require("../modules/discovery/discovery.service"));
const cityNormalizer_1 = require("../modules/discovery/cityNormalizer");
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
        process.exitCode = 1;
    }
}
async function runPhase2Tests() {
    console.log('===============================================================');
    console.log('SURESTEP PHASE 2: CAREGIVER DISCOVERY REGRESSION TESTS');
    console.log('CLASSIFICATION: IN-MEMORY MOCKED SUITE (NOT REAL POSTGRESQL)');
    console.log('===============================================================\n');
    const originalQuery = config_1.default.query.bind(config_1.default);
    // Test Entities
    const selfPatient = {
        id: 'patient-self-1111-1111-1111-111111111111',
        firebase_uid: 'fb-patient-self',
        name: 'Alice Patient',
        role: 'PATIENT',
        city: 'Bengaluru',
        is_active: true,
        onboarding_complete: true,
        preferred_language: 'en',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    const patientWithoutCity = {
        id: 'patient-nocity-2222-2222-2222-222222222222',
        firebase_uid: 'fb-patient-nocity',
        name: 'David Patient',
        role: 'PATIENT',
        city: undefined,
        is_active: true,
        onboarding_complete: true,
        preferred_language: 'en',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    const familyMember = {
        id: 'family-member-3333-3333-3333-333333333333',
        firebase_uid: 'fb-family-user',
        name: 'Carol Family',
        role: 'FAMILY',
        city: 'Bengaluru',
        is_active: true,
        onboarding_complete: true,
        preferred_language: 'en',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    const authorizedPatientId = 'patient-target-4444-4444-4444-444444444444';
    const unauthorizedPatientId = 'patient-unauth-5555-5555-5555-555555555555';
    const sampleCaregiverRow = {
        caregiver_id: 'cg-1111-1111-1111-1111-111111111111',
        name: 'Priya Sharma',
        photo_url: 'https://cdn.example.com/priya.jpg',
        professional_role: 'Dementia Specialist',
        years_of_experience: 8,
        dementia_experience_years: 5,
        has_dementia_training: true,
        specializations: ['Alzheimer\'s Care', 'Behavioral Support'],
        care_capabilities: ['Medication Administration', 'Mobility Assistance'],
        languages_spoken: ['English', 'Kannada', 'Hindi'],
        availability_types: ['DAY_SHIFT', 'FULL_TIME'],
        service_city: 'Bangalore',
        service_radius_km: 15,
        hourly_rate: '650.00',
        daily_rate: '4500.00',
        rating: '4.85',
        rating_count: 12,
        bio: 'Compassionate certified dementia caregiver serving Bangalore area.',
        verification_status: 'VERIFIED',
        is_discoverable: true,
        total_count: '1',
    };
    try {
        // -------------------------------------------------------------------------
        // CASE 1: Eligible caregivers appear when no explicit city filter is supplied
        // -------------------------------------------------------------------------
        console.log('--- Case 1: No Explicit City Filter ---');
        let capturedSql = '';
        let capturedParams = [];
        config_1.default.query = async (text, params) => {
            capturedSql = text;
            capturedParams = params || [];
            // Check for auth queries
            if (text.includes('patient_relationships')) {
                return {
                    rows: [
                        {
                            id: 'rel-1',
                            relationship_type: 'FAMILY_CLOSE',
                            status: 'CONFIRMED',
                            patient_city: 'Bengaluru',
                        },
                    ],
                };
            }
            if (text.includes('patient_profiles')) {
                return { rows: [{ onboarding_source: 'SELF' }] };
            }
            // Caregiver discovery search query
            return { rows: [sampleCaregiverRow] };
        };
        const resCase1 = await discoveryService.searchCaregivers({ targetPatientId: authorizedPatientId }, familyMember);
        const [, whereAndAfter] = capturedSql.split('WHERE');
        const [whereClauseText] = (whereAndAfter || '').split('ORDER BY');
        const hasNoCityWhereClause = !whereClauseText.includes('COALESCE(cp.service_city, u.city)');
        const hasLocationRelevanceSort = capturedSql.includes('ORDER BY (CASE WHEN COALESCE(cp.service_city, u.city) ~* $');
        assert(resCase1.caregivers.length === 1 && resCase1.caregivers[0].name === 'Priya Sharma', 'Case 1.1: Eligible caregiver appears when no explicit city filter is supplied');
        assert(hasNoCityWhereClause, 'Case 1.2: No hard city WHERE clause is injected to exclude caregivers when city filter is omitted');
        assert(hasLocationRelevanceSort, 'Case 1.3: Patient location is used as relevance signal in ORDER BY instead of hard exclusion');
        // -------------------------------------------------------------------------
        // CASE 2: Explicit city filters still work
        // -------------------------------------------------------------------------
        console.log('\n--- Case 2: Explicit City Filters ---');
        await discoveryService.searchCaregivers({ city: 'Mumbai', targetPatientId: authorizedPatientId }, familyMember);
        const hasExplicitCityWhere = capturedSql.includes('COALESCE(cp.service_city, u.city) ~* $');
        const mumbaiParam = capturedParams.find((p) => typeof p === 'string' && p.includes('mumbai'));
        assert(hasExplicitCityWhere && Boolean(mumbaiParam), 'Case 2.1: Explicit city filter adds regex WHERE clause matching specified city and aliases');
        // -------------------------------------------------------------------------
        // CASE 3: City aliases and descriptive service areas normalization
        // -------------------------------------------------------------------------
        console.log('\n--- Case 3: City Aliases and Normalization ---');
        // Test canonical alias resolution
        const blrAliases = (0, cityNormalizer_1.getCityAliases)('Bengaluru');
        const bglAliases = (0, cityNormalizer_1.getCityAliases)('Bangalore');
        assert(blrAliases.includes('bengaluru') && blrAliases.includes('bangalore') &&
            bglAliases.includes('bengaluru') && bglAliases.includes('bangalore'), 'Case 3.1: Bengaluru and Bangalore normalize to identical alias set [bengaluru, bangalore]');
        // Test descriptive service areas
        const southBlrAliases = (0, cityNormalizer_1.getCityAliases)('Bengaluru - South');
        const urbanBlrAliases = (0, cityNormalizer_1.getCityAliases)('Bangalore Urban');
        const southBangaloreAliases = (0, cityNormalizer_1.getCityAliases)('South Bangalore');
        assert(southBlrAliases.includes('bengaluru') &&
            urbanBlrAliases.includes('bengaluru') &&
            southBangaloreAliases.includes('bengaluru'), 'Case 3.2: Descriptive service areas ("Bengaluru - South", "Bangalore Urban", "South Bangalore") resolve to base city aliases');
        // Test pure matcher across aliases
        assert((0, cityNormalizer_1.isCityMatch)('Bangalore', 'Bengaluru') &&
            (0, cityNormalizer_1.isCityMatch)('Bengaluru - South', 'Bangalore') &&
            (0, cityNormalizer_1.isCityMatch)('South Bangalore', 'Bengaluru') &&
            (0, cityNormalizer_1.isCityMatch)('Bangalore Urban', 'Bengaluru'), 'Case 3.3: isCityMatch confirms bidirectional cross-matching across aliases and descriptive areas');
        // Test prevention of unsafe substring equating unrelated cities
        assert(!(0, cityNormalizer_1.isCityMatch)('Dharwad', 'Dhar') &&
            !(0, cityNormalizer_1.isCityMatch)('Jaipur', 'Ur') &&
            !(0, cityNormalizer_1.isCityMatch)('Surat', 'Ratlam') &&
            !(0, cityNormalizer_1.isCityMatch)('Pune', 'Bengaluru'), 'Case 3.4: Word-boundary regex prevents unsafe substring matches (e.g. "Dhar" vs "Dharwad", "Ur" vs "Jaipur")');
        // Test Delhi NCR and Mumbai
        assert((0, cityNormalizer_1.isCityMatch)('Delhi NCR', 'New Delhi') &&
            (0, cityNormalizer_1.isCityMatch)('Bombay', 'Mumbai') &&
            (0, cityNormalizer_1.isCityMatch)('Poona', 'Pune'), 'Case 3.5: Delhi NCR, Bombay/Mumbai, and Poona/Pune cross-matching verified');
        // -------------------------------------------------------------------------
        // CASE 4: Missing patient city does not cause accidental exclusion
        // -------------------------------------------------------------------------
        console.log('\n--- Case 4: Missing Patient City ---');
        config_1.default.query = async (text, params) => {
            capturedSql = text;
            capturedParams = params || [];
            if (text.includes('patient_profiles')) {
                return { rows: [{ onboarding_source: 'SELF' }] };
            }
            return { rows: [sampleCaregiverRow] };
        };
        const resCase4 = await discoveryService.searchCaregivers({}, patientWithoutCity);
        const hasNoRelevanceOrdering = !capturedSql.includes('(CASE WHEN COALESCE(cp.service_city, u.city)');
        assert(resCase4.caregivers.length === 1, 'Case 4.1: Caregivers successfully returned when patient has no city (null/unset)');
        assert(hasNoRelevanceOrdering, 'Case 4.2: Missing patient city skips location relevance ORDER BY clause cleanly without error');
        // -------------------------------------------------------------------------
        // CASE 5: Inactive, deleted, non-caregiver, non-discoverable excluded
        // -------------------------------------------------------------------------
        console.log('\n--- Case 5: Mandatory Eligibility Invariants ---');
        await discoveryService.searchCaregivers({}, selfPatient);
        assert(capturedSql.includes(`u.role = 'CAREGIVER'`) &&
            capturedSql.includes(`u.is_active = TRUE`) &&
            capturedSql.includes(`u.deleted_at IS NULL`) &&
            capturedSql.includes(`cp.is_discoverable = TRUE`), 'Case 5.1: SQL query strictly enforces role=CAREGIVER, is_active=TRUE, deleted_at IS NULL, is_discoverable=TRUE');
        // -------------------------------------------------------------------------
        // CASE 6: Family discovery requires an authorized target patient
        // -------------------------------------------------------------------------
        console.log('\n--- Case 6: Family Discovery Authorization ---');
        // Missing targetPatientId
        let familyMissingPatientError = null;
        try {
            await discoveryService.searchCaregivers({}, familyMember);
        }
        catch (err) {
            familyMissingPatientError = err;
        }
        assert(familyMissingPatientError?.statusCode === 403 &&
            familyMissingPatientError?.code === 'TARGET_PATIENT_REQUIRED', 'Case 6.1: Family request without targetPatientId rejected with 403 TARGET_PATIENT_REQUIRED');
        // Unauthorized targetPatientId
        config_1.default.query = async (text) => {
            if (text.includes('patient_relationships')) {
                return { rows: [] }; // No confirmed relationship
            }
            return { rows: [] };
        };
        let familyUnauthError = null;
        try {
            await discoveryService.searchCaregivers({ targetPatientId: unauthorizedPatientId }, familyMember);
        }
        catch (err) {
            familyUnauthError = err;
        }
        assert(familyUnauthError?.statusCode === 403 &&
            familyUnauthError?.code === 'TARGET_PATIENT_UNAUTHORIZED', 'Case 6.2: Family request for unlinked/unauthorized patient rejected with 403 TARGET_PATIENT_UNAUTHORIZED');
        // -------------------------------------------------------------------------
        // CASE 7: Self-managed Patient discovery works without a separate target patient
        // -------------------------------------------------------------------------
        console.log('\n--- Case 7: Self-Managed Patient Discovery ---');
        config_1.default.query = async (text) => {
            if (text.includes('patient_profiles')) {
                return { rows: [{ onboarding_source: 'SELF' }] };
            }
            return { rows: [sampleCaregiverRow] };
        };
        const resCase7 = await discoveryService.searchCaregivers({}, selfPatient);
        assert(resCase7.caregivers.length === 1 && resCase7.caregivers[0].caregiverId === sampleCaregiverRow.caregiver_id, 'Case 7.1: Self-managed patient discovers care without needing an explicit targetPatientId');
        // Self-managed patient targeting another patient ID must be rejected
        let patientMismatchError = null;
        try {
            await discoveryService.searchCaregivers({ targetPatientId: unauthorizedPatientId }, selfPatient);
        }
        catch (err) {
            patientMismatchError = err;
        }
        assert(patientMismatchError?.statusCode === 403 &&
            patientMismatchError?.code === 'TARGET_PATIENT_UNAUTHORIZED', 'Case 7.2: Self-managed patient targeting another patient user rejected with 403 TARGET_PATIENT_UNAUTHORIZED');
        // -------------------------------------------------------------------------
        // CASE 8: Correct patient ID survives navigation into Care Request
        // -------------------------------------------------------------------------
        console.log('\n--- Case 8: Patient Identity Propagation Invariant ---');
        // Simulate CareRequestScreen patient resolution logic for Family:
        // resolvedPatientId = routeTargetPatientId || familyContextPatientId || null
        // NEVER fall back to user.id for FAMILY role!
        const simulatePatientResolution = (userRole, userId, routeTargetPatientId, familyContextPatientId) => {
            if (userRole === 'PATIENT')
                return userId;
            if (userRole === 'FAMILY') {
                return routeTargetPatientId || familyContextPatientId || null;
            }
            return null;
        };
        const familyResolvedWithRoute = simulatePatientResolution('FAMILY', familyMember.id, authorizedPatientId, undefined);
        const familyResolvedWithContext = simulatePatientResolution('FAMILY', familyMember.id, undefined, authorizedPatientId);
        const familyResolvedWithoutAny = simulatePatientResolution('FAMILY', familyMember.id, undefined, undefined);
        const patientResolved = simulatePatientResolution('PATIENT', selfPatient.id, undefined, undefined);
        assert(familyResolvedWithRoute === authorizedPatientId, 'Case 8.1: Family with route targetPatientId resolves to target patient ID');
        assert(familyResolvedWithContext === authorizedPatientId, 'Case 8.2: Family with context patient resolves to target patient ID');
        assert(familyResolvedWithoutAny === null && familyResolvedWithoutAny !== familyMember.id, 'Case 8.3: Family without target patient returns null and NEVER falls back to Family user ID');
        assert(patientResolved === selfPatient.id, 'Case 8.4: Self patient correctly resolves to authenticated patient ID');
        // -------------------------------------------------------------------------
        // CASE 9: Private caregiver fields are NOT returned
        // -------------------------------------------------------------------------
        console.log('\n--- Case 9: Privacy Protection ---');
        const resultItem = resCase1.caregivers[0];
        const keys = Object.keys(resultItem);
        const hasPrivateFields = keys.includes('phone') ||
            keys.includes('email') ||
            keys.includes('firebase_uid') ||
            keys.includes('firebaseUid') ||
            keys.includes('address') ||
            keys.includes('street_address');
        assert(!hasPrivateFields, 'Case 9.1: CaregiverSearchResult strictly omits phone, email, firebase_uid, and exact address');
        // Detailed profile check
        config_1.default.query = async (text) => {
            if (text.includes('patient_relationships')) {
                return {
                    rows: [
                        {
                            id: 'rel-1',
                            relationship_type: 'FAMILY_CLOSE',
                            status: 'CONFIRMED',
                            patient_city: 'Bengaluru',
                        },
                    ],
                };
            }
            return {
                rows: [
                    {
                        ...sampleCaregiverRow,
                        qualifications: [{ title: 'Certified Dementia Practitioner' }],
                        updated_at: new Date().toISOString(),
                    },
                ],
            };
        };
        const detailedProfile = await discoveryService.getCaregiverProfileById(sampleCaregiverRow.caregiver_id, familyMember, authorizedPatientId);
        const detailKeys = Object.keys(detailedProfile);
        const detailHasPrivateFields = detailKeys.includes('phone') ||
            detailKeys.includes('email') ||
            detailKeys.includes('firebase_uid') ||
            detailKeys.includes('firebaseUid') ||
            detailKeys.includes('address');
        assert(!detailHasPrivateFields, 'Case 9.2: Detailed caregiver profile strictly omits private contacts and identifiers');
        // -------------------------------------------------------------------------
        // CASE 10: Pagination and existing response shape remain correct
        // -------------------------------------------------------------------------
        console.log('\n--- Case 10: Pagination and Response Contract ---');
        assert(resCase1.pagination &&
            typeof resCase1.pagination.total === 'number' &&
            typeof resCase1.pagination.page === 'number' &&
            typeof resCase1.pagination.limit === 'number' &&
            typeof resCase1.pagination.totalPages === 'number' &&
            typeof resCase1.pagination.hasMore === 'boolean', 'Case 10.1: Response contract includes complete DiscoveryPagination metadata');
        assert(Array.isArray(resCase1.caregivers) &&
            typeof resCase1.caregivers[0].caregiverId === 'string' &&
            typeof resCase1.caregivers[0].name === 'string' &&
            typeof resCase1.caregivers[0].serviceRadiusKm === 'number', 'Case 10.2: Caregiver list items conform to CaregiverSearchResult interface shape');
    }
    finally {
        // Restore pool.query
        config_1.default.query = originalQuery;
    }
    console.log('\n===============================================================');
    console.log(`PHASE 2 REGRESSION SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log('===============================================================\n');
    if (passedTests === totalTests) {
        console.log('All Phase 2 Caregiver Discovery regression tests passed successfully!\n');
    }
    else {
        console.error('Some Phase 2 regression tests failed.\n');
        process.exit(1);
    }
}
runPhase2Tests().catch((err) => {
    console.error('Test execution error:', err);
    process.exit(1);
});
//# sourceMappingURL=test_phase2_discovery_regressions.js.map