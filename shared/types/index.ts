// ─── ENUMS ───────────────────────────────────────────────────────────────────

export type UserRole = 'PATIENT' | 'CAREGIVER' | 'FAMILY';

export type RelationshipType = 'CAREGIVER' | 'GUARDIAN' | 'FAMILY_CLOSE' | 'FAMILY_EXTENDED' | 'DOCTOR';
export type RelationshipStatus = 'PENDING' | 'CONFIRMED' | 'SUSPENDED' | 'ENDED';

export type TaskStatus = 'PENDING' | 'DONE' | 'MISSED' | 'UNSURE' | 'SKIPPED';
export type RecurrenceType = 'NONE' | 'DAILY' | 'WEEKLY' | 'CUSTOM';

export type LocationSource = 'PHONE' | 'WEARABLE' | 'GLASS' | 'MANUAL';
export type ZoneType = 'HOME' | 'CLINIC' | 'PARK' | 'PHARMACY' | 'TEMPLE' | 'MARKET' | 'CUSTOM';
export type BoundaryType = 'SOFT' | 'HARD';
export type AlertType =
  | 'ZONE_EXIT' | 'ZONE_ENTER' | 'APPROACHING'
  | 'STATIONARY_UNKNOWN' | 'ERRATIC_MOVEMENT' | 'NO_SIGNAL'
  | 'FALL_DETECTED' | 'SOS_TRIGGERED';
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type LocationState = 'MOVING' | 'STATIONARY_KNOWN' | 'STATIONARY_UNKNOWN' | 'NO_SIGNAL';
export type SafetyState = 'SAFE' | 'APPROACHING' | 'BREACH' | 'CRITICAL';
export type RoutineState = 'ON_TRACK' | 'BEHIND' | 'MISSED_CRITICAL' | 'ALL_DONE';
export type EngagementState = 'ACTIVE' | 'IDLE' | 'NO_INTERACTION';

export type VoiceTrigger = 'MANUAL' | 'AUTO_STATIONARY' | 'AUTO_DISORIENTED' | 'AUTO_ROUTINE' | 'SCHEDULED' | 'SOS';
export type CloneStatus = 'RAW' | 'PROCESSING' | 'READY' | 'FAILED';
export type MessageStatus = 'QUEUED' | 'GENERATING' | 'DELIVERED' | 'FAILED' | 'SKIPPED';

export type GameType =
  | 'MEMORY_MATCH' | 'WORD_FINDER' | 'COLOR_SORT'
  | 'SOUND_RECALL' | 'FACE_RECOGNITION'
  | 'ORIENTATION_CHECK' | 'PICTURE_PUZZLE';
export type MetricType =
  | 'REACTION_TIME_MS' | 'RECALL_ACCURACY' | 'SEQUENCE_ERROR'
  | 'TOUCH_HESITATION_MS' | 'ORIENTATION_CORRECT' | 'FACE_RECOGNISED';
export type CogTrend = 'IMPROVING' | 'STABLE' | 'DECLINING' | 'INSUFFICIENT_DATA';

export type DeviceType = 'PHONE_IOS' | 'PHONE_ANDROID' | 'WEARABLE' | 'GLASS' | 'HOME_HUB';
export type MessageType = 'TEXT' | 'VOICE_MEMO' | 'PHOTO' | 'STORY_POST' | 'SYSTEM';
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
export type SubscriptionTier = 'FREE' | 'BASIC' | 'PREMIUM' | 'AGENCY';

// ─── DATABASE ROW TYPES ──────────────────────────────────────────────────────

export interface User {
  id: string;
  firebase_uid: string;
  email?: string;
  phone?: string;
  name: string;
  role: UserRole;
  date_of_birth?: string;
  gender?: string;
  preferred_language: string;
  city?: string;
  photo_url?: string;
  is_active: boolean;
  onboarding_complete: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface PatientProfile {
  user_id: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  diagnosis?: string;
  diagnosis_date?: string;
  medications: any[];
  known_triggers: string[];
  comfort_items: string[];
  favourite_songs: any[];
  cognitive_baseline_date?: string;
  nimhans_patient_id?: string;
  updated_at: string;
}

export interface CaregiverProfile {
  user_id: string;
  years_of_experience: number;
  specializations: string[];
  languages_spoken: string[];
  availability_types: string[];
  service_radius_km: number;
  max_patients: number;
  hourly_rate?: number;
  daily_rate?: number;
  bio?: string;
  is_verified: boolean;
  verification_method?: string;
  verification_date?: string;
  rating?: number;
  rating_count: number;
  is_discoverable: boolean;
  updated_at: string;
}

export interface FamilyProfile {
  user_id: string;
  relation_label?: string;
  avatar_url?: string;
  notify_on_breach: boolean;
  notify_on_missed_critical: boolean;
  notify_on_sos: boolean;
  notify_on_daily_digest: boolean;
  digest_frequency: string;
  whatsapp_number?: string;
  updated_at: string;
}

export interface PatientRelationship {
  id: string;
  patient_user_id: string;
  related_user_id: string;
  relationship_type: RelationshipType;
  status: RelationshipStatus;
  invited_by?: string;
  invite_token?: string;
  invite_expires_at?: string;
  confirmed_at?: string;
  ended_at?: string;
  notes?: string;
  created_at: string;
}

export interface Task {
  id: string;
  patient_id: string;
  assigned_by: string;
  template_id?: string;
  title: string;
  description?: string;
  patient_hint?: string;
  emoji?: string;
  steps: any[];
  scheduled_time: string;
  scheduled_date: string;
  duration_minutes: number;
  is_critical: boolean;
  status: TaskStatus;
  completed_at?: string;
  caregiver_note?: string;
  voice_note_url?: string;
  recurrence_type: RecurrenceType;
  recurrence_days?: number[];
  recurrence_end?: string;
  parent_task_id?: string;
  created_at: string;
}

export interface GeofenceZone {
  id: string;
  patient_id: string;
  created_by: string;
  label: string;
  zone_type: ZoneType;
  center_lat: number;
  center_lng: number;
  radius_m: number;
  boundary_type: BoundaryType;
  approach_threshold_pct: number;
  is_active: boolean;
  active_hours_start?: string;
  active_hours_end?: string;
  created_at: string;
}

export interface PatientState {
  patient_id: string;
  location_state: LocationState;
  safety_state: SafetyState;
  routine_state: RoutineState;
  engagement_state: EngagementState;
  last_known_lat?: number;
  last_known_lng?: number;
  last_ping_at?: string;
  stationary_since?: string;
  voice_last_triggered_at?: string;
  sos_active: boolean;
  computed_at: string;
}

// ─── API RESPONSE TYPES ──────────────────────────────────────────────────────

export interface ApiResponse<T = any> {
  success: boolean;
  data: T | null;
  error?: {
    code: string;
    message: string;
  };
}

// ─── REQUEST AUGMENTATION ────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
