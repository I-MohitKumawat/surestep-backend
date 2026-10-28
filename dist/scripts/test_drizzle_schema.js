"use strict";
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
const assert_1 = __importDefault(require("assert"));
const schema = __importStar(require("../db/schema"));
const drizzle_1 = require("../db/drizzle");
const auth_service_1 = require("../modules/auth/auth.service");
console.log('===============================================================');
console.log('SURESTEP STACK REMEDIATION: DRIZZLE ORM SCHEMA VERIFICATION');
console.log('CLASSIFICATION: IN-MEMORY / SCHEMA CONTRACT UNIT TEST');
console.log('===============================================================\n');
function runTest(name, fn) {
    try {
        fn();
        console.log(`  ✓ [PASS] ${name}`);
    }
    catch (err) {
        console.error(`  ✗ [FAIL] ${name}:`, err.message);
        process.exit(1);
    }
}
// 1. Table exports
runTest('1. Drizzle schema exports all required domain tables', () => {
    assert_1.default.ok(schema.users, 'users table must be exported');
    assert_1.default.ok(schema.deviceRegistry, 'deviceRegistry table must be exported');
    assert_1.default.ok(schema.patientProfiles, 'patientProfiles table must be exported');
    assert_1.default.ok(schema.caregiverProfiles, 'caregiverProfiles table must be exported');
    assert_1.default.ok(schema.familyProfiles, 'familyProfiles table must be exported');
    assert_1.default.ok(schema.patientRelationships, 'patientRelationships table must be exported');
    assert_1.default.ok(schema.careRequests, 'careRequests table must be exported');
    assert_1.default.ok(schema.notificationLogs, 'notificationLogs table must be exported');
    // Care Circle Phase 1 tables
    assert_1.default.ok(schema.careCircles, 'careCircles table must be exported');
    assert_1.default.ok(schema.careCircleMembers, 'careCircleMembers table must be exported');
    assert_1.default.ok(schema.circlePermissions, 'circlePermissions table must be exported');
    assert_1.default.ok(schema.patientCircleAssociations, 'patientCircleAssociations table must be exported');
    assert_1.default.ok(schema.circleInvitations, 'circleInvitations table must be exported');
    assert_1.default.ok(schema.circleJoinRequests, 'circleJoinRequests table must be exported');
    assert_1.default.ok(schema.caregiverRelationships, 'caregiverRelationships table must be exported');
    assert_1.default.ok(schema.patientAssignments, 'patientAssignments table must be exported');
    // Subsystem Migration 019 tables
    assert_1.default.ok(schema.routineDefinitions, 'routineDefinitions table must be exported');
    assert_1.default.ok(schema.routineOccurrences, 'routineOccurrences table must be exported');
    assert_1.default.ok(schema.routineCompletions, 'routineCompletions table must be exported');
    assert_1.default.ok(schema.safeZones, 'safeZones table must be exported');
    assert_1.default.ok(schema.safeZoneMonitors, 'safeZoneMonitors table must be exported');
    assert_1.default.ok(schema.locationObservations, 'locationObservations table must be exported');
    assert_1.default.ok(schema.safetyAlerts, 'safetyAlerts table must be exported');
    assert_1.default.ok(schema.safetyAlertResponses, 'safetyAlertResponses table must be exported');
    assert_1.default.ok(schema.memories, 'memories table must be exported');
    assert_1.default.ok(schema.activityAttempts, 'activityAttempts table must be exported');
});
runTest('1c. Subsystem domain tables match PostgreSQL migration 019 schema', () => {
    assert_1.default.strictEqual(schema.routineDefinitions.patientId.name, 'patient_id');
    assert_1.default.strictEqual(schema.routineOccurrences.scheduledDate.name, 'scheduled_date');
    assert_1.default.strictEqual(schema.routineCompletions.completionSource.name, 'completion_source');
    assert_1.default.strictEqual(schema.safeZones.circleId.name, 'circle_id');
    assert_1.default.strictEqual(schema.safeZoneMonitors.safeZoneId.name, 'safe_zone_id');
    assert_1.default.strictEqual(schema.locationObservations.accuracyMeters.name, 'accuracy_meters');
    assert_1.default.strictEqual(schema.safetyAlerts.dedupKey.name, 'dedup_key');
    assert_1.default.strictEqual(schema.safetyAlertResponses.responderId.name, 'responder_id');
    assert_1.default.strictEqual(schema.memories.mediaType.name, 'media_type');
    assert_1.default.strictEqual(schema.activityAttempts.activityType.name, 'activity_type');
});
runTest('1b. Care Circle domain tables match PostgreSQL migration 018 schema', () => {
    assert_1.default.strictEqual(schema.careCircles.ownerId.name, 'owner_id');
    assert_1.default.strictEqual(schema.careCircles.terminatedAt.name, 'terminated_at');
    assert_1.default.strictEqual(schema.careCircleMembers.circleId.name, 'circle_id');
    assert_1.default.strictEqual(schema.careCircleMembers.roleInCircle.name, 'role_in_circle');
    assert_1.default.strictEqual(schema.circlePermissions.permissionName.name, 'permission_name');
    assert_1.default.strictEqual(schema.patientCircleAssociations.patientId.name, 'patient_id');
    assert_1.default.strictEqual(schema.circleInvitations.code.name, 'code');
    assert_1.default.strictEqual(schema.circleJoinRequests.invitationId.name, 'invitation_id');
    assert_1.default.strictEqual(schema.caregiverRelationships.caregiverId.name, 'caregiver_id');
    assert_1.default.strictEqual(schema.caregiverRelationships.noticeExpiresAt.name, 'notice_expires_at');
    assert_1.default.strictEqual(schema.patientAssignments.relationshipId.name, 'relationship_id');
    assert_1.default.strictEqual(schema.patientAssignments.isActive.name, 'is_active');
});
// 2. Column mapping verification
runTest('2. Users table has correct column names and constraints', () => {
    assert_1.default.strictEqual(schema.users.firebaseUid.name, 'firebase_uid');
    assert_1.default.strictEqual(schema.users.preferredLanguage.name, 'preferred_language');
    assert_1.default.strictEqual(schema.users.onboardingComplete.name, 'onboarding_complete');
});
runTest('3. Device registry table matches PostgreSQL migration 001/004 schema', () => {
    assert_1.default.strictEqual(schema.deviceRegistry.userId.name, 'user_id');
    assert_1.default.strictEqual(schema.deviceRegistry.deviceToken.name, 'device_token');
    assert_1.default.strictEqual(schema.deviceRegistry.deviceType.name, 'device_type');
    assert_1.default.strictEqual(schema.deviceRegistry.deviceId.name, 'device_id');
    assert_1.default.strictEqual(schema.deviceRegistry.lastSeenAt.name, 'last_seen_at');
});
runTest('4. Care requests table matches PostgreSQL migration 015 schema', () => {
    assert_1.default.strictEqual(schema.careRequests.patientId.name, 'patient_id');
    assert_1.default.strictEqual(schema.careRequests.caregiverId.name, 'caregiver_id');
    assert_1.default.strictEqual(schema.careRequests.requesterId.name, 'requester_id');
    assert_1.default.strictEqual(schema.careRequests.proposedRateInr.name, 'proposed_rate_inr');
    assert_1.default.strictEqual(schema.careRequests.proposedRateType.name, 'proposed_rate_type');
    assert_1.default.strictEqual(schema.careRequests.scheduleType.name, 'schedule_type');
});
// 3. Database instance initialized
runTest('5. Drizzle db instance is initialized and connected to schema', () => {
    assert_1.default.ok(drizzle_1.db, 'db instance must be defined');
    assert_1.default.strictEqual(typeof drizzle_1.db.select, 'function', 'db.select must be a function');
    assert_1.default.strictEqual(typeof auth_service_1.getUserDevices, 'function', 'getUserDevices must be an exported function');
});
console.log('\n===============================================================');
console.log('DRIZZLE ORM VERIFICATION COMPLETE: ALL CHECKS PASSED');
console.log('===============================================================\n');
//# sourceMappingURL=test_drizzle_schema.js.map