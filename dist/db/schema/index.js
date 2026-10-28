"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activityAttempts = exports.memories = exports.safetyAlertResponses = exports.safetyAlerts = exports.locationObservations = exports.safeZoneMonitors = exports.safeZones = exports.routineCompletions = exports.routineOccurrences = exports.routineDefinitions = exports.patientAssignments = exports.caregiverRelationships = exports.circleJoinRequests = exports.circleInvitations = exports.patientCircleAssociations = exports.circlePermissions = exports.careCircleMembers = exports.careCircles = exports.notificationLogs = exports.careRequests = exports.patientRelationships = exports.familyProfiles = exports.caregiverProfiles = exports.patientProfiles = exports.deviceRegistry = exports.users = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
// ─── Users ───────────────────────────────────────────────────────────────────
exports.users = (0, pg_core_1.pgTable)('users', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    firebaseUid: (0, pg_core_1.varchar)('firebase_uid', { length: 200 }).notNull().unique(),
    email: (0, pg_core_1.varchar)('email', { length: 255 }).unique(),
    phone: (0, pg_core_1.varchar)('phone', { length: 20 }).unique(),
    name: (0, pg_core_1.varchar)('name', { length: 100 }).notNull(),
    role: (0, pg_core_1.varchar)('role', { length: 20 }).notNull(),
    dateOfBirth: (0, pg_core_1.date)('date_of_birth'),
    gender: (0, pg_core_1.varchar)('gender', { length: 20 }),
    preferredLanguage: (0, pg_core_1.varchar)('preferred_language', { length: 10 }).notNull().default('en'),
    city: (0, pg_core_1.varchar)('city', { length: 100 }),
    photoUrl: (0, pg_core_1.text)('photo_url'),
    isActive: (0, pg_core_1.boolean)('is_active').notNull().default(true),
    onboardingComplete: (0, pg_core_1.boolean)('onboarding_complete').notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: (0, pg_core_1.timestamp)('deleted_at', { withTimezone: true }),
});
// ─── Device Registry ─────────────────────────────────────────────────────────
exports.deviceRegistry = (0, pg_core_1.pgTable)('device_registry', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => exports.users.id, { onDelete: 'cascade' }),
    deviceType: (0, pg_core_1.varchar)('device_type', { length: 30 }).notNull(),
    deviceToken: (0, pg_core_1.text)('device_token').notNull(),
    deviceId: (0, pg_core_1.varchar)('device_id', { length: 200 }),
    deviceName: (0, pg_core_1.varchar)('device_name', { length: 100 }),
    osVersion: (0, pg_core_1.varchar)('os_version', { length: 20 }),
    appVersion: (0, pg_core_1.varchar)('app_version', { length: 20 }),
    isPrimary: (0, pg_core_1.boolean)('is_primary').notNull().default(false),
    lastSeenAt: (0, pg_core_1.timestamp)('last_seen_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
// ─── Patient Profiles ────────────────────────────────────────────────────────
exports.patientProfiles = (0, pg_core_1.pgTable)('patient_profiles', {
    userId: (0, pg_core_1.uuid)('user_id').primaryKey().references(() => exports.users.id, { onDelete: 'cascade' }),
    emergencyContactName: (0, pg_core_1.varchar)('emergency_contact_name', { length: 100 }),
    emergencyContactPhone: (0, pg_core_1.varchar)('emergency_contact_phone', { length: 20 }),
    diagnosis: (0, pg_core_1.varchar)('diagnosis', { length: 100 }),
    diagnosisDate: (0, pg_core_1.date)('diagnosis_date'),
    medications: (0, pg_core_1.jsonb)('medications').notNull().default([]),
    knownTriggers: (0, pg_core_1.text)('known_triggers').array().notNull().default([]),
    comfortItems: (0, pg_core_1.text)('comfort_items').array().notNull().default([]),
    favouriteSongs: (0, pg_core_1.jsonb)('favourite_songs').notNull().default([]),
    cognitiveBaselineDate: (0, pg_core_1.date)('cognitive_baseline_date'),
    nimhansPatientId: (0, pg_core_1.varchar)('nimhans_patient_id', { length: 50 }),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
// ─── Caregiver Profiles ──────────────────────────────────────────────────────
exports.caregiverProfiles = (0, pg_core_1.pgTable)('caregiver_profiles', {
    userId: (0, pg_core_1.uuid)('user_id').primaryKey().references(() => exports.users.id, { onDelete: 'cascade' }),
    yearsOfExperience: (0, pg_core_1.integer)('years_of_experience').notNull().default(0),
    specializations: (0, pg_core_1.text)('specializations').array().notNull().default([]),
    languagesSpoken: (0, pg_core_1.text)('languages_spoken').array().notNull().default([]),
    availabilityTypes: (0, pg_core_1.text)('availability_types').array().notNull().default([]),
    serviceRadiusKm: (0, pg_core_1.integer)('service_radius_km').notNull().default(10),
    maxPatients: (0, pg_core_1.integer)('max_patients').notNull().default(3),
    hourlyRate: (0, pg_core_1.numeric)('hourly_rate', { precision: 10, scale: 2 }),
    dailyRate: (0, pg_core_1.numeric)('daily_rate', { precision: 10, scale: 2 }),
    bio: (0, pg_core_1.text)('bio'),
    isVerified: (0, pg_core_1.boolean)('is_verified').notNull().default(false),
    verificationMethod: (0, pg_core_1.varchar)('verification_method', { length: 50 }),
    verificationDate: (0, pg_core_1.date)('verification_date'),
    rating: (0, pg_core_1.numeric)('rating', { precision: 3, scale: 2 }),
    ratingCount: (0, pg_core_1.integer)('rating_count').notNull().default(0),
    isDiscoverable: (0, pg_core_1.boolean)('is_discoverable').notNull().default(true),
    professionalRole: (0, pg_core_1.varchar)('professional_role', { length: 50 }),
    dementiaExperienceYears: (0, pg_core_1.integer)('dementia_experience_years').notNull().default(0),
    careCapabilities: (0, pg_core_1.text)('care_capabilities').array().notNull().default([]),
    qualifications: (0, pg_core_1.jsonb)('qualifications').notNull().default([]),
    hasDementiaTraining: (0, pg_core_1.boolean)('has_dementia_training').notNull().default(false),
    serviceCity: (0, pg_core_1.varchar)('service_city', { length: 100 }),
    verificationStatus: (0, pg_core_1.varchar)('verification_status', { length: 30 }).notNull().default('UNVERIFIED'),
    verificationNotes: (0, pg_core_1.text)('verification_notes'),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
// ─── Family Profiles ─────────────────────────────────────────────────────────
exports.familyProfiles = (0, pg_core_1.pgTable)('family_profiles', {
    userId: (0, pg_core_1.uuid)('user_id').primaryKey().references(() => exports.users.id, { onDelete: 'cascade' }),
    notificationDigestEnabled: (0, pg_core_1.boolean)('notification_digest_enabled').notNull().default(true),
    digestFrequency: (0, pg_core_1.varchar)('digest_frequency', { length: 20 }).notNull().default('DAILY'),
    whatsappNumber: (0, pg_core_1.varchar)('whatsapp_number', { length: 20 }),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
// ─── Patient Relationships ───────────────────────────────────────────────────
exports.patientRelationships = (0, pg_core_1.pgTable)('patient_relationships', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    patientUserId: (0, pg_core_1.uuid)('patient_user_id').notNull().references(() => exports.users.id, { onDelete: 'cascade' }),
    relatedUserId: (0, pg_core_1.uuid)('related_user_id').notNull().references(() => exports.users.id, { onDelete: 'cascade' }),
    relationshipType: (0, pg_core_1.varchar)('relationship_type', { length: 30 }).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 20 }).notNull().default('PENDING'),
    invitedBy: (0, pg_core_1.uuid)('invited_by').references(() => exports.users.id),
    inviteToken: (0, pg_core_1.varchar)('invite_token', { length: 64 }).unique(),
    inviteExpiresAt: (0, pg_core_1.timestamp)('invite_expires_at', { withTimezone: true }),
    confirmedAt: (0, pg_core_1.timestamp)('confirmed_at', { withTimezone: true }),
    endedAt: (0, pg_core_1.timestamp)('ended_at', { withTimezone: true }),
    notes: (0, pg_core_1.text)('notes'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
// ─── Care Requests ───────────────────────────────────────────────────────────
exports.careRequests = (0, pg_core_1.pgTable)('care_requests', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    patientId: (0, pg_core_1.uuid)('patient_id').notNull().references(() => exports.users.id),
    requesterId: (0, pg_core_1.uuid)('requester_id').notNull().references(() => exports.users.id),
    caregiverId: (0, pg_core_1.uuid)('caregiver_id').notNull().references(() => exports.users.id),
    status: (0, pg_core_1.varchar)('status', { length: 20 }).notNull().default('PENDING'),
    scheduleType: (0, pg_core_1.varchar)('schedule_type', { length: 20 }).notNull(),
    requestedShifts: (0, pg_core_1.text)('requested_shifts').array(),
    daysOfWeek: (0, pg_core_1.integer)('days_of_week').array(),
    startDate: (0, pg_core_1.date)('start_date').notNull(),
    endDate: (0, pg_core_1.date)('end_date'),
    requestedCapabilities: (0, pg_core_1.text)('requested_capabilities').array().notNull().default([]),
    proposedRateType: (0, pg_core_1.varchar)('proposed_rate_type', { length: 10 }).notNull(),
    proposedRateInr: (0, pg_core_1.numeric)('proposed_rate_inr', { precision: 10, scale: 2 }).notNull(),
    careContextNotes: (0, pg_core_1.varchar)('care_context_notes', { length: 1000 }),
    declineReason: (0, pg_core_1.varchar)('decline_reason', { length: 50 }),
    withdrawReason: (0, pg_core_1.varchar)('withdraw_reason', { length: 50 }),
    responseNotes: (0, pg_core_1.varchar)('response_notes', { length: 500 }),
    resultingRelationshipId: (0, pg_core_1.uuid)('resulting_relationship_id').references(() => exports.patientRelationships.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
    respondedAt: (0, pg_core_1.timestamp)('responded_at', { withTimezone: true }),
    expiresAt: (0, pg_core_1.timestamp)('expires_at', { withTimezone: true }).notNull(),
});
// ─── Notification Logs ───────────────────────────────────────────────────────
exports.notificationLogs = (0, pg_core_1.pgTable)('notification_logs', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    userId: (0, pg_core_1.uuid)('user_id').references(() => exports.users.id, { onDelete: 'set null' }),
    recipientRole: (0, pg_core_1.varchar)('recipient_role', { length: 20 }),
    patientId: (0, pg_core_1.uuid)('patient_id').references(() => exports.users.id, { onDelete: 'set null' }),
    notificationType: (0, pg_core_1.varchar)('notification_type', { length: 50 }),
    priority: (0, pg_core_1.varchar)('priority', { length: 20 }).default('MEDIUM'),
    actionLink: (0, pg_core_1.text)('action_link'),
    title: (0, pg_core_1.varchar)('title', { length: 200 }).notNull(),
    message: (0, pg_core_1.text)('message').notNull(),
    read: (0, pg_core_1.boolean)('read').notNull().default(false),
    readAt: (0, pg_core_1.timestamp)('read_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
// ─── Care Circles (Phase 1 Domain Foundation) ─────────────────────────────────
exports.careCircles = (0, pg_core_1.pgTable)('care_circles', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    name: (0, pg_core_1.varchar)('name', { length: 100 }).notNull(),
    ownerId: (0, pg_core_1.uuid)('owner_id').notNull().references(() => exports.users.id, { onDelete: 'restrict' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
    terminatedAt: (0, pg_core_1.timestamp)('terminated_at', { withTimezone: true }),
});
exports.careCircleMembers = (0, pg_core_1.pgTable)('care_circle_members', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    circleId: (0, pg_core_1.uuid)('circle_id').notNull().references(() => exports.careCircles.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => exports.users.id, { onDelete: 'restrict' }),
    roleInCircle: (0, pg_core_1.varchar)('role_in_circle', { length: 20 }).notNull(),
    joinedAt: (0, pg_core_1.timestamp)('joined_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.circlePermissions = (0, pg_core_1.pgTable)('circle_permissions', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    memberId: (0, pg_core_1.uuid)('member_id').notNull().references(() => exports.careCircleMembers.id, { onDelete: 'cascade' }),
    permissionName: (0, pg_core_1.varchar)('permission_name', { length: 64 }).notNull(),
    grantedBy: (0, pg_core_1.uuid)('granted_by').notNull().references(() => exports.users.id, { onDelete: 'restrict' }),
    grantedAt: (0, pg_core_1.timestamp)('granted_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.patientCircleAssociations = (0, pg_core_1.pgTable)('patient_circle_associations', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    circleId: (0, pg_core_1.uuid)('circle_id').notNull().references(() => exports.careCircles.id, { onDelete: 'cascade' }),
    patientId: (0, pg_core_1.uuid)('patient_id').notNull().references(() => exports.users.id, { onDelete: 'restrict' }),
    associatedAt: (0, pg_core_1.timestamp)('associated_at', { withTimezone: true }).notNull().defaultNow(),
    associatedBy: (0, pg_core_1.uuid)('associated_by').notNull().references(() => exports.users.id, { onDelete: 'restrict' }),
});
exports.circleInvitations = (0, pg_core_1.pgTable)('circle_invitations', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    circleId: (0, pg_core_1.uuid)('circle_id').notNull().references(() => exports.careCircles.id, { onDelete: 'cascade' }),
    code: (0, pg_core_1.varchar)('code', { length: 6 }).notNull().unique(),
    createdBy: (0, pg_core_1.uuid)('created_by').notNull().references(() => exports.users.id, { onDelete: 'restrict' }),
    status: (0, pg_core_1.varchar)('status', { length: 20 }).notNull().default('ACTIVE'),
    expiresAt: (0, pg_core_1.timestamp)('expires_at', { withTimezone: true }).notNull(),
    usedAt: (0, pg_core_1.timestamp)('used_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.circleJoinRequests = (0, pg_core_1.pgTable)('circle_join_requests', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    circleId: (0, pg_core_1.uuid)('circle_id').notNull().references(() => exports.careCircles.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => exports.users.id, { onDelete: 'restrict' }),
    invitationId: (0, pg_core_1.uuid)('invitation_id').notNull().references(() => exports.circleInvitations.id, { onDelete: 'restrict' }),
    status: (0, pg_core_1.varchar)('status', { length: 20 }).notNull().default('PENDING'),
    reviewedBy: (0, pg_core_1.uuid)('reviewed_by').references(() => exports.users.id, { onDelete: 'restrict' }),
    reviewedAt: (0, pg_core_1.timestamp)('reviewed_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.caregiverRelationships = (0, pg_core_1.pgTable)('caregiver_relationships', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    circleId: (0, pg_core_1.uuid)('circle_id').notNull().references(() => exports.careCircles.id, { onDelete: 'restrict' }),
    caregiverId: (0, pg_core_1.uuid)('caregiver_id').notNull().references(() => exports.users.id, { onDelete: 'restrict' }),
    status: (0, pg_core_1.varchar)('status', { length: 30 }).notNull().default('RELATIONSHIP_ESTABLISHED'),
    noticeStartedAt: (0, pg_core_1.timestamp)('notice_started_at', { withTimezone: true }),
    noticeExpiresAt: (0, pg_core_1.timestamp)('notice_expires_at', { withTimezone: true }),
    terminationReason: (0, pg_core_1.varchar)('termination_reason', { length: 64 }),
    terminationNotes: (0, pg_core_1.text)('termination_notes'),
    endedAt: (0, pg_core_1.timestamp)('ended_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.patientAssignments = (0, pg_core_1.pgTable)('patient_assignments', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    relationshipId: (0, pg_core_1.uuid)('relationship_id').notNull().references(() => exports.caregiverRelationships.id, { onDelete: 'cascade' }),
    patientId: (0, pg_core_1.uuid)('patient_id').notNull().references(() => exports.users.id, { onDelete: 'restrict' }),
    assignedBy: (0, pg_core_1.uuid)('assigned_by').notNull().references(() => exports.users.id, { onDelete: 'restrict' }),
    assignedAt: (0, pg_core_1.timestamp)('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    isActive: (0, pg_core_1.boolean)('is_active').notNull().default(true),
});
// ─── Routine Subsystem (Migration 019 / TARGET_ARCHITECTURE §3.4) ────────────
exports.routineDefinitions = (0, pg_core_1.pgTable)('routine_definitions', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    patientId: (0, pg_core_1.uuid)('patient_id').notNull().references(() => exports.users.id, { onDelete: 'restrict' }),
    title: (0, pg_core_1.varchar)('title', { length: 150 }).notNull(),
    category: (0, pg_core_1.varchar)('category', { length: 30 }).notNull(),
    description: (0, pg_core_1.text)('description'),
    schedulePattern: (0, pg_core_1.jsonb)('schedule_pattern').notNull().default({}),
    isActive: (0, pg_core_1.boolean)('is_active').notNull().default(true),
    createdBy: (0, pg_core_1.uuid)('created_by').notNull().references(() => exports.users.id, { onDelete: 'restrict' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.routineOccurrences = (0, pg_core_1.pgTable)('routine_occurrences', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    routineId: (0, pg_core_1.uuid)('routine_id').notNull().references(() => exports.routineDefinitions.id, { onDelete: 'cascade' }),
    patientId: (0, pg_core_1.uuid)('patient_id').notNull().references(() => exports.users.id, { onDelete: 'restrict' }),
    scheduledDate: (0, pg_core_1.date)('scheduled_date').notNull(),
    scheduledTime: (0, pg_core_1.time)('scheduled_time').notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 20 }).notNull().default('SCHEDULED'),
    startedAt: (0, pg_core_1.timestamp)('started_at', { withTimezone: true }),
    completedAt: (0, pg_core_1.timestamp)('completed_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.routineCompletions = (0, pg_core_1.pgTable)('routine_completions', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    occurrenceId: (0, pg_core_1.uuid)('occurrence_id').notNull().references(() => exports.routineOccurrences.id, { onDelete: 'cascade' }),
    completedBy: (0, pg_core_1.uuid)('completed_by').notNull().references(() => exports.users.id, { onDelete: 'restrict' }),
    completionSource: (0, pg_core_1.varchar)('completion_source', { length: 30 }).notNull(),
    notes: (0, pg_core_1.text)('notes'),
    completedAt: (0, pg_core_1.timestamp)('completed_at', { withTimezone: true }).notNull().defaultNow(),
});
// ─── Location & Safe Zone Subsystem (TARGET_ARCHITECTURE §3.5) ────────────────
exports.safeZones = (0, pg_core_1.pgTable)('safe_zones', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    circleId: (0, pg_core_1.uuid)('circle_id').notNull().references(() => exports.careCircles.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.varchar)('name', { length: 100 }).notNull(),
    centerLat: (0, pg_core_1.doublePrecision)('center_lat').notNull(),
    centerLng: (0, pg_core_1.doublePrecision)('center_lng').notNull(),
    radiusMeters: (0, pg_core_1.integer)('radius_meters').notNull(),
    isActive: (0, pg_core_1.boolean)('is_active').notNull().default(true),
    createdBy: (0, pg_core_1.uuid)('created_by').notNull().references(() => exports.users.id, { onDelete: 'restrict' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.safeZoneMonitors = (0, pg_core_1.pgTable)('safe_zone_monitors', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    safeZoneId: (0, pg_core_1.uuid)('safe_zone_id').notNull().references(() => exports.safeZones.id, { onDelete: 'cascade' }),
    patientId: (0, pg_core_1.uuid)('patient_id').notNull().references(() => exports.users.id, { onDelete: 'restrict' }),
    attachedAt: (0, pg_core_1.timestamp)('attached_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.locationObservations = (0, pg_core_1.pgTable)('location_observations', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    patientId: (0, pg_core_1.uuid)('patient_id').notNull().references(() => exports.users.id, { onDelete: 'restrict' }),
    lat: (0, pg_core_1.doublePrecision)('lat').notNull(),
    lng: (0, pg_core_1.doublePrecision)('lng').notNull(),
    accuracyMeters: (0, pg_core_1.doublePrecision)('accuracy_meters').notNull(),
    altitudeMeters: (0, pg_core_1.doublePrecision)('altitude_meters'),
    batteryPct: (0, pg_core_1.integer)('battery_pct'),
    isCharging: (0, pg_core_1.boolean)('is_charging').notNull().default(false),
    recordedAt: (0, pg_core_1.timestamp)('recorded_at', { withTimezone: true }).notNull(),
    receivedAt: (0, pg_core_1.timestamp)('received_at', { withTimezone: true }).notNull().defaultNow(),
});
// ─── Safety & Alert Subsystem (TARGET_ARCHITECTURE §3.6) ──────────────────────
exports.safetyAlerts = (0, pg_core_1.pgTable)('safety_alerts', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    circleId: (0, pg_core_1.uuid)('circle_id').notNull().references(() => exports.careCircles.id, { onDelete: 'cascade' }),
    patientId: (0, pg_core_1.uuid)('patient_id').notNull().references(() => exports.users.id, { onDelete: 'restrict' }),
    alertType: (0, pg_core_1.varchar)('alert_type', { length: 30 }).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 20 }).notNull().default('TRIGGERED'),
    triggerLat: (0, pg_core_1.doublePrecision)('trigger_lat'),
    triggerLng: (0, pg_core_1.doublePrecision)('trigger_lng'),
    safeZoneId: (0, pg_core_1.uuid)('safe_zone_id').references(() => exports.safeZones.id, { onDelete: 'set null' }),
    dedupKey: (0, pg_core_1.varchar)('dedup_key', { length: 128 }).notNull().unique(),
    triggeredAt: (0, pg_core_1.timestamp)('triggered_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: (0, pg_core_1.timestamp)('resolved_at', { withTimezone: true }),
    resolvedBy: (0, pg_core_1.uuid)('resolved_by').references(() => exports.users.id, { onDelete: 'restrict' }),
});
exports.safetyAlertResponses = (0, pg_core_1.pgTable)('safety_alert_responses', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    alertId: (0, pg_core_1.uuid)('alert_id').notNull().references(() => exports.safetyAlerts.id, { onDelete: 'cascade' }),
    responderId: (0, pg_core_1.uuid)('responder_id').notNull().references(() => exports.users.id, { onDelete: 'restrict' }),
    action: (0, pg_core_1.varchar)('action', { length: 20 }).notNull(),
    notes: (0, pg_core_1.text)('notes'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
// ─── Memories & Activity Subsystem (TARGET_ARCHITECTURE §3.7) ─────────────────
exports.memories = (0, pg_core_1.pgTable)('memories', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    patientId: (0, pg_core_1.uuid)('patient_id').notNull().references(() => exports.users.id, { onDelete: 'restrict' }),
    creatorId: (0, pg_core_1.uuid)('creator_id').notNull().references(() => exports.users.id, { onDelete: 'restrict' }),
    title: (0, pg_core_1.varchar)('title', { length: 150 }).notNull(),
    mediaType: (0, pg_core_1.varchar)('media_type', { length: 20 }).notNull(),
    mediaKey: (0, pg_core_1.text)('media_key'),
    caption: (0, pg_core_1.text)('caption'),
    associatedPersonId: (0, pg_core_1.uuid)('associated_person_id').references(() => exports.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.activityAttempts = (0, pg_core_1.pgTable)('activity_attempts', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    patientId: (0, pg_core_1.uuid)('patient_id').notNull().references(() => exports.users.id, { onDelete: 'restrict' }),
    activityType: (0, pg_core_1.varchar)('activity_type', { length: 30 }).notNull(),
    durationSeconds: (0, pg_core_1.integer)('duration_seconds').notNull().default(0),
    completed: (0, pg_core_1.boolean)('completed').notNull().default(false),
    metrics: (0, pg_core_1.jsonb)('metrics').notNull().default({}),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
//# sourceMappingURL=index.js.map