import { z } from 'zod';
import { CanonicalShift, CanonicalCapability, CareRequestStatus, CareRequestRateType, CareRequestScheduleType, CaregiverDeclineReason, RequesterWithdrawReason } from '../../shared/constants/care.constants';
export * from '../../shared/constants/care.constants';
export declare const CreateCareRequestSchema: z.ZodObject<{
    patientId: z.ZodString;
    caregiverId: z.ZodString;
    scheduleType: z.ZodEnum<{
        RECURRING: "RECURRING";
        DATE_RANGE: "DATE_RANGE";
        FLEXIBLE: "FLEXIBLE";
        ONE_TIME: "ONE_TIME";
    }>;
    requestedShifts: z.ZodNullable<z.ZodOptional<z.ZodArray<z.ZodEnum<{
        DAY_SHIFT: "DAY_SHIFT";
        EVENING_SHIFT: "EVENING_SHIFT";
        OVERNIGHT: "OVERNIGHT";
        LIVE_IN: "LIVE_IN";
        WEEKEND: "WEEKEND";
        FULL_TIME: "FULL_TIME";
        PART_TIME: "PART_TIME";
        RESPITE: "RESPITE";
        ON_CALL: "ON_CALL";
    }>>>>;
    daysOfWeek: z.ZodNullable<z.ZodOptional<z.ZodArray<z.ZodNumber>>>;
    startDate: z.ZodString;
    endDate: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    requestedCapabilities: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodEnum<{
        hygiene_bathing: "hygiene_bathing";
        mobility_transfers: "mobility_transfers";
        medication_prompts: "medication_prompts";
        meal_prep_feeding: "meal_prep_feeding";
        wandering_prevention: "wandering_prevention";
        behavioral_reassurance: "behavioral_reassurance";
        cognitive_stimulation: "cognitive_stimulation";
        bedridden_care: "bedridden_care";
        incontinence_care: "incontinence_care";
        vitals_monitoring: "vitals_monitoring";
    }>>>>;
    proposedRateType: z.ZodEnum<{
        HOURLY: "HOURLY";
        DAILY: "DAILY";
    }>;
    proposedRateInr: z.ZodCoercedNumber<unknown>;
    careContextNotes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export type CreateCareRequestInput = z.input<typeof CreateCareRequestSchema>;
export type CreateCareRequestOutput = z.infer<typeof CreateCareRequestSchema>;
export declare const DeclineCareRequestSchema: z.ZodObject<{
    declineReason: z.ZodEnum<{
        SCHEDULE_CONFLICT: "SCHEDULE_CONFLICT";
        OUTSIDE_SERVICE_AREA: "OUTSIDE_SERVICE_AREA";
        CARE_NEEDS_MISMATCH: "CARE_NEEDS_MISMATCH";
        CAPACITY_FULL: "CAPACITY_FULL";
        RATE_DISAGREEMENT: "RATE_DISAGREEMENT";
        OTHER: "OTHER";
    }>;
    responseNotes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export type DeclineCareRequestInput = z.infer<typeof DeclineCareRequestSchema>;
export declare const WithdrawCareRequestSchema: z.ZodObject<{
    withdrawReason: z.ZodEnum<{
        OTHER: "OTHER";
        FOUND_ALTERNATIVE_CARE: "FOUND_ALTERNATIVE_CARE";
        ARRANGED_FAMILY_CARE: "ARRANGED_FAMILY_CARE";
        SCHEDULE_CHANGED: "SCHEDULE_CHANGED";
        ACCIDENTAL_REQUEST: "ACCIDENTAL_REQUEST";
    }>;
    responseNotes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export type WithdrawCareRequestInput = z.infer<typeof WithdrawCareRequestSchema>;
export declare const IncomingCareRequestQuerySchema: z.ZodObject<{
    status: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        PENDING: "PENDING";
        ACCEPTED: "ACCEPTED";
        DECLINED: "DECLINED";
        WITHDRAWN: "WITHDRAWN";
        EXPIRED: "EXPIRED";
        ALL: "ALL";
    }>>>;
}, z.core.$strip>;
export declare const OutgoingCareRequestQuerySchema: z.ZodObject<{
    patientId: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<{
        PENDING: "PENDING";
        ACCEPTED: "ACCEPTED";
        DECLINED: "DECLINED";
        WITHDRAWN: "WITHDRAWN";
        EXPIRED: "EXPIRED";
        ALL: "ALL";
    }>>;
}, z.core.$strip>;
export interface CareRequestRow {
    id: string;
    patient_id: string;
    requester_id: string;
    caregiver_id: string;
    status: CareRequestStatus;
    schedule_type: CareRequestScheduleType;
    requested_shifts: CanonicalShift[] | null;
    days_of_week: number[] | null;
    start_date: string;
    end_date: string | null;
    requested_capabilities: CanonicalCapability[];
    proposed_rate_type: CareRequestRateType;
    proposed_rate_inr: string | number;
    care_context_notes: string | null;
    decline_reason: CaregiverDeclineReason | null;
    withdraw_reason: RequesterWithdrawReason | null;
    response_notes: string | null;
    resulting_relationship_id: string | null;
    created_at: string;
    updated_at: string;
    responded_at: string | null;
    expires_at: string;
}
export interface CareRequestPatientSummary {
    id: string;
    firstName: string;
    fullName?: string;
    photoUrl: string | null;
    approximateAge: number | null;
    city: string | null;
    phone?: string | null;
}
export interface CareRequestRequesterSummary {
    id: string;
    name: string;
    relationshipType?: string | null;
}
export interface CareRequestCaregiverSummary {
    id: string;
    name: string;
    photoUrl: string | null;
    professionalRole: string | null;
    rating: number | null;
    ratingCount: number;
    city: string | null;
    phone?: string | null;
}
export interface CareRequestResponse {
    id: string;
    patientId: string;
    requesterId: string;
    caregiverId: string;
    status: CareRequestStatus;
    scheduleType: CareRequestScheduleType;
    requestedShifts: CanonicalShift[] | null;
    daysOfWeek: number[] | null;
    startDate: string;
    endDate: string | null;
    requestedCapabilities: CanonicalCapability[];
    proposedRateType: CareRequestRateType;
    proposedRateInr: number;
    careContextNotes: string | null;
    declineReason: CaregiverDeclineReason | null;
    withdrawReason: RequesterWithdrawReason | null;
    responseNotes: string | null;
    resultingRelationshipId: string | null;
    createdAt: string;
    updatedAt: string;
    respondedAt: string | null;
    expiresAt: string;
    isExpired: boolean;
    patient?: CareRequestPatientSummary;
    requester?: CareRequestRequesterSummary;
    caregiver?: CareRequestCaregiverSummary;
}
//# sourceMappingURL=care-requests.types.d.ts.map