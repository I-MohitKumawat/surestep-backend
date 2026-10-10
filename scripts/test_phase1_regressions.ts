/**
 * test_phase1_regressions.ts
 *
 * Automated Regression Test Suite for SureStep Phase 1:
 *  1. Multi-Caregiver Removal Isolation & Safety:
 *     - caregiverId required (rejects missing/empty with 400 VALIDATION_ERROR)
 *     - Acting on Caregiver A does not affect Caregiver B
 *     - Established relationships soft-terminate via canonical endCareRelationship
 *  2. Care Request Patient Identity & Authorization:
 *     - Self-managed Patient allowed for self only
 *     - Family member cannot use own ID as patient ID (403 TARGET_PATIENT_UNAUTHORIZED)
 *     - Family member with confirmed patient relationship allowed
 *     - Family member with unconfirmed/unrelated patient ID rejected
 *  3. Extended Family (FAMILY_EXTENDED) Task & Routine Read Access:
 *     - Read access permitted for FAMILY_EXTENDED on today's tasks and adherence
 *     - Read access permitted for FAMILY_EXTENDED on routine templates
 *     - Modification operations remain restricted to CAREGIVER
 *     - Non-family/unrelated users rejected with 403
 */

import assert from 'node:assert';
import { AppError } from '../shared/errors/AppError';
import * as relCtrl from '../modules/relationships/relationships.controller';
import * as relSvc from '../modules/relationships/relationships.service';
import pool from '../db/config';
import { requireRelationship } from '../shared/middleware/requireRelationship';
import { createCareRequest } from '../modules/care-requests/care-requests.service';
import type { User } from '../shared/types';

let testsPassed = 0;
let totalTests = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result
        .then(() => {
          testsPassed++;
          console.log(`  ✓ [PASS] ${name}`);
        })
        .catch((err) => {
          console.error(`  ✗ [FAIL] ${name}:`, err);
          throw err;
        });
    }
    testsPassed++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}:`, err);
    throw err;
  }
}

async function runSuite() {
  console.log('======================================================================');
  console.log('SURESTEP PHASE 1: AUTOMATED REGRESSION TEST SUITE');
  console.log('======================================================================\n');

  // Preserve original pool.query
  const originalQuery = pool.query.bind(pool);

  try {
    // ─── SUITE 1: Multi-Caregiver Removal Safety ──────────────────────────────────
    console.log('--- 1. Multi-Caregiver Removal Safety & Isolation ---');

    await runTest('1.1: Controller rejects missing caregiverId with 400 VALIDATION_ERROR', async () => {
      let threw = false;
      const mockReq: any = {
        user: { id: 'patient-uuid-1', role: 'PATIENT' },
        body: {},
        query: {},
      };
      const mockRes: any = {};

      try {
        await relCtrl.removeCaregiver(mockReq, mockRes);
      } catch (err: any) {
        threw = true;
        assert(err instanceof AppError, 'Expected AppError');
        assert.strictEqual(err.statusCode, 400);
        assert.strictEqual(err.code, 'VALIDATION_ERROR');
        assert(err.message.includes('caregiverId is required'));
      }
      assert(threw, 'Expected controller to throw 400 VALIDATION_ERROR');
    });

    await runTest('1.2: Controller rejects empty/whitespace caregiverId with 400 VALIDATION_ERROR', async () => {
      let threw = false;
      const mockReq: any = {
        user: { id: 'patient-uuid-1', role: 'PATIENT' },
        body: { caregiverId: '   ' },
        query: {},
      };
      const mockRes: any = {};

      try {
        await relCtrl.removeCaregiver(mockReq, mockRes);
      } catch (err: any) {
        threw = true;
        assert(err instanceof AppError, 'Expected AppError');
        assert.strictEqual(err.statusCode, 400);
      }
      assert(threw, 'Expected controller to throw 400 VALIDATION_ERROR');
    });

    await runTest('1.3: Service rejects missing caregiverId with 400 VALIDATION_ERROR', async () => {
      let threw = false;
      try {
        await relSvc.removeCaregiverRelationship('patient-uuid-1', '' as any);
      } catch (err: any) {
        threw = true;
        assert(err instanceof AppError, 'Expected AppError');
        assert.strictEqual(err.statusCode, 400);
      }
      assert(threw, 'Expected service to throw 400 VALIDATION_ERROR');
    });

    await runTest('1.4: Service throws 404 when relationship not found', async () => {
      (pool as any).query = async (text: string, params: any[]) => {
        // SELECT id, status FROM patient_relationships ...
        return { rows: [] };
      };

      let threw = false;
      try {
        await relSvc.removeCaregiverRelationship('patient-uuid-1', 'caregiver-uuid-x');
      } catch (err: any) {
        threw = true;
        assert(err instanceof AppError, 'Expected AppError');
        assert.strictEqual(err.statusCode, 404);
        assert.strictEqual(err.code, 'NOT_FOUND');
      }
      assert(threw, 'Expected 404 NOT_FOUND');
    });

    await runTest('1.5: Service throws 409 when relationship already ENDED', async () => {
      (pool as any).query = async (text: string, params: any[]) => {
        return { rows: [{ id: 'rel-1', status: 'ENDED' }] };
      };

      let threw = false;
      try {
        await relSvc.removeCaregiverRelationship('patient-uuid-1', 'caregiver-uuid-x');
      } catch (err: any) {
        threw = true;
        assert(err instanceof AppError, 'Expected AppError');
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.code, 'RELATIONSHIP_ALREADY_ENDED');
      }
      assert(threw, 'Expected 409 RELATIONSHIP_ALREADY_ENDED');
    });

    await runTest('1.6: Multi-Caregiver Isolation — Removing Caregiver A targets ONLY Caregiver A', async () => {
      let executedDeleteParams: any[] = [];
      let executedDeleteSql = '';

      (pool as any).query = async (text: string, params: any[]) => {
        if (text.includes('SELECT id, status FROM patient_relationships')) {
          assert.strictEqual(params[0], 'patient-uuid-1');
          assert.strictEqual(params[1], 'caregiver-A');
          return { rows: [{ id: 'rel-cg-a', status: 'PENDING' }] };
        }
        if (text.includes('DELETE FROM patient_relationships')) {
          executedDeleteSql = text;
          executedDeleteParams = params;
          return { rows: [{ related_user_id: 'caregiver-A' }] };
        }
        return { rows: [] };
      };

      const removedId = await relSvc.removeCaregiverRelationship('patient-uuid-1', 'caregiver-A');
      assert.strictEqual(removedId, 'caregiver-A');
      assert(executedDeleteSql.includes('related_user_id = $3'), 'SQL must target related_user_id specifically');
      assert.strictEqual(executedDeleteParams[2], 'caregiver-A', 'Delete params must target caregiver-A');
    });

    await runTest('1.7: Established relationship routes to canonical endCareRelationship without DELETE', async () => {
      let deleteCalled = false;
      const establishedRelId = '99999999-9999-4999-8999-999999999999';

      (pool as any).query = async (text: string, params: any[]) => {
        if (text.includes('DELETE FROM patient_relationships')) {
          deleteCalled = true;
          return { rows: [] };
        }
        if (text.includes('SELECT id, status FROM patient_relationships')) {
          return { rows: [{ id: establishedRelId, status: 'ACTIVE_CARE' }] };
        }
        return { rows: [] };
      };

      // Mock pool.connect for transaction in endCareRelationship
      const originalConnect = pool.connect.bind(pool);
      let clientUpdateExecuted = false;

      (pool as any).connect = async () => {
        return {
          query: async (text: string, params: any[]) => {
            if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
            if (text.includes('SELECT * FROM patient_relationships WHERE id = $1 FOR UPDATE')) {
              return {
                rows: [{
                  id: establishedRelId,
                  patient_user_id: 'patient-uuid-1',
                  related_user_id: 'caregiver-A',
                  relationship_type: 'CAREGIVER',
                  status: 'ACTIVE_CARE',
                }],
              };
            }
            if (text.includes('UPDATE patient_relationships') && text.includes("'ENDED'")) {
              clientUpdateExecuted = true;
              return {
                rows: [{
                  id: establishedRelId,
                  patient_user_id: 'patient-uuid-1',
                  related_user_id: 'caregiver-A',
                  relationship_type: 'CAREGIVER',
                  status: 'ENDED',
                }],
              };
            }
            if (text.includes('UPDATE caregiver_resignation_requests')) return { rows: [] };
            if (text.includes('SELECT id, name FROM users')) {
              return { rows: [{ id: 'patient-uuid-1', name: 'Patient' }, { id: 'caregiver-A', name: 'Caregiver' }] };
            }
            return { rows: [] };
          },
          release: () => {},
        };
      };

      try {
        const removedId = await relSvc.removeCaregiverRelationship('patient-uuid-1', 'caregiver-A');
        assert.strictEqual(removedId, 'caregiver-A');
        assert(!deleteCalled, 'DELETE statement must NOT be executed for established relationships');
        assert(clientUpdateExecuted, 'UPDATE patient_relationships to ENDED must be executed');
      } finally {
        pool.connect = originalConnect;
      }
    });

    await runTest('1.8: Identifier Mapping — caregiverId (user ID) maps to specific rel.id (relationship ID)', async () => {
      const targetCaregiverUserId = 'caregiver-user-uuid-123';
      const expectedRelationshipId = 'rel-primary-key-uuid-789';
      let lookedUpPatientId = '';
      let lookedUpCaregiverUserId = '';
      let passedRelationshipIdToEndCare = '';

      (pool as any).query = async (text: string, params: any[]) => {
        if (text.includes('SELECT id, status FROM patient_relationships')) {
          lookedUpPatientId = params[0];
          lookedUpCaregiverUserId = params[1];
          return { rows: [{ id: expectedRelationshipId, status: 'ACTIVE_CARE' }] };
        }
        return { rows: [] };
      };

      const originalConnect = pool.connect.bind(pool);
      (pool as any).connect = async () => {
        return {
          query: async (text: string, params: any[]) => {
            if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
            if (text.includes('SELECT * FROM patient_relationships WHERE id = $1 FOR UPDATE')) {
              passedRelationshipIdToEndCare = params[0];
              return {
                rows: [{
                  id: expectedRelationshipId,
                  patient_user_id: 'patient-uuid-1',
                  related_user_id: targetCaregiverUserId,
                  relationship_type: 'CAREGIVER',
                  status: 'ACTIVE_CARE',
                }],
              };
            }
            if (text.includes('UPDATE patient_relationships') && text.includes("'ENDED'")) {
              return {
                rows: [{
                  id: expectedRelationshipId,
                  patient_user_id: 'patient-uuid-1',
                  related_user_id: targetCaregiverUserId,
                  relationship_type: 'CAREGIVER',
                  status: 'ENDED',
                }],
              };
            }
            if (text.includes('UPDATE caregiver_resignation_requests')) return { rows: [] };
            if (text.includes('SELECT id, name FROM users')) {
              return { rows: [{ id: 'patient-uuid-1', name: 'Patient' }, { id: targetCaregiverUserId, name: 'Caregiver' }] };
            }
            return { rows: [] };
          },
          release: () => {},
        };
      };

      try {
        await relSvc.removeCaregiverRelationship('patient-uuid-1', targetCaregiverUserId);
        assert.strictEqual(lookedUpPatientId, 'patient-uuid-1', 'Must query with patient user ID');
        assert.strictEqual(lookedUpCaregiverUserId, targetCaregiverUserId, 'Must query with caregiver user ID');
        assert.strictEqual(
          passedRelationshipIdToEndCare,
          expectedRelationshipId,
          'endCareRelationship must receive the primary key relationship ID, NOT the caregiver user ID',
        );
      } finally {
        pool.connect = originalConnect;
      }
    });

    await runTest('1.9: Cross-patient isolation — Caregiver belonging to another patient returns 404 NOT_FOUND', async () => {
      (pool as any).query = async (text: string, params: any[]) => {
        // Querying patient_user_id = Patient A AND related_user_id = Caregiver of Patient B
        return { rows: [] }; // No matching relationship
      };

      let threw = false;
      try {
        await relSvc.removeCaregiverRelationship('patient-A', 'caregiver-of-patient-B');
      } catch (err: any) {
        threw = true;
        assert(err instanceof AppError);
        assert.strictEqual(err.statusCode, 404);
        assert.strictEqual(err.code, 'NOT_FOUND');
      }
      assert(threw, 'Must throw 404 when caregiver is not linked to this patient');
    });

    await runTest('1.10: Authorization boundary — Caregiver role cannot directly terminate via endCareRelationship', async () => {
      const { endCareRelationship } = await import('../modules/care-relationships/care-relationships.service');
      let threw = false;
      try {
        await endCareRelationship(
          'rel-1',
          { reason: 'CARE_NO_LONGER_REQUIRED' },
          { id: 'caregiver-1', role: 'CAREGIVER' },
        );
      } catch (err: any) {
        threw = true;
        assert(err instanceof AppError);
        assert.strictEqual(err.statusCode, 403);
        assert.strictEqual(err.code, 'CAREGIVER_CANNOT_END_RELATIONSHIP_DIRECTLY');
      }
      assert(threw, 'Caregiver role must be rejected with 403');
    });

    // ─── SUITE 2: Care Request Patient Identity & Authorization ──────────────────
    console.log('\n--- 2. Care Request Patient Identity & Authorization ---');

    const patientSelfId = '11111111-1111-4111-8111-111111111111';
    const otherPatientId = '22222222-2222-4222-8222-222222222222';
    const caregiverId = '33333333-3333-4333-8333-333333333333';
    const familyMemberId = '44444444-4444-4444-8444-444444444444';

    const baseValidInput = {
      patientId: patientSelfId,
      caregiverId: caregiverId,
      scheduleType: 'RECURRING' as const,
      startDate: '2026-11-01',
      endDate: null,
      daysOfWeek: [1, 3, 5],
      requestedShifts: ['DAY_SHIFT' as const],
      requestedCapabilities: ['hygiene_bathing' as const],
      proposedRateType: 'HOURLY' as const,
      proposedRateInr: 500,
      careContextNotes: 'Assistance needed',
    };

    await runTest('2.1: Self-Patient cannot request care for a different patient ID', async () => {
      const patientUser: User = {
        id: patientSelfId,
        firebase_uid: 'fb-patient-1',
        role: 'PATIENT',
        email: 'p@test.com',
        phone: '+919876543210',
        name: 'Patient Name',
        is_active: true,
        preferred_language: 'en',
        onboarding_complete: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      let threw = false;
      try {
        await createCareRequest(patientUser, {
          ...baseValidInput,
          patientId: otherPatientId,
        });
      } catch (err: any) {
        threw = true;
        assert(err instanceof AppError, `Expected AppError but got ${err}`);
        assert.strictEqual(err.statusCode, 403);
        assert.strictEqual(err.code, 'TARGET_PATIENT_UNAUTHORIZED');
      }
      assert(threw, 'Expected 403 TARGET_PATIENT_UNAUTHORIZED');
    });

    await runTest('2.2: Family member using own user.id as patientId is rejected with 403', async () => {
      const familyUser: User = {
        id: familyMemberId,
        firebase_uid: 'fb-family-1',
        role: 'FAMILY',
        email: 'fam@test.com',
        phone: '+919876543211',
        name: 'Family Member',
        is_active: true,
        preferred_language: 'en',
        onboarding_complete: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      (pool as any).query = async (text: string, params: any[]) => {
        if (text.includes('SELECT id FROM patient_relationships')) {
          // Family relationship check where patient_user_id = familyUser.id AND related_user_id = familyUser.id
          // No user is their own patient in patient_relationships
          return { rows: [] };
        }
        return { rows: [] };
      };

      let threw = false;
      try {
        await createCareRequest(familyUser, {
          ...baseValidInput,
          patientId: familyMemberId, // Substituted family user ID
        });
      } catch (err: any) {
        threw = true;
        assert(err instanceof AppError, `Expected AppError but got ${err}`);
        assert.strictEqual(err.statusCode, 403);
        assert.strictEqual(err.code, 'TARGET_PATIENT_UNAUTHORIZED');
        assert(err.message.includes('confirmed family relationship'));
      }
      assert(threw, 'Expected 403 TARGET_PATIENT_UNAUTHORIZED');
    });

    await runTest('2.3: Family member with confirmed patient relationship passes authorization check', async () => {
      const familyUser: User = {
        id: familyMemberId,
        firebase_uid: 'fb-family-1',
        role: 'FAMILY',
        email: 'fam@test.com',
        phone: '+919876543211',
        name: 'Family Member',
        is_active: true,
        preferred_language: 'en',
        onboarding_complete: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      let relationshipVerified = false;

      (pool as any).query = async (text: string, params: any[]) => {
        if (text.includes('SELECT cr.*') || text.includes('FROM care_requests cr')) {
          return {
            rows: [{
              id: 'new-request-id',
              patient_id: patientSelfId,
              caregiver_id: caregiverId,
              requester_id: familyMemberId,
              status: 'PENDING',
              schedule_type: 'RECURRING',
              start_date: '2026-11-01',
              end_date: null,
              days_of_week: [1, 3, 5],
              requested_shifts: ['DAY_SHIFT'],
              requested_capabilities: ['hygiene_bathing'],
              proposed_rate_type: 'HOURLY',
              proposed_rate_inr: 500,
              care_context_notes: 'Assistance needed',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
              caregiver_name: 'Bob',
              patient_name: 'Alice',
              requester_name: 'Family Member',
            }],
          };
        }
        if (text.includes('SELECT id FROM patient_relationships')) {
          assert.strictEqual(params[0], patientSelfId);
          assert.strictEqual(params[1], familyMemberId);
          relationshipVerified = true;
          return { rows: [{ id: 'fam-rel-1' }] };
        }
        if (text.includes('LEFT JOIN caregiver_profiles')) {
          return {
            rows: [{
              id: caregiverId,
              role: 'CAREGIVER',
              is_active: true,
              deleted_at: null,
              name: 'Bob',
              is_discoverable: true,
            }],
          };
        }
        if (text.includes('FROM users WHERE id = $1')) {
          if (params[0] === patientSelfId) {
            return { rows: [{ id: patientSelfId, role: 'PATIENT', is_active: true, deleted_at: null, name: 'Alice' }] };
          }
        }
        if (text.includes('care_requests') && text.includes('SELECT id FROM')) {
          return { rows: [] }; // No duplicate request
        }
        if (text.includes('INSERT INTO care_requests')) {
          return {
            rows: [{
              id: 'new-request-id',
              patient_id: patientSelfId,
              caregiver_id: caregiverId,
              requester_id: familyMemberId,
              status: 'PENDING',
              schedule_type: 'RECURRING',
              start_date: '2026-11-01',
              end_date: null,
              days_of_week: [1, 3, 5],
              requested_shifts: ['DAY_SHIFT'],
              requested_capabilities: ['hygiene_bathing'],
              proposed_rate_type: 'HOURLY',
              proposed_rate_inr: 500,
              care_context_notes: 'Assistance needed',
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
            }],
          };
        }
        return { rows: [] };
      };

      const result = await createCareRequest(familyUser, baseValidInput);
      assert(relationshipVerified, 'Family relationship check must have been executed');
      assert.strictEqual(result.patientId, patientSelfId);
      assert.strictEqual(result.requesterId, familyMemberId);
      assert.strictEqual(result.status, 'PENDING');
    });

    // ─── SUITE 3: Extended Family Task & Routine Read Access ─────────────────────
    console.log('\n--- 3. Extended Family (FAMILY_EXTENDED) Task & Routine Authorization ---');

    await runTest('3.1: requireRelationship allows FAMILY_EXTENDED when allowedTypes includes FAMILY_EXTENDED', async () => {
      const middleware = requireRelationship('patientId', ['CAREGIVER', 'FAMILY_CLOSE', 'GUARDIAN', 'FAMILY_EXTENDED']);
      const mockReq: any = {
        params: { patientId: 'patient-uuid-1' },
        user: { id: 'extended-family-user', role: 'FAMILY' },
      };
      const mockRes: any = {};
      let nextCalled = false;
      let nextError: any = null;

      (pool as any).query = async (text: string, params: any[]) => {
        assert(text.includes('status IN'));
        assert(text.includes('ANY($3::relationship_type[])'));
        assert.strictEqual(params[0], 'patient-uuid-1');
        assert.strictEqual(params[1], 'extended-family-user');
        // Return confirmed FAMILY_EXTENDED relationship
        return { rows: [{ id: 'rel-ext-1', relationship_type: 'FAMILY_EXTENDED' }] };
      };

      await middleware(mockReq, mockRes, (err?: any) => {
        nextCalled = true;
        nextError = err;
      });

      assert(nextCalled, 'next() should have been called');
      assert.strictEqual(nextError, undefined, 'No error should be passed to next()');
    });

    await runTest('3.2: requireRelationship rejects non-family / unauthorized tier with 403', async () => {
      const middleware = requireRelationship('patientId', ['CAREGIVER', 'FAMILY_CLOSE', 'GUARDIAN', 'FAMILY_EXTENDED']);
      const mockReq: any = {
        params: { patientId: 'patient-uuid-1' },
        user: { id: 'unrelated-user', role: 'FAMILY' },
      };
      const mockRes: any = {};
      let nextError: any = null;

      (pool as any).query = async (text: string, params: any[]) => {
        // No matching row
        return { rows: [] };
      };

      await middleware(mockReq, mockRes, (err?: any) => {
        nextError = err;
      });

      assert(nextError instanceof AppError, 'Expected AppError');
      assert.strictEqual(nextError.statusCode, 403);
      assert.strictEqual(nextError.code, 'INSUFFICIENT_RELATIONSHIP_TIER');
    });

    await runTest('3.3: Self-patient always accesses own data regardless of tier restriction', async () => {
      const middleware = requireRelationship('patientId', ['CAREGIVER']);
      const mockReq: any = {
        params: { patientId: 'patient-uuid-1' },
        user: { id: 'patient-uuid-1', role: 'PATIENT' },
      };
      const mockRes: any = {};
      let nextCalled = false;
      let nextError: any = null;

      await middleware(mockReq, mockRes, (err?: any) => {
        nextCalled = true;
        nextError = err;
      });

      assert(nextCalled, 'Self-patient should pass immediately without querying tier');
      assert.strictEqual(nextError, undefined);
    });

    await runTest('3.4: Existing Policy Verification — FAMILY_EXTENDED is blocked on [CAREGIVER, FAMILY_CLOSE, GUARDIAN]', async () => {
      const middleware = requireRelationship('patientId', ['CAREGIVER', 'FAMILY_CLOSE', 'GUARDIAN']);
      const mockReq: any = {
        params: { patientId: 'patient-uuid-1' },
        user: { id: 'extended-family-user', role: 'FAMILY' },
      };
      const mockRes: any = {};
      let nextError: any = null;

      (pool as any).query = async (text: string, params: any[]) => {
        // SQL query has relationship_type = ANY('{CAREGIVER,FAMILY_CLOSE,GUARDIAN}')
        // Returning 0 rows because user is FAMILY_EXTENDED
        return { rows: [] };
      };

      await middleware(mockReq, mockRes, (err?: any) => {
        nextError = err;
      });

      assert(nextError instanceof AppError, 'Expected AppError');
      assert.strictEqual(nextError.statusCode, 403);
      assert.strictEqual(nextError.code, 'INSUFFICIENT_RELATIONSHIP_TIER');
    });

    await runTest('3.5: Existing Policy Verification — FAMILY_CLOSE is allowed on [CAREGIVER, FAMILY_CLOSE, GUARDIAN]', async () => {
      const middleware = requireRelationship('patientId', ['CAREGIVER', 'FAMILY_CLOSE', 'GUARDIAN']);
      const mockReq: any = {
        params: { patientId: 'patient-uuid-1' },
        user: { id: 'close-family-user', role: 'FAMILY' },
      };
      const mockRes: any = {};
      let nextCalled = false;
      let nextError: any = null;

      (pool as any).query = async (text: string, params: any[]) => {
        return { rows: [{ id: 'rel-close-1', relationship_type: 'FAMILY_CLOSE' }] };
      };

      await middleware(mockReq, mockRes, (err?: any) => {
        nextCalled = true;
        nextError = err;
      });

      assert(nextCalled, 'next() should have been called for FAMILY_CLOSE');
      assert.strictEqual(nextError, undefined);
    });

    console.log('\n======================================================================');
    console.log(`RESULTS: ${testsPassed} / ${totalTests} tests passed successfully!`);
    console.log('======================================================================\n');
  } finally {
    pool.query = originalQuery;
  }
}

runSuite().catch((err) => {
  console.error('\nFatal test runner failure:', err);
  process.exit(1);
});
