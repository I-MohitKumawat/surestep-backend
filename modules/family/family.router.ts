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

import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../../shared/middleware/authenticate';
import { asyncHandler, ok, created } from '../../shared/utils/response';
import { AppError } from '../../shared/errors/AppError';
import pool from '../../db/config';
import {
  getFamilyPatient,
  getCareCircle,
  redeemInviteCode,
  requestAccessByPhone,
} from '../relationships/relationships.service';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ─── Helper: resolve patientId for the authenticated family member ────────────
async function resolveFamilyPatientId(userId: string): Promise<string> {
  const rel = await pool.query(
    `SELECT patient_user_id FROM patient_relationships
     WHERE related_user_id = $1 AND status = 'CONFIRMED' LIMIT 1`,
    [userId],
  );
  if (!rel.rows[0]) throw new AppError('RELATIONSHIP_REQUIRED', 'No linked patient found. Please link to a patient first.', 403);
  return rel.rows[0].patient_user_id;
}

// ─── My Patient Summary ───────────────────────────────────────────────────────
router.get('/my-patient',
  requireRoles('FAMILY'),
  asyncHandler(async (req: Request, res: Response) => {
    const patient = await getFamilyPatient(req.user!.id);
    if (!patient) throw new AppError('NOT_FOUND', 'No linked patient found', 404);
    ok(res, { patient });
  }),
);

// ─── Care Circle ──────────────────────────────────────────────────────────────
router.get('/care-circle',
  requireRoles('FAMILY'),
  asyncHandler(async (req: Request, res: Response) => {
    const patientId = await resolveFamilyPatientId(req.user!.id);
    const members = await getCareCircle(patientId);
    ok(res, { members });
  }),
);

// ─── Care Notes ───────────────────────────────────────────────────────────────
const CareNoteSchema = z.object({
  content:   z.string().min(5).max(1000),
  is_pinned: z.boolean().optional(),
});

router.get('/care-notes',
  requireRoles('FAMILY'),
  asyncHandler(async (req: Request, res: Response) => {
    const patientId = await resolveFamilyPatientId(req.user!.id);
    const result = await pool.query(
      `SELECT cn.*, u.name as author_name, u.photo_url as author_photo
       FROM care_notes cn JOIN users u ON u.id = cn.author_id
       WHERE cn.patient_id = $1
       ORDER BY cn.is_pinned DESC, cn.created_at DESC
       LIMIT 50`,
      [patientId],
    );
    ok(res, { notes: result.rows });
  }),
);

router.post('/care-notes',
  requireRoles('FAMILY'),
  asyncHandler(async (req: Request, res: Response) => {
    const { content, is_pinned } = CareNoteSchema.parse(req.body);
    const patientId = await resolveFamilyPatientId(req.user!.id);
    const result = await pool.query(
      `INSERT INTO care_notes (patient_id, author_id, content, is_pinned) VALUES ($1, $2, $3, $4) RETURNING *`,
      [patientId, req.user!.id, content, is_pinned ?? false],
    );
    created(res, { note: result.rows[0] });
  }),
);

router.delete('/care-notes/:id',
  requireRoles('FAMILY'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await pool.query(
      `DELETE FROM care_notes WHERE id = $1 AND author_id = $2 RETURNING id`,
      [req.params.id, req.user!.id],
    );
    if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Note not found', 404);
    ok(res, { deleted: true });
  }),
);

// ─── Invite Code Validation & Redemption ───────────────────────────────────────
router.post('/invite-code/validate',
  requireRoles('FAMILY'),
  asyncHandler(async (req: Request, res: Response) => {
    const { code } = z.object({ code: z.string().min(4).max(10) }).parse(req.body);
    const inv = await pool.query(
      `SELECT ic.code, ic.expires_at, u.name as patient_name
       FROM invite_codes ic
       JOIN users u ON u.id = ic.patient_id
       WHERE ic.code = $1 AND ic.used_at IS NULL AND ic.expires_at > NOW()`,
      [code.toUpperCase()]
    );
    if (!inv.rows[0]) throw new AppError('NOT_FOUND', 'Invalid or expired invite code', 404);
    ok(res, { valid: true, patientName: inv.rows[0].patient_name, code: inv.rows[0].code });
  }),
);

router.post('/invite-code/redeem',
  requireRoles('FAMILY'),
  asyncHandler(async (req: Request, res: Response) => {
    const { code } = z.object({ code: z.string().min(4).max(10) }).parse(req.body);
    const relationship = await redeemInviteCode(code, req.user!.id);
    try {
      const { io } = await import('../../server');
      io.to(`patient:${relationship.patient_user_id}`).emit('relationship:change', { relationship });
      const { default: pool } = await import('../../db/config');
      const caregivers = await pool.query(
        `SELECT related_user_id FROM patient_relationships 
         WHERE patient_user_id = $1 AND relationship_type = 'CAREGIVER' AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`,
        [relationship.patient_user_id]
      );
      for (const cg of caregivers.rows) {
        io.to(`user:${cg.related_user_id}`).emit('relationship:change', { relationship });
      }
    } catch (_) {}
    ok(res, { relationship, message: 'Successfully joined care circle' });
  }),
);

// ─── Request Access by Phone ──────────────────────────────────────────────────
router.post('/request-access',
  requireRoles('FAMILY'),
  asyncHandler(async (req: Request, res: Response) => {
    const { patient_phone } = z.object({ patient_phone: z.string().min(10) }).parse(req.body);
    const relationship = await requestAccessByPhone(req.user!.id, patient_phone);
    try {
      const { io } = await import('../../server');
      io.to(`patient:${relationship.patient_user_id}`).emit('relationship:change', { relationship });
      const { default: pool } = await import('../../db/config');
      const caregivers = await pool.query(
        `SELECT related_user_id FROM patient_relationships 
         WHERE patient_user_id = $1 AND relationship_type = 'CAREGIVER' AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`,
        [relationship.patient_user_id]
      );
      for (const cg of caregivers.rows) {
        io.to(`user:${cg.related_user_id}`).emit('relationship:change', { relationship });
      }
    } catch (_) {}
    created(res, { relationship, message: 'Access requested — awaiting caregiver approval' });
  }),
);

// ─── My Access Status ─────────────────────────────────────────────────────────
// Check if the family member has a pending request (for polling on LinkPatient screen)
router.get('/access-status',
  requireRoles('FAMILY'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT pr.status, pr.relationship_type, u.name as patient_name
       FROM patient_relationships pr
       JOIN users u ON u.id = pr.patient_user_id
       WHERE pr.related_user_id = $1
       ORDER BY pr.created_at DESC LIMIT 1`,
      [req.user!.id],
    );
    ok(res, { status: result.rows[0] ?? null });
  }),
);

// ─── Family Profile / Notification Preferences ───────────────────────────────
router.get('/profile',
  requireRoles('FAMILY'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT fp.*, u.name, u.photo_url, u.phone, u.city, u.date_of_birth, u.gender
       FROM family_profiles fp JOIN users u ON u.id = fp.user_id
       WHERE fp.user_id = $1`,
      [req.user!.id],
    );
    // Auto-create profile row if it doesn't exist yet
    if (!result.rows[0]) {
      await pool.query(`INSERT INTO family_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [req.user!.id]);
      const fresh = await pool.query(
        `SELECT fp.*, u.name, u.photo_url, u.phone, u.city, u.date_of_birth, u.gender FROM family_profiles fp JOIN users u ON u.id = fp.user_id WHERE fp.user_id = $1`,
        [req.user!.id],
      );
      return ok(res, { profile: fresh.rows[0] });
    }
    ok(res, { profile: result.rows[0] });
  }),
);

const ProfileUpdateSchema = z.object({
  relation_label:            z.string().max(50).optional(),
  proximity:                 z.string().max(50).optional(),
  involvement_interests:     z.array(z.string()).optional(),
  avatar_url:                z.string().optional(),
  whatsapp_number:           z.string().max(20).optional().nullable(),
  notify_on_breach:          z.boolean().optional(),
  notify_on_missed_critical: z.boolean().optional(),
  notify_on_sos:             z.boolean().optional(),
  notify_on_daily_digest:    z.boolean().optional(),
  digest_frequency:          z.enum(['DAILY', 'WEEKLY']).optional(),
});

router.patch('/profile',
  requireRoles('FAMILY'),
  asyncHandler(async (req: Request, res: Response) => {
    const updates = ProfileUpdateSchema.parse(req.body);

    // Build dynamic SET clause
    const fields = Object.keys(updates).filter((k) => (updates as any)[k] !== undefined);
    if (!fields.length) return ok(res, { updated: false });

    try {
      const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
      const values = fields.map((f) => (updates as any)[f]);

      const result = await pool.query(
        `INSERT INTO family_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET ${setClauses}, updated_at = NOW() RETURNING *`,
        [req.user!.id, ...values],
      );
      ok(res, { profile: result.rows[0] });
    } catch (err: any) {
      console.warn('[family.router] Full family_profiles update failed, falling back to core columns:', err?.message);
      const coreUpdates: any = {};
      if (updates.whatsapp_number !== undefined) coreUpdates.whatsapp_number = updates.whatsapp_number;
      if (updates.digest_frequency !== undefined) coreUpdates.digest_frequency = updates.digest_frequency;
      if (updates.notify_on_daily_digest !== undefined) coreUpdates.notification_digest_enabled = updates.notify_on_daily_digest;

      const coreFields = Object.keys(coreUpdates);
      if (coreFields.length > 0) {
        const setClauses = coreFields.map((f, i) => `${f} = $${i + 2}`).join(', ');
        const values = coreFields.map((f) => coreUpdates[f]);
        const result = await pool.query(
          `INSERT INTO family_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET ${setClauses}, updated_at = NOW() RETURNING *`,
          [req.user!.id, ...values],
        );
        return ok(res, { profile: result.rows[0] });
      }
      ok(res, { updated: false });
    }
  }),
);

// ─── Caregiver-visible Care Notes (read access for caregivers) ────────────────
// Caregivers can read care notes for their patients
router.get('/care-notes/patient/:patientId',
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId } = req.params;
    const userId = req.user!.id;
    const role = req.user!.role;

    // Allow if caregiver or family member with confirmed relationship
    const check = await pool.query(
      `SELECT id FROM patient_relationships
       WHERE patient_user_id = $1 AND related_user_id = $2 
         AND status IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`,
      [patientId, userId],
    );
    if (!check.rows[0] && role !== 'PATIENT') {
      throw new AppError('RELATIONSHIP_REQUIRED', 'No active relationship with this patient', 403);
    }

    const result = await pool.query(
      `SELECT cn.*, u.name as author_name, u.photo_url as author_photo
       FROM care_notes cn JOIN users u ON u.id = cn.author_id
       WHERE cn.patient_id = $1
       ORDER BY cn.is_pinned DESC, cn.created_at DESC LIMIT 50`,
      [patientId],
    );
    ok(res, { notes: result.rows });
  }),
);

export default router;
