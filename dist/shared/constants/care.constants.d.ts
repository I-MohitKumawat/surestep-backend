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
export declare const CANONICAL_SHIFTS: readonly ["DAY_SHIFT", "EVENING_SHIFT", "OVERNIGHT", "LIVE_IN", "WEEKEND", "FULL_TIME", "PART_TIME", "RESPITE", "ON_CALL"];
export type CanonicalShift = (typeof CANONICAL_SHIFTS)[number];
export declare const SHIFT_METADATA: Record<CanonicalShift, {
    label: string;
    icon: string;
    description: string;
}>;
export declare const CANONICAL_CAPABILITIES: readonly ["hygiene_bathing", "mobility_transfers", "medication_prompts", "meal_prep_feeding", "wandering_prevention", "behavioral_reassurance", "cognitive_stimulation", "bedridden_care", "incontinence_care", "vitals_monitoring"];
export type CanonicalCapability = (typeof CANONICAL_CAPABILITIES)[number];
export declare const CAPABILITY_METADATA: Record<CanonicalCapability, {
    label: string;
    icon: string;
    description: string;
}>;
export declare const CAREGIVER_DECLINE_REASONS: readonly ["SCHEDULE_CONFLICT", "OUTSIDE_SERVICE_AREA", "CARE_NEEDS_MISMATCH", "CAPACITY_FULL", "RATE_DISAGREEMENT", "OTHER"];
export type CaregiverDeclineReason = (typeof CAREGIVER_DECLINE_REASONS)[number];
export declare const DECLINE_REASON_METADATA: Record<CaregiverDeclineReason, {
    label: string;
    description: string;
}>;
export declare const REQUESTER_WITHDRAW_REASONS: readonly ["FOUND_ALTERNATIVE_CARE", "ARRANGED_FAMILY_CARE", "SCHEDULE_CHANGED", "ACCIDENTAL_REQUEST", "OTHER"];
export type RequesterWithdrawReason = (typeof REQUESTER_WITHDRAW_REASONS)[number];
export declare const WITHDRAW_REASON_METADATA: Record<RequesterWithdrawReason, {
    label: string;
    description: string;
}>;
export declare const CARE_REQUEST_STATUSES: readonly ["PENDING", "ACCEPTED", "DECLINED", "WITHDRAWN", "EXPIRED"];
export type CareRequestStatus = (typeof CARE_REQUEST_STATUSES)[number];
export declare const CARE_REQUEST_RATE_TYPES: readonly ["HOURLY", "DAILY"];
export type CareRequestRateType = (typeof CARE_REQUEST_RATE_TYPES)[number];
export declare const CARE_REQUEST_SCHEDULE_TYPES: readonly ["RECURRING", "DATE_RANGE", "FLEXIBLE", "ONE_TIME"];
export type CareRequestScheduleType = (typeof CARE_REQUEST_SCHEDULE_TYPES)[number];
export declare const CARE_REQUEST_EXPIRY_HOURS = 72;
export declare function isCanonicalShift(val: unknown): val is CanonicalShift;
export declare function isCanonicalCapability(val: unknown): val is CanonicalCapability;
export declare function isCaregiverDeclineReason(val: unknown): val is CaregiverDeclineReason;
export declare function isRequesterWithdrawReason(val: unknown): val is RequesterWithdrawReason;
export declare function isCareRequestStatus(val: unknown): val is CareRequestStatus;
export declare function isCareRequestRateType(val: unknown): val is CareRequestRateType;
export declare function isCareRequestScheduleType(val: unknown): val is CareRequestScheduleType;
//# sourceMappingURL=care.constants.d.ts.map