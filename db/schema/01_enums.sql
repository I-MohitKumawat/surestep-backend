-- SECTION 1: ENUM TYPES
-- ============================================================
 
CREATE TYPE user_role_type AS ENUM (
  'PATIENT',
  'CAREGIVER',
  'FAMILY',
);
 
CREATE TYPE relationship_type AS ENUM (
  'CAREGIVER',
  'GUARDIAN',          -- primary family, full control
  'FAMILY_CLOSE',      -- trusted family, safety + routine view
  'FAMILY_EXTENDED',   -- distant family, digest only
  'DOCTOR'
);
 
CREATE TYPE relationship_status AS ENUM (
  'PENDING',
  'CONFIRMED',
  'SUSPENDED',
  'ENDED'
);
 
CREATE TYPE task_status AS ENUM (
  'PENDING',
  'DONE',
  'MISSED',
  'UNSURE',
  'SKIPPED'
);
 
CREATE TYPE task_recurrence_type AS ENUM (
  'NONE',
  'DAILY',
  'WEEKLY',
  'CUSTOM'
);
 
CREATE TYPE location_source AS ENUM (
  'PHONE',
  'WEARABLE',    -- future: custom watch
  'GLASS',       -- future: vision glass
  'MANUAL'
);
 
CREATE TYPE location_state AS ENUM (
  'MOVING',
  'STATIONARY_KNOWN',
  'STATIONARY_UNKNOWN',
  'NO_SIGNAL'
);
 
CREATE TYPE safety_state AS ENUM (
  'SAFE',
  'APPROACHING',
  'BREACH',
  'CRITICAL'
);
 
CREATE TYPE routine_state AS ENUM (
  'ON_TRACK',
  'BEHIND',
  'MISSED_CRITICAL',
  'ALL_DONE'
);
 
CREATE TYPE engagement_state AS ENUM (
  'ACTIVE',
  'IDLE',
  'NO_INTERACTION'
);
 
CREATE TYPE zone_type AS ENUM (
  'HOME',
  'CLINIC',
  'PARK',
  'PHARMACY',
  'TEMPLE',
  'MARKET',
  'CUSTOM'
);
 
CREATE TYPE boundary_type AS ENUM (
  'SOFT',   -- approaching warning only
  'HARD'    -- immediate critical alert on breach
);
 
CREATE TYPE alert_type AS ENUM (
  'ZONE_EXIT',
  'ZONE_ENTER',
  'APPROACHING_BOUNDARY',
  'STATIONARY_UNKNOWN',
  'ERRATIC_MOVEMENT',
  'WANDERING',
  'NO_SIGNAL',
  'TASK_MISSED_CRITICAL',
  'TASK_UNSURE',
  'MEDICATION_MISSED',
  'MEDICATION_REFILL_DUE',
  'FALL_DETECTED',
  'SOS_TRIGGERED',
  'INACTIVITY'
);
 
CREATE TYPE alert_severity AS ENUM (
  'INFO',       -- level 1: in-app only
  'WARNING',    -- level 2: push to caregiver
  'CRITICAL'    -- level 3: push + SMS to caregiver + all guardians
);
 
CREATE TYPE alert_status AS ENUM (
  'OPEN',
  'ACKNOWLEDGED',
  'RESOLVED'
);
 
CREATE TYPE voice_trigger_type AS ENUM (
  'MANUAL',
  'AUTO_STATIONARY',
  'AUTO_DISORIENTED',
  'AUTO_ROUTINE_REMINDER',
  'AUTO_MORNING_ORIENTATION',
  'AUTO_MISSED_CRITICAL',
  'SCHEDULED'
);
 
CREATE TYPE clone_status AS ENUM (
  'RAW',
  'PROCESSING',
  'READY',
  'FAILED'
);
 
CREATE TYPE device_type AS ENUM (
  'PHONE_IOS',
  'PHONE_ANDROID',
  'WEARABLE',
  'GLASS',
  'HOME_HUB'
);
 
CREATE TYPE game_type AS ENUM (
  'MEMORY_MATCH',
  'WORD_FINDER',
  'COLOR_SORT',
  'SOUND_RECALL',
  'FACE_RECOGNITION',
  'ORIENTATION_CHECK',
  'PICTURE_PUZZLE'
);
 
CREATE TYPE metric_type AS ENUM (
  'REACTION_TIME_MS',
  'RECALL_ACCURACY',
  'SEQUENCE_ERROR',
  'TOUCH_HESITATION_MS',
  'ORIENTATION_CORRECT',
  'FACE_RECOGNISED',
  'MOOD_SCORE'
);
 
CREATE TYPE cognitive_trend AS ENUM (
  'IMPROVING',
  'STABLE',
  'DECLINING',
  'INSUFFICIENT_DATA'
);
 
CREATE TYPE story_media_type AS ENUM (
  'PHOTO',
  'VOICE_NOTE',
  'TEXT',
  'VIDEO_MEMO'
);
 
CREATE TYPE document_type AS ENUM (
  'PRESCRIPTION',
  'DIAGNOSTIC_REPORT',
  'DISCHARGE_SUMMARY',
  'INSURANCE',
  'OTHER'
);
 
CREATE TYPE otp_purpose AS ENUM (
  'LOGIN',
  'PHONE_CHANGE',
  'ACCOUNT_DELETION'
);
 
CREATE TYPE availability_type AS ENUM (
  'LIVE_IN',
  'VISITING',
  'NIGHT',
  'ON_CALL'
);
 
CREATE TYPE shift_status AS ENUM (
  'SCHEDULED',
  'ACTIVE',
  'COMPLETED',
  'MISSED'
);
 
CREATE TYPE payment_status AS ENUM (
  'PENDING',
  'COMPLETED',
  'FAILED',
  'REFUNDED'
);
 
CREATE TYPE subscription_status AS ENUM (
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'CANCELLED'
);
 
CREATE TYPE familiarity_asset_type AS ENUM (
  'PHOTO',
  'SONG',
  'MEMORY_TEXT',
  'PLACE'
);
 
CREATE TYPE mood_context AS ENUM (
  'MORNING',
  'POST_GAME',
  'EVENING'
);
 
CREATE TYPE medication_form AS ENUM (
  'TABLET',
  'CAPSULE',
  'SYRUP',
  'INJECTION',
  'DROPS',
  'PATCH',
  'OTHER'
);
 
CREATE TYPE medication_log_status AS ENUM (
  'TAKEN',
  'MISSED',
  'SKIPPED'
);
 
CREATE TYPE message_media_type AS ENUM (
  'TEXT',
  'VOICE_NOTE',
  'PHOTO'
);
 
 
-- ============================================================
