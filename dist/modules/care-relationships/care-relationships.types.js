"use strict";
/**
 * SureStep — modules/care-relationships/care-relationships.types.ts
 *
 * Types and canonical constants for Phase 3A: End Care Relationship lifecycle.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CANONICAL_RESIGNATION_STATUSES = exports.CANONICAL_RESIGNATION_REASONS = exports.CANONICAL_END_REASONS = void 0;
exports.CANONICAL_END_REASONS = [
    'CARE_NO_LONGER_REQUIRED',
    'FAMILY_TAKING_OVER',
    'FOUND_DIFFERENT_CARE',
    'CAREGIVER_NOT_A_GOOD_FIT',
    'SCHEDULE_CHANGED',
    'CAREGIVER_REQUESTED_END',
    'OTHER',
];
// ─── Phase 3B: Caregiver Resignation Types & Canonical Constants ─────────────
exports.CANONICAL_RESIGNATION_REASONS = [
    'PERSONAL_CIRCUMSTANCES',
    'SCHEDULE_CONFLICT',
    'OUTSIDE_SERVICE_AREA',
    'CARE_NEEDS_CHANGED',
    'CAPACITY_CONSTRAINT',
    'ROLE_NO_LONGER_SUITABLE',
    'OTHER',
];
exports.CANONICAL_RESIGNATION_STATUSES = [
    'PENDING',
    'ACCEPTED',
    'WITHDRAWN',
    'DECLINED',
    'EXPIRED',
];
//# sourceMappingURL=care-relationships.types.js.map