/**
 * SureStep — modules/family/family.router.ts
 *
 * Family profile and notification-preference APIs.
 * All routes require authentication and the FAMILY role.
 *
 * GET  /api/v1/family/profile             — get family profile / notification prefs
 * PATCH /api/v1/family/profile            — update notification prefs
 *
 * Patient summaries and Care Circle membership are canonical Care Circle
 * read surfaces (GET /care-circles/my, GET /care-circles/:circleId).
 */
declare const router: import("express-serve-static-core").Router;
export default router;
//# sourceMappingURL=family.router.d.ts.map