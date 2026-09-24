import { z } from 'zod';
import {
  CANONICAL_SHIFTS,
  CanonicalShift,
  CANONICAL_CAPABILITIES,
  CanonicalCapability,
  CARE_REQUEST_STATUSES,
  CareRequestStatus,
  CARE_REQUEST_RATE_TYPES,
  CareRequestRateType,
  CARE_REQUEST_SCHEDULE_TYPES,
  CareRequestScheduleType,
  CAREGIVER_DECLINE_REASONS,
  CaregiverDeclineReason,
  REQUESTER_WITHDRAW_REASONS,
  RequesterWithdrawReason,
} from '../../shared/constants/care.constants';

// Re-export all canonical domain constants, types, and validators
export * from '../../shared/constants/care.constants';

// ─── ZOD SCHEMAS ─────────────────────────────────────────────────────────────

export const CreateCareRequestSchema = z
  .object({
    patientId: z.string().uuid({ message: 'Valid patientId UUID is required' }),
    caregiverId: z.string().uuid({ message: 'Valid caregiverId UUID is required' }),
    scheduleType: z.enum(CARE_REQUEST_SCHEDULE_TYPES),
    requestedShifts: z.array(z.enum(CANONICAL_SHIFTS)).optional().nullable(),
    daysOfWeek: z.array(z.number().int().min(0).max(7)).optional().nullable(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be in YYYY-MM-DD format' }),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must be in YYYY-MM-DD format' }).optional().nullable(),
    requestedCapabilities: z.array(z.enum(CANONICAL_CAPABILITIES)).optional().default([]),
    proposedRateType: z.enum(CARE_REQUEST_RATE_TYPES),
    proposedRateInr: z.coerce.number().positive({ message: 'proposedRateInr must be greater than 0' }),
    careContextNotes: z.string().max(1000, { message: 'careContextNotes cannot exceed 1000 characters' }).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.scheduleType === 'RECURRING') {
      if (!val.requestedShifts || val.requestedShifts.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'requestedShifts is required for RECURRING schedule',
          path: ['requestedShifts'],
        });
      }
      if (!val.daysOfWeek || val.daysOfWeek.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'daysOfWeek is required for RECURRING schedule',
          path: ['daysOfWeek'],
        });
      }
      if (val.endDate != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'endDate must be null or omitted for RECURRING schedule',
          path: ['endDate'],
        });
      }
    }

    if (val.scheduleType === 'DATE_RANGE') {
      if (!val.requestedShifts || val.requestedShifts.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'requestedShifts is required for DATE_RANGE schedule',
          path: ['requestedShifts'],
        });
      }
      if (!val.endDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'endDate is required for DATE_RANGE schedule',
          path: ['endDate'],
        });
      }
    }

    if (val.scheduleType === 'ONE_TIME') {
      if (!val.requestedShifts || val.requestedShifts.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'requestedShifts is required for ONE_TIME schedule',
          path: ['requestedShifts'],
        });
      }
      if (val.endDate != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'endDate must be null or omitted for ONE_TIME schedule',
          path: ['endDate'],
        });
      }
      if (val.daysOfWeek != null && val.daysOfWeek.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'daysOfWeek must be null or omitted for ONE_TIME schedule',
          path: ['daysOfWeek'],
        });
      }
    }

    if (val.scheduleType === 'FLEXIBLE') {
      if (val.daysOfWeek != null && val.daysOfWeek.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'daysOfWeek must be null or omitted for FLEXIBLE schedule',
          path: ['daysOfWeek'],
        });
      }
    }

    if (val.endDate && val.startDate && val.endDate < val.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'endDate must not be before startDate',
        path: ['endDate'],
      });
    }
  });

export type CreateCareRequestInput = z.input<typeof CreateCareRequestSchema>;
export type CreateCareRequestOutput = z.infer<typeof CreateCareRequestSchema>;

export const DeclineCareRequestSchema = z.object({
  declineReason: z.enum(CAREGIVER_DECLINE_REASONS, {
    message: `declineReason must be one of: ${CAREGIVER_DECLINE_REASONS.join(', ')}`,
  }),
  responseNotes: z.string().max(500, { message: 'responseNotes cannot exceed 500 characters' }).optional().nullable(),
});

export type DeclineCareRequestInput = z.infer<typeof DeclineCareRequestSchema>;

export const WithdrawCareRequestSchema = z.object({
  withdrawReason: z.enum(REQUESTER_WITHDRAW_REASONS, {
    message: `withdrawReason must be one of: ${REQUESTER_WITHDRAW_REASONS.join(', ')}`,
  }),
  responseNotes: z.string().max(500, { message: 'responseNotes cannot exceed 500 characters' }).optional().nullable(),
});

export type WithdrawCareRequestInput = z.infer<typeof WithdrawCareRequestSchema>;

export const IncomingCareRequestQuerySchema = z.object({
  status: z.enum([...CARE_REQUEST_STATUSES, 'ALL']).optional().default('PENDING'),
});

export const OutgoingCareRequestQuerySchema = z.object({
  patientId: z.string().uuid().optional(),
  status: z.enum([...CARE_REQUEST_STATUSES, 'ALL']).optional(),
});

// ─── DATA MODELS ─────────────────────────────────────────────────────────────

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
  fullName?: string; // Revealed only post-acceptance
  photoUrl: string | null;
  approximateAge: number | null;
  city: string | null;
  phone?: string | null; // Revealed only post-acceptance
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
  phone?: string | null; // Revealed only post-acceptance
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
