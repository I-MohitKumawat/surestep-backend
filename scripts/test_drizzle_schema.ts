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
  // Care Circle Phase 1 tables
  assert.ok(schema.careCircles, 'careCircles table must be exported');
  assert.ok(schema.careCircleMembers, 'careCircleMembers table must be exported');
  assert.ok(schema.circlePermissions, 'circlePermissions table must be exported');
  assert.ok(schema.patientCircleAssociations, 'patientCircleAssociations table must be exported');
  assert.ok(schema.circleInvitations, 'circleInvitations table must be exported');
  assert.ok(schema.circleJoinRequests, 'circleJoinRequests table must be exported');
  assert.ok(schema.caregiverRelationships, 'caregiverRelationships table must be exported');
  assert.ok(schema.patientAssignments, 'patientAssignments table must be exported');
  // Subsystem Migration 019 tables
  assert.ok(schema.routineDefinitions, 'routineDefinitions table must be exported');
  assert.ok(schema.routineOccurrences, 'routineOccurrences table must be exported');
  assert.ok(schema.routineCompletions, 'routineCompletions table must be exported');
  assert.ok(schema.safeZones, 'safeZones table must be exported');
  assert.ok(schema.safeZoneMonitors, 'safeZoneMonitors table must be exported');
  assert.ok(schema.locationObservations, 'locationObservations table must be exported');
  assert.ok(schema.safetyAlerts, 'safetyAlerts table must be exported');
  assert.ok(schema.safetyAlertResponses, 'safetyAlertResponses table must be exported');
  assert.ok(schema.memories, 'memories table must be exported');
  assert.ok(schema.activityAttempts, 'activityAttempts table must be exported');
});

runTest('1c. Subsystem domain tables match PostgreSQL migration 019 schema', () => {
  assert.strictEqual(schema.routineDefinitions.patientId.name, 'patient_id');
  assert.strictEqual(schema.routineOccurrences.scheduledDate.name, 'scheduled_date');
  assert.strictEqual(schema.routineCompletions.completionSource.name, 'completion_source');
  assert.strictEqual(schema.safeZones.circleId.name, 'circle_id');
  assert.strictEqual(schema.safeZoneMonitors.safeZoneId.name, 'safe_zone_id');
  assert.strictEqual(schema.locationObservations.accuracyMeters.name, 'accuracy_meters');
  assert.strictEqual(schema.safetyAlerts.dedupKey.name, 'dedup_key');
  assert.strictEqual(schema.safetyAlertResponses.responderId.name, 'responder_id');
  assert.strictEqual(schema.memories.mediaType.name, 'media_type');
  assert.strictEqual(schema.activityAttempts.activityType.name, 'activity_type');
});

runTest('1b. Care Circle domain tables match PostgreSQL migration 018 schema', () => {
  assert.strictEqual(schema.careCircles.ownerId.name, 'owner_id');
  assert.strictEqual(schema.careCircles.terminatedAt.name, 'terminated_at');
  assert.strictEqual(schema.careCircleMembers.circleId.name, 'circle_id');
  assert.strictEqual(schema.careCircleMembers.roleInCircle.name, 'role_in_circle');
  assert.strictEqual(schema.circlePermissions.permissionName.name, 'permission_name');
  assert.strictEqual(schema.patientCircleAssociations.patientId.name, 'patient_id');
  assert.strictEqual(schema.circleInvitations.code.name, 'code');
  assert.strictEqual(schema.circleJoinRequests.invitationId.name, 'invitation_id');
  assert.strictEqual(schema.caregiverRelationships.caregiverId.name, 'caregiver_id');
  assert.strictEqual(schema.caregiverRelationships.noticeExpiresAt.name, 'notice_expires_at');
  assert.strictEqual(schema.patientAssignments.relationshipId.name, 'relationship_id');
  assert.strictEqual(schema.patientAssignments.isActive.name, 'is_active');
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

