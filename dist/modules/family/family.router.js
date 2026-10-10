"use strict";
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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../../shared/middleware/authenticate");
const response_1 = require("../../shared/utils/response");
const AppError_1 = require("../../shared/errors/AppError");
const config_1 = __importDefault(require("../../db/config"));
const relationships_service_1 = require("../relationships/relationships.service");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// ─── Helper: resolve patientId for the authenticated family member ────────────
async function resolveFamilyPatientId(userId) {
    const rel = await config_1.default.query(`SELECT patient_user_id FROM patient_relationships
     WHERE related_user_id = $1 AND status = 'CONFIRMED' LIMIT 1`, [userId]);
    if (!rel.rows[0])
        throw new AppError_1.AppError('RELATIONSHIP_REQUIRED', 'No linked patient found. Please link to a patient first.', 403);
    return rel.rows[0].patient_user_id;
}
// ─── My Patient Summary ───────────────────────────────────────────────────────
router.get('/my-patient', (0, authenticate_1.requireRoles)('FAMILY'), (0, response_1.asyncHandler)(async (req, res) => {
    const patient = await (0, relationships_service_1.getFamilyPatient)(req.user.id);
    if (!patient)
        throw new AppError_1.AppError('NOT_FOUND', 'No linked patient found', 404);
    (0, response_1.ok)(res, { patient });
}));
// ─── Care Circle ──────────────────────────────────────────────────────────────
router.get('/care-circle', (0, authenticate_1.requireRoles)('FAMILY'), (0, response_1.asyncHandler)(async (req, res) => {
    const patientId = await resolveFamilyPatientId(req.user.id);
    const members = await (0, relationships_service_1.getCareCircle)(patientId);
    (0, response_1.ok)(res, { members });
}));
// ─── Care Notes ───────────────────────────────────────────────────────────────
const CareNoteSchema = zod_1.z.object({
    content: zod_1.z.string().min(5).max(1000),
    is_pinned: zod_1.z.boolean().optional(),
});
router.get('/care-notes', (0, authenticate_1.requireRoles)('FAMILY'), (0, response_1.asyncHandler)(async (req, res) => {
    const patientId = await resolveFamilyPatientId(req.user.id);
    const result = await config_1.default.query(`SELECT cn.*, u.name as author_name, u.photo_url as author_photo
       FROM care_notes cn JOIN users u ON u.id = cn.author_id
       WHERE cn.patient_id = $1
       ORDER BY cn.is_pinned DESC, cn.created_at DESC
       LIMIT 50`, [patientId]);
    (0, response_1.ok)(res, { notes: result.rows });
}));
router.post('/care-notes', (0, authenticate_1.requireRoles)('FAMILY'), (0, response_1.asyncHandler)(async (req, res) => {
    const { content, is_pinned } = CareNoteSchema.parse(req.body);
    const patientId = await resolveFamilyPatientId(req.user.id);
    const result = await config_1.default.query(`INSERT INTO care_notes (patient_id, author_id, content, is_pinned) VALUES ($1, $2, $3, $4) RETURNING *`, [patientId, req.user.id, content, is_pinned ?? false]);
    (0, response_1.created)(res, { note: result.rows[0] });
}));
router.delete('/care-notes/:id', (0, authenticate_1.requireRoles)('FAMILY'), (0, response_1.asyncHandler)(async (req, res) => {
    const result = await config_1.default.query(`DELETE FROM care_notes WHERE id = $1 AND author_id = $2 RETURNING id`, [req.params.id, req.user.id]);
    if (!result.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Note not found', 404);
    (0, response_1.ok)(res, { deleted: true });
}));
// ─── Invite Code Validation & Redemption ───────────────────────────────────────
router.post('/invite-code/validate', (0, authenticate_1.requireRoles)('FAMILY'), (0, response_1.asyncHandler)(async (req, res) => {
    const { code } = zod_1.z.object({ code: zod_1.z.string().min(4).max(10) }).parse(req.body);
    const inv = await config_1.default.query(`SELECT ic.code, ic.expires_at, u.name as patient_name
       FROM invite_codes ic
       JOIN users u ON u.id = ic.patient_id
       WHERE ic.code = $1 AND ic.used_at IS NULL AND ic.expires_at > NOW()`, [code.toUpperCase()]);
    if (!inv.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Invalid or expired invite code', 404);
    (0, response_1.ok)(res, { valid: true, patientName: inv.rows[0].patient_name, code: inv.rows[0].code });
}));
router.post('/invite-code/redeem', (0, authenticate_1.requireRoles)('FAMILY'), (0, response_1.asyncHandler)(async (req, res) => {
    const { code } = zod_1.z.object({ code: zod_1.z.string().min(4).max(10) }).parse(req.body);
    const relationship = await (0, relationships_service_1.redeemInviteCode)(code, req.user.id);
    try {
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        io.to(`patient:${relationship.patient_user_id}`).emit('relationship:change', { relationship });
        const { default: pool } = await Promise.resolve().then(() => __importStar(require('../../db/config')));
        const caregivers = await pool.query(`SELECT related_user_id FROM patient_relationships 
         WHERE patient_user_id = $1 AND relationship_type = 'CAREGIVER' AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`, [relationship.patient_user_id]);
        for (const cg of caregivers.rows) {
            io.to(`user:${cg.related_user_id}`).emit('relationship:change', { relationship });
        }
    }
    catch (_) { }
    (0, response_1.ok)(res, { relationship, message: 'Successfully joined care circle' });
}));
// ─── Request Access by Phone ──────────────────────────────────────────────────
router.post('/request-access', (0, authenticate_1.requireRoles)('FAMILY'), (0, response_1.asyncHandler)(async (req, res) => {
    const { patient_phone } = zod_1.z.object({ patient_phone: zod_1.z.string().min(10) }).parse(req.body);
    const relationship = await (0, relationships_service_1.requestAccessByPhone)(req.user.id, patient_phone);
    try {
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        io.to(`patient:${relationship.patient_user_id}`).emit('relationship:change', { relationship });
        const { default: pool } = await Promise.resolve().then(() => __importStar(require('../../db/config')));
        const caregivers = await pool.query(`SELECT related_user_id FROM patient_relationships 
         WHERE patient_user_id = $1 AND relationship_type = 'CAREGIVER' AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`, [relationship.patient_user_id]);
        for (const cg of caregivers.rows) {
            io.to(`user:${cg.related_user_id}`).emit('relationship:change', { relationship });
        }
    }
    catch (_) { }
    (0, response_1.created)(res, { relationship, message: 'Access requested — awaiting care circle approval' });
}));
// ─── My Access Status ─────────────────────────────────────────────────────────
// Check if the family member has a pending request (for polling on LinkPatient screen)
router.get('/access-status', (0, authenticate_1.requireRoles)('FAMILY'), (0, response_1.asyncHandler)(async (req, res) => {
    const result = await config_1.default.query(`SELECT pr.status, pr.relationship_type, u.name as patient_name
       FROM patient_relationships pr
       JOIN users u ON u.id = pr.patient_user_id
       WHERE pr.related_user_id = $1
       ORDER BY pr.created_at DESC LIMIT 1`, [req.user.id]);
    (0, response_1.ok)(res, { status: result.rows[0] ?? null });
}));
// ─── Family Profile / Notification Preferences ───────────────────────────────
router.get('/profile', (0, authenticate_1.requireRoles)('FAMILY'), (0, response_1.asyncHandler)(async (req, res) => {
    const result = await config_1.default.query(`SELECT fp.*, u.name, u.photo_url, u.phone, u.city, u.date_of_birth, u.gender
       FROM family_profiles fp JOIN users u ON u.id = fp.user_id
       WHERE fp.user_id = $1`, [req.user.id]);
    // Auto-create profile row if it doesn't exist yet
    if (!result.rows[0]) {
        await config_1.default.query(`INSERT INTO family_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [req.user.id]);
        const fresh = await config_1.default.query(`SELECT fp.*, u.name, u.photo_url, u.phone, u.city, u.date_of_birth, u.gender FROM family_profiles fp JOIN users u ON u.id = fp.user_id WHERE fp.user_id = $1`, [req.user.id]);
        return (0, response_1.ok)(res, { profile: fresh.rows[0] });
    }
    (0, response_1.ok)(res, { profile: result.rows[0] });
}));
const ProfileUpdateSchema = zod_1.z.object({
    relation_label: zod_1.z.string().max(50).optional(),
    proximity: zod_1.z.string().max(50).optional(),
    involvement_interests: zod_1.z.array(zod_1.z.string()).optional(),
    avatar_url: zod_1.z.string().optional(),
    whatsapp_number: zod_1.z.string().max(20).optional().nullable(),
    notify_on_breach: zod_1.z.boolean().optional(),
    notify_on_missed_critical: zod_1.z.boolean().optional(),
    notify_on_sos: zod_1.z.boolean().optional(),
    notify_on_daily_digest: zod_1.z.boolean().optional(),
    digest_frequency: zod_1.z.enum(['DAILY', 'WEEKLY']).optional(),
});
router.patch('/profile', (0, authenticate_1.requireRoles)('FAMILY'), (0, response_1.asyncHandler)(async (req, res) => {
    const updates = ProfileUpdateSchema.parse(req.body);
    // Build dynamic SET clause
    const fields = Object.keys(updates).filter((k) => updates[k] !== undefined);
    if (!fields.length)
        return (0, response_1.ok)(res, { updated: false });
    try {
        const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
        const values = fields.map((f) => updates[f]);
        const result = await config_1.default.query(`INSERT INTO family_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET ${setClauses}, updated_at = NOW() RETURNING *`, [req.user.id, ...values]);
        (0, response_1.ok)(res, { profile: result.rows[0] });
    }
    catch (err) {
        console.warn('[family.router] Full family_profiles update failed, falling back to core columns:', err?.message);
        const coreUpdates = {};
        if (updates.whatsapp_number !== undefined)
            coreUpdates.whatsapp_number = updates.whatsapp_number;
        if (updates.digest_frequency !== undefined)
            coreUpdates.digest_frequency = updates.digest_frequency;
        if (updates.notify_on_daily_digest !== undefined)
            coreUpdates.notification_digest_enabled = updates.notify_on_daily_digest;
        const coreFields = Object.keys(coreUpdates);
        if (coreFields.length > 0) {
            const setClauses = coreFields.map((f, i) => `${f} = $${i + 2}`).join(', ');
            const values = coreFields.map((f) => coreUpdates[f]);
            const result = await config_1.default.query(`INSERT INTO family_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET ${setClauses}, updated_at = NOW() RETURNING *`, [req.user.id, ...values]);
            return (0, response_1.ok)(res, { profile: result.rows[0] });
        }
        (0, response_1.ok)(res, { updated: false });
    }
}));
// ─── Caregiver-visible Care Notes (read access for caregivers) ────────────────
// Caregivers can read care notes for their patients
router.get('/care-notes/patient/:patientId', (0, response_1.asyncHandler)(async (req, res) => {
    const { patientId } = req.params;
    const userId = req.user.id;
    const role = req.user.role;
    // Allow if caregiver or family member with confirmed relationship
    const check = await config_1.default.query(`SELECT id FROM patient_relationships
       WHERE patient_user_id = $1 AND related_user_id = $2 
         AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`, [patientId, userId]);
    if (!check.rows[0] && role !== 'PATIENT') {
        throw new AppError_1.AppError('RELATIONSHIP_REQUIRED', 'No active relationship with this patient', 403);
    }
    const result = await config_1.default.query(`SELECT cn.*, u.name as author_name, u.photo_url as author_photo
       FROM care_notes cn JOIN users u ON u.id = cn.author_id
       WHERE cn.patient_id = $1
       ORDER BY cn.is_pinned DESC, cn.created_at DESC LIMIT 50`, [patientId]);
    (0, response_1.ok)(res, { notes: result.rows });
}));
exports.default = router;
//# sourceMappingURL=family.router.js.map