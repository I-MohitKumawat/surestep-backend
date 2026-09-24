/**
 * SureStep — shared/constants/care.constants.ts
 *
 * Authoritative Canonical Domain Constants for:
 *  - Shifts / Working Availability
 *  - Care Capabilities
 *  - Caregiver Decline Reasons
 *  - Requester Withdrawal Reasons
 *  - Care Request Statuses, Rates, and Schedules
 *
 * Source of truth for database constraints, backend validators, and API payloads.
 */

// ─── SHIFTS ──────────────────────────────────────────────────────────────────

export const CANONICAL_SHIFTS = [
  'DAY_SHIFT',       // Day Shifts
  'EVENING_SHIFT',   // Evening Shifts
  'OVERNIGHT',       // Overnight Care
  'LIVE_IN',         // 24-Hour / Live-in
  'WEEKEND',         // Weekend Only
  'FULL_TIME',       // Full-time
  'PART_TIME',       // Part-time
  'RESPITE',         // Respite / Relief Care
  'ON_CALL',         // On-call Emergency
] as const;

export type CanonicalShift = (typeof CANONICAL_SHIFTS)[number];

export const SHIFT_METADATA: Record<
  CanonicalShift,
  { label: string; icon: string; description: string }
> = {
  DAY_SHIFT: {
    label: 'Day Shifts',
    icon: 'sunny-outline',
    description: 'Standard daytime care assistance',
  },
  EVENING_SHIFT: {
    label: 'Evening Shifts',
    icon: 'partly-sunny-outline',
    description: 'Dinner, sundowning support, and bedtime routine',
  },
  OVERNIGHT: {
    label: 'Overnight Care',
    icon: 'moon-outline',
    description: 'Nighttime monitoring, bathroom assistance, and wandering safety',
  },
  LIVE_IN: {
    label: '24-Hour / Live-in',
    icon: 'home-outline',
    description: 'Continuous around-the-clock live-in care',
  },
  WEEKEND: {
    label: 'Weekend Only',
    icon: 'calendar-outline',
    description: 'Saturday and Sunday care coverage',
  },
  FULL_TIME: {
    label: 'Full-time',
    icon: 'time-outline',
    description: 'Full-time ongoing weekly support',
  },
  PART_TIME: {
    label: 'Part-time',
    icon: 'hourglass-outline',
    description: 'Scheduled recurring part-time hours',
  },
  RESPITE: {
    label: 'Respite / Relief Care',
    icon: 'heart-outline',
    description: 'Short-term relief coverage for primary family caregivers',
  },
  ON_CALL: {
    label: 'On-call Emergency',
    icon: 'call-outline',
    description: 'On-demand standby support for urgent needs',
  },
};

// ─── CAPABILITIES ────────────────────────────────────────────────────────────

export const CANONICAL_CAPABILITIES = [
  'hygiene_bathing',         // Bathing & Personal Hygiene
  'mobility_transfers',      // Mobility & Transfers
  'medication_prompts',      // Medication Reminders
  'meal_prep_feeding',       // Meal Prep & Feeding
  'wandering_prevention',    // Wandering Prevention & Safety
  'behavioral_reassurance',  // Sundowning & Agitation Support
  'cognitive_stimulation',   // Companionship & Memory Games
  'bedridden_care',          // Bedridden & Pressure Sore Care
  'incontinence_care',       // Incontinence & Toileting
  'vitals_monitoring',       // Vitals Monitoring (BP/SpO2)
] as const;

export type CanonicalCapability = (typeof CANONICAL_CAPABILITIES)[number];

export const CAPABILITY_METADATA: Record<
  CanonicalCapability,
  { label: string; icon: string; description: string }
> = {
  hygiene_bathing: {
    label: 'Bathing & Personal Hygiene',
    icon: 'water-outline',
    description: 'Assisting with bathing, oral care, grooming, and dressing',
  },
  mobility_transfers: {
    label: 'Mobility & Transfers',
    icon: 'walk-outline',
    description: 'Safe bed-to-chair transfers, walking assistance, and fall prevention',
  },
  medication_prompts: {
    label: 'Medication Reminders',
    icon: 'medkit-outline',
    description: 'Timely reminders and prompt tracking for prescribed dosages',
  },
  meal_prep_feeding: {
    label: 'Meal Prep & Feeding',
    icon: 'nutrition-outline',
    description: 'Nutritious meal preparation, hydration encouragement, and feeding aid',
  },
  wandering_prevention: {
    label: 'Wandering Prevention & Safety',
    icon: 'shield-checkmark-outline',
    description: 'Active vigilance, exit monitoring, and disorientation prevention',
  },
  behavioral_reassurance: {
    label: 'Sundowning & Agitation Support',
    icon: 'heart-half-outline',
    description: 'De-escalation, soothing techniques, and emotional reassurance',
  },
  cognitive_stimulation: {
    label: 'Companionship & Memory Games',
    icon: 'sparkles-outline',
    description: 'Familiar conversation, memory exercises, puzzles, and music therapy',
  },
  bedridden_care: {
    label: 'Bedridden & Pressure Sore Care',
    icon: 'bed-outline',
    description: 'Repositioning, bed sponge, skin hygiene, and pressure relief',
  },
  incontinence_care: {
    label: 'Incontinence & Toileting',
    icon: 'fitness-outline',
    description: 'Prompt toileting assistance, brief changes, and skin care',
  },
  vitals_monitoring: {
    label: 'Vitals Monitoring (BP/SpO2)',
    icon: 'pulse-outline',
    description: 'Tracking blood pressure, pulse, oxygen saturation, and temperature',
  },
};

// ─── DECLINE REASONS ─────────────────────────────────────────────────────────

export const CAREGIVER_DECLINE_REASONS = [
  'SCHEDULE_CONFLICT',     // Unavailable during requested shift hours
  'OUTSIDE_SERVICE_AREA',  // Location is beyond travel radius
  'CARE_NEEDS_MISMATCH',   // Care requirements exceed capability/scope
  'CAPACITY_FULL',         // Currently at maximum patient capacity
  'RATE_DISAGREEMENT',     // Proposed rate is unacceptable
  'OTHER',                 // Other commitments or personal reasons
] as const;

export type CaregiverDeclineReason = (typeof CAREGIVER_DECLINE_REASONS)[number];

export const DECLINE_REASON_METADATA: Record<
  CaregiverDeclineReason,
  { label: string; description: string }
> = {
  SCHEDULE_CONFLICT: {
    label: 'Schedule Conflict',
    description: 'Unavailable during the requested days or shift hours',
  },
  OUTSIDE_SERVICE_AREA: {
    label: 'Outside Service Area',
    description: 'Patient location is beyond travel radius or commute limit',
  },
  CARE_NEEDS_MISMATCH: {
    label: 'Care Needs Mismatch',
    description: 'Required care duties or condition severity exceed comfort level',
  },
  CAPACITY_FULL: {
    label: 'Capacity Full',
    description: 'Currently managing maximum number of active patients',
  },
  RATE_DISAGREEMENT: {
    label: 'Rate Disagreement',
    description: 'Proposed rate is below caregiver rate schedule',
  },
  OTHER: {
    label: 'Other',
    description: 'Personal commitments or other scheduling reasons',
  },
};

// ─── WITHDRAWAL REASONS ──────────────────────────────────────────────────────

export const REQUESTER_WITHDRAW_REASONS = [
  'FOUND_ALTERNATIVE_CARE',// Secured care through another provider
  'ARRANGED_FAMILY_CARE',  // Family member will provide care
  'SCHEDULE_CHANGED',      // Care needs or timing changed
  'ACCIDENTAL_REQUEST',    // Submitted request by mistake
  'OTHER',                 // No longer required
] as const;

export type RequesterWithdrawReason = (typeof REQUESTER_WITHDRAW_REASONS)[number];

export const WITHDRAW_REASON_METADATA: Record<
  RequesterWithdrawReason,
  { label: string; description: string }
> = {
  FOUND_ALTERNATIVE_CARE: {
    label: 'Found Alternative Care',
    description: 'Secured care coverage through another professional provider',
  },
  ARRANGED_FAMILY_CARE: {
    label: 'Arranged Family Care',
    description: 'Family circle member will provide personal care coverage',
  },
  SCHEDULE_CHANGED: {
    label: 'Schedule Changed',
    description: 'Care timing, dates, or frequency needs have changed',
  },
  ACCIDENTAL_REQUEST: {
    label: 'Accidental Request',
    description: 'Care request was submitted by mistake',
  },
  OTHER: {
    label: 'Other',
    description: 'Care request is no longer required',
  },
};

// ─── REQUEST LIFECYCLE, RATES & SCHEDULES ────────────────────────────────────

export const CARE_REQUEST_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'WITHDRAWN',
  'EXPIRED',
] as const;

export type CareRequestStatus = (typeof CARE_REQUEST_STATUSES)[number];

export const CARE_REQUEST_RATE_TYPES = ['HOURLY', 'DAILY'] as const;
export type CareRequestRateType = (typeof CARE_REQUEST_RATE_TYPES)[number];

export const CARE_REQUEST_SCHEDULE_TYPES = [
  'RECURRING',
  'DATE_RANGE',
  'FLEXIBLE',
  'ONE_TIME',
] as const;

export type CareRequestScheduleType = (typeof CARE_REQUEST_SCHEDULE_TYPES)[number];

export const CARE_REQUEST_EXPIRY_HOURS = 72;

// ─── TYPE GUARDS & VALIDATORS ────────────────────────────────────────────────

export function isCanonicalShift(val: unknown): val is CanonicalShift {
  return typeof val === 'string' && (CANONICAL_SHIFTS as readonly string[]).includes(val);
}

export function isCanonicalCapability(val: unknown): val is CanonicalCapability {
  return typeof val === 'string' && (CANONICAL_CAPABILITIES as readonly string[]).includes(val);
}

export function isCaregiverDeclineReason(val: unknown): val is CaregiverDeclineReason {
  return typeof val === 'string' && (CAREGIVER_DECLINE_REASONS as readonly string[]).includes(val);
}

export function isRequesterWithdrawReason(val: unknown): val is RequesterWithdrawReason {
  return typeof val === 'string' && (REQUESTER_WITHDRAW_REASONS as readonly string[]).includes(val);
}

export function isCareRequestStatus(val: unknown): val is CareRequestStatus {
  return typeof val === 'string' && (CARE_REQUEST_STATUSES as readonly string[]).includes(val);
}

export function isCareRequestRateType(val: unknown): val is CareRequestRateType {
  return typeof val === 'string' && (CARE_REQUEST_RATE_TYPES as readonly string[]).includes(val);
}

export function isCareRequestScheduleType(val: unknown): val is CareRequestScheduleType {
  return typeof val === 'string' && (CARE_REQUEST_SCHEDULE_TYPES as readonly string[]).includes(val);
}
