/**
 * Notifications / Alerts Router
 * Handles: geofence alert queries, alert acknowledgement, SOS trigger,
 * and the cross-patient caregiver alert feed.
 *
 * POST /api/v1/alerts/sos/patient/:patientId   — PATIENT
 * GET  /api/v1/alerts/patient/:id              — CAREGIVER, FAMILY
 * POST /api/v1/alerts/:id/acknowledge          — CAREGIVER, FAMILY
 * POST /api/v1/alerts/:id/respond              — CAREGIVER, FAMILY
 * GET  /api/v1/alerts/caregiver/feed           — CAREGIVER
 */
declare const router: import("express-serve-static-core").Router;
export default router;
//# sourceMappingURL=notifications.router.d.ts.map