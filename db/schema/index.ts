import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  date,
  time,
  timestamp,
  jsonb,
  doublePrecision,
} from 'drizzle-orm/pg-core';

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  firebaseUid: varchar('firebase_uid', { length: 200 }).notNull().unique(),
  email: varchar('email', { length: 255 }).unique(),
  phone: varchar('phone', { length: 20 }).unique(),
  name: varchar('name', { length: 100 }).notNull(),
  role: varchar('role', { length: 20 }).notNull(),
  dateOfBirth: date('date_of_birth'),
  gender: varchar('gender', { length: 20 }),
  preferredLanguage: varchar('preferred_language', { length: 10 }).notNull().default('en'),
  city: varchar('city', { length: 100 }),
  photoUrl: text('photo_url'),
  isActive: boolean('is_active').notNull().default(true),
  onboardingComplete: boolean('onboarding_complete').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// ─── Device Registry ─────────────────────────────────────────────────────────
export const deviceRegistry = pgTable('device_registry', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  deviceType: varchar('device_type', { length: 30 }).notNull(),
  deviceToken: text('device_token').notNull(),
  deviceId: varchar('device_id', { length: 200 }),
  deviceName: varchar('device_name', { length: 100 }),
  osVersion: varchar('os_version', { length: 20 }),
  appVersion: varchar('app_version', { length: 20 }),
  isPrimary: boolean('is_primary').notNull().default(false),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Patient Profiles ────────────────────────────────────────────────────────
export const patientProfiles = pgTable('patient_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  emergencyContactName: varchar('emergency_contact_name', { length: 100 }),
  emergencyContactPhone: varchar('emergency_contact_phone', { length: 20 }),
  diagnosis: varchar('diagnosis', { length: 100 }),
  diagnosisDate: date('diagnosis_date'),
  medications: jsonb('medications').notNull().default([]),
  knownTriggers: text('known_triggers').array().notNull().default([]),
  comfortItems: text('comfort_items').array().notNull().default([]),
  favouriteSongs: jsonb('favourite_songs').notNull().default([]),
  cognitiveBaselineDate: date('cognitive_baseline_date'),
  nimhansPatientId: varchar('nimhans_patient_id', { length: 50 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Caregiver Profiles ──────────────────────────────────────────────────────
export const caregiverProfiles = pgTable('caregiver_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  yearsOfExperience: integer('years_of_experience').notNull().default(0),
  specializations: text('specializations').array().notNull().default([]),
  languagesSpoken: text('languages_spoken').array().notNull().default([]),
  availabilityTypes: text('availability_types').array().notNull().default([]),
  serviceRadiusKm: integer('service_radius_km').notNull().default(10),
  maxPatients: integer('max_patients').notNull().default(3),
  hourlyRate: numeric('hourly_rate', { precision: 10, scale: 2 }),
  dailyRate: numeric('daily_rate', { precision: 10, scale: 2 }),
  bio: text('bio'),
  isVerified: boolean('is_verified').notNull().default(false),
  verificationMethod: varchar('verification_method', { length: 50 }),
  verificationDate: date('verification_date'),
  rating: numeric('rating', { precision: 3, scale: 2 }),
  ratingCount: integer('rating_count').notNull().default(0),
  isDiscoverable: boolean('is_discoverable').notNull().default(true),
  professionalRole: varchar('professional_role', { length: 50 }),
  dementiaExperienceYears: integer('dementia_experience_years').notNull().default(0),
  careCapabilities: text('care_capabilities').array().notNull().default([]),
  qualifications: jsonb('qualifications').notNull().default([]),
  hasDementiaTraining: boolean('has_dementia_training').notNull().default(false),
  serviceCity: varchar('service_city', { length: 100 }),
  verificationStatus: varchar('verification_status', { length: 30 }).notNull().default('UNVERIFIED'),
  verificationNotes: text('verification_notes'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Family Profiles ─────────────────────────────────────────────────────────
export const familyProfiles = pgTable('family_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  notificationDigestEnabled: boolean('notification_digest_enabled').notNull().default(true),
  digestFrequency: varchar('digest_frequency', { length: 20 }).notNull().default('DAILY'),
  whatsappNumber: varchar('whatsapp_number', { length: 20 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Patient Relationships ───────────────────────────────────────────────────
export const patientRelationships = pgTable('patient_relationships', {
  id: uuid('id').defaultRandom().primaryKey(),
  patientUserId: uuid('patient_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  relatedUserId: uuid('related_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  relationshipType: varchar('relationship_type', { length: 30 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('PENDING'),
  invitedBy: uuid('invited_by').references(() => users.id),
  inviteToken: varchar('invite_token', { length: 64 }).unique(),
  inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Care Requests ───────────────────────────────────────────────────────────
export const careRequests = pgTable('care_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  patientId: uuid('patient_id').notNull().references(() => users.id),
  requesterId: uuid('requester_id').notNull().references(() => users.id),
  caregiverId: uuid('caregiver_id').notNull().references(() => users.id),
  status: varchar('status', { length: 20 }).notNull().default('PENDING'),
  scheduleType: varchar('schedule_type', { length: 20 }).notNull(),
  requestedShifts: text('requested_shifts').array(),
  daysOfWeek: integer('days_of_week').array(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  requestedCapabilities: text('requested_capabilities').array().notNull().default([]),
  proposedRateType: varchar('proposed_rate_type', { length: 10 }).notNull(),
  proposedRateInr: numeric('proposed_rate_inr', { precision: 10, scale: 2 }).notNull(),
  careContextNotes: varchar('care_context_notes', { length: 1000 }),
  declineReason: varchar('decline_reason', { length: 50 }),
  withdrawReason: varchar('withdraw_reason', { length: 50 }),
  responseNotes: varchar('response_notes', { length: 500 }),
  resultingRelationshipId: uuid('resulting_relationship_id').references(() => patientRelationships.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// ─── Notification Logs ───────────────────────────────────────────────────────
export const notificationLogs = pgTable('notification_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  recipientRole: varchar('recipient_role', { length: 20 }),
  patientId: uuid('patient_id').references(() => users.id, { onDelete: 'set null' }),
  notificationType: varchar('notification_type', { length: 50 }),
  priority: varchar('priority', { length: 20 }).default('MEDIUM'),
  actionLink: text('action_link'),
  title: varchar('title', { length: 200 }).notNull(),
  message: text('message').notNull(),
  read: boolean('read').notNull().default(false),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Care Circles (Phase 1 Domain Foundation) ─────────────────────────────────
export const careCircles = pgTable('care_circles', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  terminatedAt: timestamp('terminated_at', { withTimezone: true }),
});

export const careCircleMembers = pgTable('care_circle_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  circleId: uuid('circle_id').notNull().references(() => careCircles.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  roleInCircle: varchar('role_in_circle', { length: 20 }).notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
});

export const circlePermissions = pgTable('circle_permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  memberId: uuid('member_id').notNull().references(() => careCircleMembers.id, { onDelete: 'cascade' }),
  permissionName: varchar('permission_name', { length: 64 }).notNull(),
  grantedBy: uuid('granted_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
});

export const patientCircleAssociations = pgTable('patient_circle_associations', {
  id: uuid('id').defaultRandom().primaryKey(),
  circleId: uuid('circle_id').notNull().references(() => careCircles.id, { onDelete: 'cascade' }),
  patientId: uuid('patient_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  associatedAt: timestamp('associated_at', { withTimezone: true }).notNull().defaultNow(),
  associatedBy: uuid('associated_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
});

export const circleInvitations = pgTable('circle_invitations', {
  id: uuid('id').defaultRandom().primaryKey(),
  circleId: uuid('circle_id').notNull().references(() => careCircles.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 6 }).notNull().unique(),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const circleJoinRequests = pgTable('circle_join_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  circleId: uuid('circle_id').notNull().references(() => careCircles.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  invitationId: uuid('invitation_id').notNull().references(() => circleInvitations.id, { onDelete: 'restrict' }),
  status: varchar('status', { length: 20 }).notNull().default('PENDING'),
  reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'restrict' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const caregiverRelationships = pgTable('caregiver_relationships', {
  id: uuid('id').defaultRandom().primaryKey(),
  circleId: uuid('circle_id').notNull().references(() => careCircles.id, { onDelete: 'restrict' }),
  caregiverId: uuid('caregiver_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  status: varchar('status', { length: 30 }).notNull().default('RELATIONSHIP_ESTABLISHED'),
  noticeStartedAt: timestamp('notice_started_at', { withTimezone: true }),
  noticeExpiresAt: timestamp('notice_expires_at', { withTimezone: true }),
  terminationReason: varchar('termination_reason', { length: 64 }),
  terminationNotes: text('termination_notes'),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const patientAssignments = pgTable('patient_assignments', {
  id: uuid('id').defaultRandom().primaryKey(),
  relationshipId: uuid('relationship_id').notNull().references(() => caregiverRelationships.id, { onDelete: 'cascade' }),
  patientId: uuid('patient_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  assignedBy: uuid('assigned_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  isActive: boolean('is_active').notNull().default(true),
});

// ─── Phase 1 Inferred TypeScript Types ─────────────────────────────────────────
export type CareCircle = typeof careCircles.$inferSelect;
export type NewCareCircle = typeof careCircles.$inferInsert;

export type CareCircleMember = typeof careCircleMembers.$inferSelect;
export type NewCareCircleMember = typeof careCircleMembers.$inferInsert;

export type CirclePermission = typeof circlePermissions.$inferSelect;
export type NewCirclePermission = typeof circlePermissions.$inferInsert;

export type PatientCircleAssociation = typeof patientCircleAssociations.$inferSelect;
export type NewPatientCircleAssociation = typeof patientCircleAssociations.$inferInsert;

export type CircleInvitation = typeof circleInvitations.$inferSelect;
export type NewCircleInvitation = typeof circleInvitations.$inferInsert;

export type CircleJoinRequest = typeof circleJoinRequests.$inferSelect;
export type NewCircleJoinRequest = typeof circleJoinRequests.$inferInsert;

export type CaregiverRelationship = typeof caregiverRelationships.$inferSelect;
export type NewCaregiverRelationship = typeof caregiverRelationships.$inferInsert;

export type PatientAssignment = typeof patientAssignments.$inferSelect;
export type NewPatientAssignment = typeof patientAssignments.$inferInsert;

// ─── Routine Subsystem (Migration 019 / TARGET_ARCHITECTURE §3.4) ────────────
export const routineDefinitions = pgTable('routine_definitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  patientId: uuid('patient_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  title: varchar('title', { length: 150 }).notNull(),
  category: varchar('category', { length: 30 }).notNull(),
  description: text('description'),
  schedulePattern: jsonb('schedule_pattern').notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const routineOccurrences = pgTable('routine_occurrences', {
  id: uuid('id').defaultRandom().primaryKey(),
  routineId: uuid('routine_id').notNull().references(() => routineDefinitions.id, { onDelete: 'cascade' }),
  patientId: uuid('patient_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  scheduledDate: date('scheduled_date').notNull(),
  scheduledTime: time('scheduled_time').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('SCHEDULED'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const routineCompletions = pgTable('routine_completions', {
  id: uuid('id').defaultRandom().primaryKey(),
  occurrenceId: uuid('occurrence_id').notNull().references(() => routineOccurrences.id, { onDelete: 'cascade' }),
  completedBy: uuid('completed_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  completionSource: varchar('completion_source', { length: 30 }).notNull(),
  notes: text('notes'),
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Location & Safe Zone Subsystem (TARGET_ARCHITECTURE §3.5) ────────────────
export const safeZones = pgTable('safe_zones', {
  id: uuid('id').defaultRandom().primaryKey(),
  circleId: uuid('circle_id').notNull().references(() => careCircles.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  centerLat: doublePrecision('center_lat').notNull(),
  centerLng: doublePrecision('center_lng').notNull(),
  radiusMeters: integer('radius_meters').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const safeZoneMonitors = pgTable('safe_zone_monitors', {
  id: uuid('id').defaultRandom().primaryKey(),
  safeZoneId: uuid('safe_zone_id').notNull().references(() => safeZones.id, { onDelete: 'cascade' }),
  patientId: uuid('patient_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  attachedAt: timestamp('attached_at', { withTimezone: true }).notNull().defaultNow(),
});

export const locationObservations = pgTable('location_observations', {
  id: uuid('id').defaultRandom().primaryKey(),
  patientId: uuid('patient_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  accuracyMeters: doublePrecision('accuracy_meters').notNull(),
  altitudeMeters: doublePrecision('altitude_meters'),
  batteryPct: integer('battery_pct'),
  isCharging: boolean('is_charging').notNull().default(false),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Safety & Alert Subsystem (TARGET_ARCHITECTURE §3.6) ──────────────────────
export const safetyAlerts = pgTable('safety_alerts', {
  id: uuid('id').defaultRandom().primaryKey(),
  circleId: uuid('circle_id').notNull().references(() => careCircles.id, { onDelete: 'cascade' }),
  patientId: uuid('patient_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  alertType: varchar('alert_type', { length: 30 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('TRIGGERED'),
  triggerLat: doublePrecision('trigger_lat'),
  triggerLng: doublePrecision('trigger_lng'),
  safeZoneId: uuid('safe_zone_id').references(() => safeZones.id, { onDelete: 'set null' }),
  dedupKey: varchar('dedup_key', { length: 128 }).notNull().unique(),
  triggeredAt: timestamp('triggered_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'restrict' }),
});

export const safetyAlertResponses = pgTable('safety_alert_responses', {
  id: uuid('id').defaultRandom().primaryKey(),
  alertId: uuid('alert_id').notNull().references(() => safetyAlerts.id, { onDelete: 'cascade' }),
  responderId: uuid('responder_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  action: varchar('action', { length: 20 }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Memories & Activity Subsystem (TARGET_ARCHITECTURE §3.7) ─────────────────
export const memories = pgTable('memories', {
  id: uuid('id').defaultRandom().primaryKey(),
  patientId: uuid('patient_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  creatorId: uuid('creator_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  title: varchar('title', { length: 150 }).notNull(),
  mediaType: varchar('media_type', { length: 20 }).notNull(),
  mediaKey: text('media_key'),
  caption: text('caption'),
  associatedPersonId: uuid('associated_person_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const activityAttempts = pgTable('activity_attempts', {
  id: uuid('id').defaultRandom().primaryKey(),
  patientId: uuid('patient_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  activityType: varchar('activity_type', { length: 30 }).notNull(),
  durationSeconds: integer('duration_seconds').notNull().default(0),
  completed: boolean('completed').notNull().default(false),
  metrics: jsonb('metrics').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Subsystem Inferred Types ─────────────────────────────────────────────────
export type RoutineDefinition = typeof routineDefinitions.$inferSelect;
export type NewRoutineDefinition = typeof routineDefinitions.$inferInsert;

export type RoutineOccurrence = typeof routineOccurrences.$inferSelect;
export type NewRoutineOccurrence = typeof routineOccurrences.$inferInsert;

export type RoutineCompletion = typeof routineCompletions.$inferSelect;
export type NewRoutineCompletion = typeof routineCompletions.$inferInsert;

export type SafeZone = typeof safeZones.$inferSelect;
export type NewSafeZone = typeof safeZones.$inferInsert;

export type SafeZoneMonitor = typeof safeZoneMonitors.$inferSelect;
export type NewSafeZoneMonitor = typeof safeZoneMonitors.$inferInsert;

export type LocationObservation = typeof locationObservations.$inferSelect;
export type NewLocationObservation = typeof locationObservations.$inferInsert;

export type SafetyAlert = typeof safetyAlerts.$inferSelect;
export type NewSafetyAlert = typeof safetyAlerts.$inferInsert;

export type SafetyAlertResponse = typeof safetyAlertResponses.$inferSelect;
export type NewSafetyAlertResponse = typeof safetyAlertResponses.$inferInsert;

export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;

export type ActivityAttempt = typeof activityAttempts.$inferSelect;
export type NewActivityAttempt = typeof activityAttempts.$inferInsert;



