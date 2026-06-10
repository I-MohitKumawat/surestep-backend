/**
 * Payments Router
 * Handles: family subscriptions (Razorpay), caregiver payments & commission,
 * ratings, and caregiver discovery search.
 *
 * POST   /api/v1/payments/subscriptions                    — FAMILY
 * GET    /api/v1/payments/subscriptions/my                 — FAMILY
 * POST   /api/v1/payments/caregiver/:caregiverId           — FAMILY
 * GET    /api/v1/payments/caregiver/my-earnings            — CAREGIVER
 * GET    /api/v1/payments/caregivers/discover              — All (public profile search)
 */
declare const router: import("express-serve-static-core").Router;
export default router;
//# sourceMappingURL=payments.router.d.ts.map