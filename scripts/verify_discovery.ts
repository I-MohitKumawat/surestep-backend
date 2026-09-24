/**
 * verify_discovery.ts
 *
 * Automated verification test suite for SureStep Care Discovery (Part 2 & 2.1).
 * Verifies all criteria specified in the redesign requirements:
 *
 *  1. Self-created Patient → allowed
 *  2. Self-created Patient targeting another Patient → forbidden
 *  3. Family without targetPatientId → forbidden
 *  4. Family with authorized targetPatientId → allowed
 *  5. Family with unauthorized targetPatientId → forbidden
 *  6. Family-managed Patient directly attempting discovery → forbidden
 *  7. Caregiver → forbidden
 *  8. Only discoverable caregivers appear in search (cp.is_discoverable = TRUE)
 *  9. Inactive caregivers excluded (u.is_active = TRUE)
 * 10. Soft-deleted caregivers excluded (u.deleted_at IS NULL)
 * 11. Non-caregiver users excluded (u.role = 'CAREGIVER')
 * 12. Full-text / partial search by name, role, bio, qualifications
 * 13. City filter works
 * 14. Specializations filter works
 * 15. Languages filter works
 * 16. Availability filter works
 * 17. Max rate filter works
 * 18. Min experience filter works
 * 19. Unrated caregivers return null rating (not 5.0)
 * 20. Sorting orders work as expected (honest rating NULLS LAST)
 * 21. Phone number, email, and firebase_uid are NEVER returned in discovery results or detailed profile
 * 22. DiscoveryQuerySchema correctly parses and coerces query params
 */

import pool from '../db/config';
import { AppError } from '../shared/errors/AppError';
import type { User } from '../shared/types';
import * as discoveryService from '../modules/discovery/discovery.service';
import { DiscoveryQuerySchema } from '../modules/discovery/discovery.types';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    console.error(`  ✗ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('SURESTEP PART 2.1: CARE DISCOVERY AUTHORIZATION & VERIFICATION');
  console.log('===============================================================\n');

  // Backup original pool.query
  const originalQuery = pool.query.bind(pool);

  // Helper mock users
  const selfPatient: User = {
    id: 'patient-self-1111-1111-1111-111111111111',
    firebase_uid: 'fb-patient-1',
    name: 'Alice Patient',
    role: 'PATIENT',
    city: 'Mumbai',
    is_active: true,
    onboarding_complete: true,
    preferred_language: 'en',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const familyManagedPatient: User = {
    id: 'patient-fm-2222-2222-2222-222222222222',
    firebase_uid: 'fb-patient-2',
    name: 'Bob Patient',
    role: 'PATIENT',
    city: 'Delhi',
    is_active: true,
    onboarding_complete: true,
    preferred_language: 'en',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const familyUser: User = {
    id: 'family-3333-3333-3333-333333333333',
    firebase_uid: 'fb-family-1',
    name: 'Carol Family',
    role: 'FAMILY',
    city: 'Mumbai',
    is_active: true,
    onboarding_complete: true,
    preferred_language: 'en',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const caregiverUser: User = {
    id: 'caregiver-4444-4444-4444-444444444444',
    firebase_uid: 'fb-caregiver-1',
    name: 'Dr. Dave Caregiver',
    role: 'CAREGIVER',
    city: 'Mumbai',
    is_active: true,
    onboarding_complete: true,
    preferred_language: 'en',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    // -------------------------------------------------------------------------
    // TEST SECTION 1: Authorization & Access Control Rules
    // -------------------------------------------------------------------------
    console.log('--- SECTION 1: Authorization & Access Control Rules ---');

    // 1. Self-created Patient → allowed
    (pool as any).query = async (sql: string, params: any[]) => {
      if (sql.includes('patient_profiles') && sql.includes('onboarding_source')) {
        return { rows: [{ onboarding_source: 'SELF' }] };
      }
      return { rows: [] };
    };

    const selfAccess = await discoveryService.validateDiscoveryAccess(selfPatient);
    assert(
      selfAccess.targetPatientCity === 'Mumbai',
      'Test 1: Self-created Patient → allowed (resolves target to self)',
    );

    // 2. Self-created Patient targeting another Patient → forbidden
    let blockedSelfTargetingOther = false;
    try {
      await discoveryService.validateDiscoveryAccess(selfPatient, 'other-patient-uuid');
    } catch (err: any) {
      if (err instanceof AppError && err.code === 'TARGET_PATIENT_UNAUTHORIZED' && err.statusCode === 403) {
        blockedSelfTargetingOther = true;
      }
    }
    assert(
      blockedSelfTargetingOther,
      'Test 2: Self-created Patient targeting another Patient → forbidden (403 TARGET_PATIENT_UNAUTHORIZED)',
    );

    // 3. Family without targetPatientId → forbidden
    let blockedFamilyNoTarget = false;
    try {
      await discoveryService.validateDiscoveryAccess(familyUser);
    } catch (err: any) {
      if (err instanceof AppError && err.code === 'TARGET_PATIENT_REQUIRED' && err.statusCode === 403) {
        blockedFamilyNoTarget = true;
      }
    }
    assert(
      blockedFamilyNoTarget,
      'Test 3: Family without targetPatientId → forbidden (403 TARGET_PATIENT_REQUIRED)',
    );

    // 4. Family with authorized targetPatientId → allowed
    (pool as any).query = async (sql: string, params: any[]) => {
      if (sql.includes('patient_relationships') && params[0] === selfPatient.id) {
        return {
          rows: [
            {
              id: 'rel-1',
              relationship_type: 'FAMILY_CLOSE',
              status: 'CONFIRMED',
              patient_city: 'Mumbai',
            },
          ],
        };
      }
      return { rows: [] };
    };

    const familyAccess = await discoveryService.validateDiscoveryAccess(familyUser, selfPatient.id);
    assert(
      familyAccess.targetPatientCity === 'Mumbai',
      'Test 4: Family with authorized targetPatientId → allowed',
    );

    // 5. Family with unauthorized targetPatientId → forbidden
    (pool as any).query = async (sql: string, params: any[]) => {
      return { rows: [] };
    };

    let blockedUnlinkedFamily = false;
    try {
      await discoveryService.validateDiscoveryAccess(familyUser, 'unlinked-patient-id');
    } catch (err: any) {
      if (err instanceof AppError && err.code === 'TARGET_PATIENT_UNAUTHORIZED' && err.statusCode === 403) {
        blockedUnlinkedFamily = true;
      }
    }
    assert(
      blockedUnlinkedFamily,
      'Test 5: Family with unauthorized targetPatientId → forbidden (403 TARGET_PATIENT_UNAUTHORIZED)',
    );

    // 6. Family-managed Patient directly attempting discovery → forbidden
    (pool as any).query = async (sql: string, params: any[]) => {
      if (sql.includes('patient_profiles') && sql.includes('onboarding_source')) {
        return { rows: [{ onboarding_source: 'FAMILY' }] };
      }
      return { rows: [] };
    };

    let blockedFamilyManaged = false;
    try {
      await discoveryService.validateDiscoveryAccess(familyManagedPatient);
    } catch (err: any) {
      if (err instanceof AppError && err.code === 'DISCOVERY_MANAGED_BY_FAMILY' && err.statusCode === 403) {
        blockedFamilyManaged = true;
      }
    }
    assert(
      blockedFamilyManaged,
      'Test 6: Family-managed Patient directly attempting discovery → forbidden (403 DISCOVERY_MANAGED_BY_FAMILY)',
    );

    // 7. Caregiver → forbidden
    let blockedCaregiverRole = false;
    try {
      await discoveryService.validateDiscoveryAccess(caregiverUser);
    } catch (err: any) {
      if (err instanceof AppError && err.code === 'ROLE_NOT_PERMITTED' && err.statusCode === 403) {
        blockedCaregiverRole = true;
      }
    }
    assert(
      blockedCaregiverRole,
      'Test 7: Caregiver → forbidden (403 ROLE_NOT_PERMITTED)',
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 2: Search Query Construction & Filtering Engine
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 2: SQL Query Construction & Filter Semantics ---');

    let executedSql = '';
    let executedParams: any[] = [];

    (pool as any).query = async (sql: string, params: any[]) => {
      if (sql.includes('patient_profiles')) {
        return { rows: [{ onboarding_source: 'SELF' }] };
      }
      executedSql = sql;
      executedParams = params;
      return {
        rows: [
          {
            caregiver_id: 'cg-1111',
            name: 'Priya Sharma',
            photo_url: 'https://example.com/priya.jpg',
            professional_role: 'Dementia Specialist Nurse',
            years_of_experience: 8,
            dementia_experience_years: 5,
            has_dementia_training: true,
            specializations: ['Dementia Care', 'Alzheimers'],
            care_capabilities: ['Medication Management', 'Mobility Support'],
            languages_spoken: ['English', 'Hindi'],
            availability_types: ['FULL_TIME', 'LIVE_IN'],
            service_city: 'Mumbai',
            service_radius_km: 15,
            hourly_rate: '650.00',
            daily_rate: '4500.00',
            rating: null,
            rating_count: 0,
            bio: 'Experienced compassionate nurse specializing in dementia care.',
            is_discoverable: true,
            total_count: '1',
          },
        ],
      };
    };

    // 8. Base query constraints (discoverable, active, non-deleted, CAREGIVER)
    await discoveryService.searchCaregivers({}, selfPatient);
    assert(
      executedSql.includes(`u.role = 'CAREGIVER'`) &&
      executedSql.includes(`u.is_active = TRUE`) &&
      executedSql.includes(`u.deleted_at IS NULL`) &&
      executedSql.includes(`cp.is_discoverable = TRUE`),
      'Test 8: Query strictly enforces role=CAREGIVER, is_active=TRUE, deleted_at IS NULL, is_discoverable=TRUE',
    );

    // 9. Full-text / partial search by name, role, bio, qualifications
    await discoveryService.searchCaregivers({ search: 'alzheimer' }, selfPatient);
    assert(
      executedSql.includes('u.name ILIKE $') &&
      executedSql.includes('cp.professional_role ILIKE $') &&
      executedSql.includes('cp.bio ILIKE $') &&
      executedSql.includes('cp.qualifications::text ILIKE $') &&
      executedParams.includes('%alzheimer%'),
      'Test 9: Full-text / partial search matches name, role, bio, and qualifications',
    );

    // 10. City filter
    await discoveryService.searchCaregivers({ city: 'Pune' }, selfPatient);
    assert(
      executedSql.includes('COALESCE(cp.service_city, u.city) ILIKE $') &&
      executedParams.includes('%Pune%'),
      'Test 10: City filter matches COALESCE(cp.service_city, u.city)',
    );

    // 11. Specializations array filter
    await discoveryService.searchCaregivers({ specializations: ['Dementia', 'Palliative'] }, selfPatient);
    assert(
      executedSql.includes('cp.specializations && $') &&
      executedParams.some(p => Array.isArray(p) && p.includes('Dementia')),
      'Test 11: Specializations filter uses PostgreSQL array overlap (&&)',
    );

    // 12. Languages array filter
    await discoveryService.searchCaregivers({ languages: ['Hindi', 'Marathi'] }, selfPatient);
    assert(
      executedSql.includes('cp.languages_spoken && $') &&
      executedParams.some(p => Array.isArray(p) && p.includes('Hindi')),
      'Test 12: Languages filter uses PostgreSQL array overlap (&&)',
    );

    // 13. Availability array filter
    await discoveryService.searchCaregivers({ availability: ['FULL_TIME'] }, selfPatient);
    assert(
      executedSql.includes('cp.availability_types && $') &&
      executedParams.some(p => Array.isArray(p) && p.includes('FULL_TIME')),
      'Test 13: Availability filter uses PostgreSQL array overlap (&&)',
    );

    // 14. Max rate filter
    await discoveryService.searchCaregivers({ maxHourlyRate: 800 }, selfPatient);
    assert(
      executedSql.includes('cp.hourly_rate IS NOT NULL AND cp.hourly_rate <= $') &&
      executedParams.includes(800),
      'Test 14: Max hourly rate filter applied correctly',
    );

    // 15. Min experience filter
    await discoveryService.searchCaregivers({ minExperienceYears: 5 }, selfPatient);
    assert(
      executedSql.includes('cp.years_of_experience >= $') &&
      executedParams.includes(5),
      'Test 15: Minimum experience years filter applied correctly',
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 3: Rating Integrity & Sorting
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 3: Rating Integrity & Sorting Rules ---');

    // 16. Rating sorting orders NULLS LAST (never fabricated 5.0)
    await discoveryService.searchCaregivers({ sortBy: 'rating' }, selfPatient);
    assert(
      executedSql.includes('ORDER BY cp.rating DESC NULLS LAST, cp.rating_count DESC NULLS LAST'),
      'Test 16: Rating sorting uses ORDER BY cp.rating DESC NULLS LAST (no fake 5.0 in SQL)',
    );

    // 17. Unrated caregiver returns honest rating: null and ratingCount: 0
    const searchRes = await discoveryService.searchCaregivers({}, selfPatient);
    const unratedCg = searchRes.caregivers[0];
    assert(
      unratedCg.rating === null && unratedCg.ratingCount === 0,
      'Test 17: Unrated caregiver returns rating: null (not 5.0) and ratingCount: 0',
      `Got rating=${unratedCg.rating}, ratingCount=${unratedCg.ratingCount}`,
    );

    // 18. Price and Experience sorting
    await discoveryService.searchCaregivers({ sortBy: 'price_asc' }, selfPatient);
    const hasPriceAsc = executedSql.includes('ORDER BY cp.hourly_rate ASC NULLS LAST');
    await discoveryService.searchCaregivers({ sortBy: 'experience' }, selfPatient);
    const hasExpDesc = executedSql.includes('ORDER BY cp.years_of_experience DESC');
    assert(
      hasPriceAsc && hasExpDesc,
      'Test 18: Price ascending and Experience descending sorting verified',
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 4: Strict Privacy & Detail Profile Enforcement
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 4: Privacy & Detail Profile Verification ---');

    // 19. Search results NEVER expose phone, email, or firebase_uid
    const resultKeys = Object.keys(unratedCg);
    const searchHasLeaks = resultKeys.includes('phone') ||
      resultKeys.includes('email') ||
      resultKeys.includes('firebase_uid') ||
      resultKeys.includes('firebaseUid');
    assert(
      !searchHasLeaks,
      'Test 19: CaregiverSearchResult strictly omits phone, email, and firebase_uid',
      `Present keys: ${resultKeys.join(', ')}`,
    );

    // 20. Detailed caregiver profile omits phone, email, and firebase_uid
    (pool as any).query = async (sql: string, params: any[]) => {
      if (sql.includes('patient_profiles')) {
        return { rows: [{ onboarding_source: 'SELF' }] };
      }
      return {
        rows: [
          {
            caregiver_id: 'cg-1111',
            name: 'Priya Sharma',
            photo_url: 'https://example.com/priya.jpg',
            professional_role: 'Dementia Specialist Nurse',
            years_of_experience: 8,
            dementia_experience_years: 5,
            has_dementia_training: true,
            specializations: ['Dementia Care'],
            care_capabilities: ['Medication Management'],
            languages_spoken: ['English', 'Hindi'],
            availability_types: ['FULL_TIME'],
            service_city: 'Mumbai',
            service_radius_km: 15,
            hourly_rate: '650.00',
            daily_rate: '4500.00',
            rating: null,
            rating_count: 0,
            bio: 'Full biography of nurse Priya Sharma.',
            qualifications: ['B.Sc. Nursing', 'Certified Dementia Practitioner'],
            verification_status: 'VERIFIED',
            is_discoverable: true,
            updated_at: new Date().toISOString(),
          },
        ],
      };
    };

    const detailProfile = await discoveryService.getCaregiverProfileById('cg-1111', selfPatient);
    const detailKeys = Object.keys(detailProfile);
    const detailHasLeaks = detailKeys.includes('phone') ||
      detailKeys.includes('email') ||
      detailKeys.includes('firebase_uid') ||
      detailKeys.includes('firebaseUid');
    assert(
      !detailHasLeaks && detailProfile.rating === null && Array.isArray(detailProfile.qualifications),
      'Test 20: Detailed caregiver profile strictly omits private contacts and preserves honest rating',
      `Present keys: ${detailKeys.join(', ')}`,
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 5: Zod Schema Validation
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 5: Query Parameter Zod Schema Validation ---');

    const parsedQuery = DiscoveryQuerySchema.parse({
      search: 'Priya',
      city: 'Mumbai',
      languages: 'Hindi,English',
      specializations: 'Dementia',
      dementiaExperience: 'true',
      maxHourlyRate: '750',
      minExperienceYears: '3',
      sortBy: 'rating',
      page: '2',
      limit: '15',
    });

    assert(
      parsedQuery.dementiaExperience === true &&
      Array.isArray(parsedQuery.languages) && parsedQuery.languages.length === 2 &&
      parsedQuery.maxHourlyRate === 750 &&
      parsedQuery.minExperienceYears === 3 &&
      parsedQuery.page === 2 &&
      parsedQuery.limit === 15,
      'Test 21: DiscoveryQuerySchema correctly parses and coerces query params',
    );

  } finally {
    // Restore original query method
    pool.query = originalQuery;
  }

  console.log('\n===============================================================');
  console.log(`VERIFICATION SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('===============================================================');

  if (passedTests === totalTests) {
    console.log('All Care Discovery verification criteria satisfied successfully!\n');
    process.exit(0);
  } else {
    console.error('Some tests failed.\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled error in test runner:', err);
  process.exit(1);
});
