import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
  jsonb,
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

