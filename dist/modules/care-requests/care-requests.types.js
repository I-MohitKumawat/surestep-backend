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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutgoingCareRequestQuerySchema = exports.IncomingCareRequestQuerySchema = exports.WithdrawCareRequestSchema = exports.DeclineCareRequestSchema = exports.CreateCareRequestSchema = void 0;
const zod_1 = require("zod");
const care_constants_1 = require("../../shared/constants/care.constants");
// Re-export all canonical domain constants, types, and validators
__exportStar(require("../../shared/constants/care.constants"), exports);
// ─── ZOD SCHEMAS ─────────────────────────────────────────────────────────────
exports.CreateCareRequestSchema = zod_1.z
    .object({
    patientId: zod_1.z.string().uuid({ message: 'Valid patientId UUID is required' }),
    caregiverId: zod_1.z.string().uuid({ message: 'Valid caregiverId UUID is required' }),
    scheduleType: zod_1.z.enum(care_constants_1.CARE_REQUEST_SCHEDULE_TYPES),
    requestedShifts: zod_1.z.array(zod_1.z.enum(care_constants_1.CANONICAL_SHIFTS)).optional().nullable(),
    daysOfWeek: zod_1.z.array(zod_1.z.number().int().min(0).max(7)).optional().nullable(),
    startDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be in YYYY-MM-DD format' }),
    endDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must be in YYYY-MM-DD format' }).optional().nullable(),
    requestedCapabilities: zod_1.z.array(zod_1.z.enum(care_constants_1.CANONICAL_CAPABILITIES)).optional().default([]),
    proposedRateType: zod_1.z.enum(care_constants_1.CARE_REQUEST_RATE_TYPES),
    proposedRateInr: zod_1.z.coerce.number().positive({ message: 'proposedRateInr must be greater than 0' }),
    careContextNotes: zod_1.z.string().max(1000, { message: 'careContextNotes cannot exceed 1000 characters' }).optional().nullable(),
})
    .superRefine((val, ctx) => {
    if (val.scheduleType === 'RECURRING') {
        if (!val.requestedShifts || val.requestedShifts.length === 0) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: 'requestedShifts is required for RECURRING schedule',
                path: ['requestedShifts'],
            });
        }
        if (!val.daysOfWeek || val.daysOfWeek.length === 0) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: 'daysOfWeek is required for RECURRING schedule',
                path: ['daysOfWeek'],
            });
        }
    }
    if (val.scheduleType === 'DATE_RANGE') {
        if (!val.requestedShifts || val.requestedShifts.length === 0) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: 'requestedShifts is required for DATE_RANGE schedule',
                path: ['requestedShifts'],
            });
        }
        if (!val.endDate) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: 'endDate is required for DATE_RANGE schedule',
                path: ['endDate'],
            });
        }
    }
    if (val.scheduleType === 'ONE_TIME') {
        if (!val.requestedShifts || val.requestedShifts.length === 0) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: 'requestedShifts is required for ONE_TIME schedule',
                path: ['requestedShifts'],
            });
        }
    }
    if (val.endDate && val.startDate && val.endDate < val.startDate) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'endDate must not be before startDate',
            path: ['endDate'],
        });
    }
});
exports.DeclineCareRequestSchema = zod_1.z.object({
    declineReason: zod_1.z.enum(care_constants_1.CAREGIVER_DECLINE_REASONS, {
        message: `declineReason must be one of: ${care_constants_1.CAREGIVER_DECLINE_REASONS.join(', ')}`,
    }),
    responseNotes: zod_1.z.string().max(500, { message: 'responseNotes cannot exceed 500 characters' }).optional().nullable(),
});
exports.WithdrawCareRequestSchema = zod_1.z.object({
    withdrawReason: zod_1.z.enum(care_constants_1.REQUESTER_WITHDRAW_REASONS, {
        message: `withdrawReason must be one of: ${care_constants_1.REQUESTER_WITHDRAW_REASONS.join(', ')}`,
    }),
    responseNotes: zod_1.z.string().max(500, { message: 'responseNotes cannot exceed 500 characters' }).optional().nullable(),
});
exports.IncomingCareRequestQuerySchema = zod_1.z.object({
    status: zod_1.z.enum([...care_constants_1.CARE_REQUEST_STATUSES, 'ALL']).optional().default('PENDING'),
});
exports.OutgoingCareRequestQuerySchema = zod_1.z.object({
    patientId: zod_1.z.string().uuid().optional(),
    status: zod_1.z.enum([...care_constants_1.CARE_REQUEST_STATUSES, 'ALL']).optional(),
});
//# sourceMappingURL=care-requests.types.js.map