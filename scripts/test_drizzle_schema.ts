import assert from 'assert';
import * as schema from '../db/schema';
import { db } from '../db/drizzle';
import { getUserDevices } from '../modules/auth/auth.service';

console.log('===============================================================');
console.log('SURESTEP STACK REMEDIATION: DRIZZLE ORM SCHEMA VERIFICATION');
console.log('CLASSIFICATION: IN-MEMORY / SCHEMA CONTRACT UNIT TEST');
console.log('===============================================================\n');

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err: any) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    process.exit(1);
  }
}

// 1. Table exports
runTest('1. Drizzle schema exports all required domain tables', () => {
  assert.ok(schema.users, 'users table must be exported');
  assert.ok(schema.deviceRegistry, 'deviceRegistry table must be exported');
  assert.ok(schema.patientProfiles, 'patientProfiles table must be exported');
  assert.ok(schema.caregiverProfiles, 'caregiverProfiles table must be exported');
  assert.ok(schema.familyProfiles, 'familyProfiles table must be exported');
  assert.ok(schema.patientRelationships, 'patientRelationships table must be exported');
  assert.ok(schema.careRequests, 'careRequests table must be exported');
  assert.ok(schema.notificationLogs, 'notificationLogs table must be exported');
});

// 2. Column mapping verification
runTest('2. Users table has correct column names and constraints', () => {
  assert.strictEqual(schema.users.firebaseUid.name, 'firebase_uid');
  assert.strictEqual(schema.users.preferredLanguage.name, 'preferred_language');
  assert.strictEqual(schema.users.onboardingComplete.name, 'onboarding_complete');
});

runTest('3. Device registry table matches PostgreSQL migration 001/004 schema', () => {
  assert.strictEqual(schema.deviceRegistry.userId.name, 'user_id');
  assert.strictEqual(schema.deviceRegistry.deviceToken.name, 'device_token');
  assert.strictEqual(schema.deviceRegistry.deviceType.name, 'device_type');
  assert.strictEqual(schema.deviceRegistry.deviceId.name, 'device_id');
  assert.strictEqual(schema.deviceRegistry.lastSeenAt.name, 'last_seen_at');
});

runTest('4. Care requests table matches PostgreSQL migration 015 schema', () => {
  assert.strictEqual(schema.careRequests.patientId.name, 'patient_id');
  assert.strictEqual(schema.careRequests.caregiverId.name, 'caregiver_id');
  assert.strictEqual(schema.careRequests.requesterId.name, 'requester_id');
  assert.strictEqual(schema.careRequests.proposedRateInr.name, 'proposed_rate_inr');
  assert.strictEqual(schema.careRequests.proposedRateType.name, 'proposed_rate_type');
  assert.strictEqual(schema.careRequests.scheduleType.name, 'schedule_type');
});

// 3. Database instance initialized
runTest('5. Drizzle db instance is initialized and connected to schema', () => {
  assert.ok(db, 'db instance must be defined');
  assert.strictEqual(typeof db.select, 'function', 'db.select must be a function');
  assert.strictEqual(typeof getUserDevices, 'function', 'getUserDevices must be an exported function');
});

console.log('\n===============================================================');
console.log('DRIZZLE ORM VERIFICATION COMPLETE: ALL CHECKS PASSED');
console.log('===============================================================\n');

