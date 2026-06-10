/**
 * SureStep — modules/family/family.router.ts
 *
 * Family-specific read APIs and care-circle management.
 * All routes require authentication. Most require FAMILY role or
 * a confirmed FAMILY relationship with the patient.
 *
 * GET  /api/v1/family/my-patient          — patient summary for this family member
 * GET  /api/v1/family/care-circle         — all care circle members for my patient
 * GET  /api/v1/family/care-notes          — care notes for my patient
 * POST /api/v1/family/care-notes          — post a new care note
 * POST /api/v1/family/invite-code/redeem  — redeem a 6-char invite code
 * POST /api/v1/family/request-access      — request by patient phone number
 * GET  /api/v1/family/profile             — get family profile / notification prefs
 * PATCH /api/v1/family/profile            — update notification prefs
 */
declare const router: import("express-serve-static-core").Router;
export default router;
//# sourceMappingURL=family.router.d.ts.map