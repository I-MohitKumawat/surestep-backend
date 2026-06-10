"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../../shared/middleware/authenticate");
const response_1 = require("../../shared/utils/response");
const AppError_1 = require("../../shared/errors/AppError");
const config_1 = __importDefault(require("../../db/config"));
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// ─── Subscriptions ────────────────────────────────────────────────────────────
/** POST /subscriptions — Family creates/upgrades subscription for a patient */
router.post('/subscriptions', (0, authenticate_1.requireRoles)('FAMILY'), (0, response_1.asyncHandler)(async (req, res) => {
    const { patient_user_id, tier, razorpay_sub_id } = req.body;
    if (!patient_user_id || !tier) {
        throw new AppError_1.AppError('VALIDATION_ERROR', 'patient_user_id and tier are required', 422);
    }
    const result = await config_1.default.query(`INSERT INTO subscriptions (family_user_id, patient_user_id, tier, razorpay_sub_id, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       ON CONFLICT (family_user_id, patient_user_id)
         DO UPDATE SET tier = EXCLUDED.tier,
                       razorpay_sub_id = EXCLUDED.razorpay_sub_id,
                       status = 'ACTIVE'
       RETURNING *`, [req.user.id, patient_user_id, tier, razorpay_sub_id ?? null]);
    (0, response_1.created)(res, { subscription: result.rows[0] });
}));
/** GET /subscriptions/my — Family lists their active subscriptions */
router.get('/subscriptions/my', (0, authenticate_1.requireRoles)('FAMILY'), (0, response_1.asyncHandler)(async (req, res) => {
    const result = await config_1.default.query(`SELECT s.*, u.name as patient_name, u.photo_url as patient_photo
       FROM subscriptions s JOIN users u ON u.id = s.patient_user_id
       WHERE s.family_user_id = $1 ORDER BY s.created_at DESC`, [req.user.id]);
    (0, response_1.ok)(res, { subscriptions: result.rows });
}));
// ─── Caregiver Payments ───────────────────────────────────────────────────────
/** POST /caregiver/:caregiverId — Family initiates caregiver payment */
router.post('/caregiver/:caregiverId', (0, authenticate_1.requireRoles)('FAMILY'), (0, response_1.asyncHandler)(async (req, res) => {
    const { patient_id, amount, razorpay_order_id } = req.body;
    if (!patient_id || !amount) {
        throw new AppError_1.AppError('VALIDATION_ERROR', 'patient_id and amount are required', 422);
    }
    // Platform commission: 10%
    const commission = parseFloat((amount * 0.10).toFixed(2));
    const result = await config_1.default.query(`INSERT INTO caregiver_payments
         (from_family_id, to_caregiver_id, patient_id, amount, commission_amount,
          razorpay_order_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,'PENDING') RETURNING *`, [req.user.id, req.params.caregiverId, patient_id, amount, commission, razorpay_order_id ?? null]);
    (0, response_1.created)(res, { payment: result.rows[0] });
}));
/** PATCH /caregiver/payments/:paymentId/complete — Mark payment completed (webhook use) */
router.patch('/caregiver/payments/:paymentId/complete', (0, response_1.asyncHandler)(async (req, res) => {
    const result = await config_1.default.query(`UPDATE caregiver_payments SET status = 'COMPLETED', paid_at = NOW()
       WHERE id = $1 RETURNING *`, [req.params.paymentId]);
    if (!result.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Payment not found', 404);
    (0, response_1.ok)(res, { payment: result.rows[0] });
}));
/** GET /caregiver/my-earnings — Caregiver views their payment history */
router.get('/caregiver/my-earnings', (0, authenticate_1.requireRoles)('CAREGIVER'), (0, response_1.asyncHandler)(async (req, res) => {
    const result = await config_1.default.query(`SELECT cp.*, u.name as family_name, p.name as patient_name
       FROM caregiver_payments cp
       JOIN users u ON u.id = cp.from_family_id
       JOIN users p ON p.id  = cp.patient_id
       WHERE cp.to_caregiver_id = $1 ORDER BY cp.created_at DESC`, [req.user.id]);
    (0, response_1.ok)(res, { payments: result.rows });
}));
// ─── Caregiver Discovery ──────────────────────────────────────────────────────
/**
 * GET /caregivers/discover
 * Public caregiver profile search. Returns is_discoverable=TRUE caregivers.
 * Query params: city, specialization, availability, max_rate
 */
router.get('/caregivers/discover', (0, response_1.asyncHandler)(async (req, res) => {
    const { city, specialization, availability, max_rate, limit = '20', cursor } = req.query;
    let query = `
      SELECT cp.*, u.name, u.photo_url, u.city, u.preferred_language
      FROM caregiver_profiles cp
      JOIN users u ON u.id = cp.user_id
      WHERE cp.is_discoverable = TRUE AND cp.is_verified = TRUE
        AND u.is_active = TRUE AND u.deleted_at IS NULL
    `;
    const params = [];
    let i = 1;
    if (city) {
        query += ` AND u.city ILIKE $${i++}`;
        params.push(`%${city}%`);
    }
    if (specialization) {
        query += ` AND $${i++} = ANY(cp.specializations)`;
        params.push(specialization);
    }
    if (availability) {
        query += ` AND $${i++} = ANY(cp.availability_types)`;
        params.push(availability);
    }
    if (max_rate) {
        query += ` AND (cp.hourly_rate IS NULL OR cp.hourly_rate <= $${i++})`;
        params.push(parseFloat(max_rate));
    }
    if (cursor) {
        query += ` AND cp.rating < $${i++}`;
        params.push(parseFloat(cursor));
    }
    query += ` ORDER BY cp.rating DESC NULLS LAST, cp.rating_count DESC LIMIT $${i}`;
    params.push(parseInt(limit) + 1);
    const result = await config_1.default.query(query, params);
    const has_more = result.rows.length > parseInt(limit);
    const caregivers = has_more ? result.rows.slice(0, parseInt(limit)) : result.rows;
    (0, response_1.ok)(res, { caregivers, has_more });
}));
exports.default = router;
//# sourceMappingURL=payments.router.js.map