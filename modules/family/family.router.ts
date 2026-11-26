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

import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../../shared/middleware/authenticate';
import { asyncHandler, ok } from '../../shared/utils/response';
import { AppError } from '../../shared/errors/AppError';
import { resolvePreferredLanguage } from '../../shared/constants/languages';
import pool from '../../db/config';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ─── Retired Family Link/Read Aliases (410 GONE) ─────────────────────────────
const deprecatedFamilyReadHandler = (_req: any, _res: any, next: any) => {
  next(new AppError(
    'ENDPOINT_DEPRECATED',
    'This Family read endpoint is retired. Use GET /api/v1/care-circles/my and GET /api/v1/care-circles/:circleId for Patient summaries and Care Circle membership.',
    410,
  ));
};

router.all('/my-patient', deprecatedFamilyReadHandler);
router.all('/care-circle', deprecatedFamilyReadHandler);

// ─── Care Notes (Decommissioned Legacy Functionality) ─────────────────────────
const deprecatedCareNotesHandler = (_req: any, _res: any, next: any) => {
  next(new AppError('DEPRECATED_ENDPOINT', 'Legacy care notes endpoints are deprecated. Care Notes is not an active entity in the authoritative V1 domain architecture.', 410));
};

router.all('/care-notes', deprecatedCareNotesHandler);
router.all('/care-notes/*', deprecatedCareNotesHandler);

// ─── Invite Code Validation & Redemption (Decommissioned) ─────────────────────
const deprecatedFamilyInviteHandler = (_req: any, _res: any, next: any) => {
  next(new AppError('DEPRECATED_ENDPOINT', 'Legacy alphanumeric invite code endpoints are deprecated. Use canonical 6-digit Care Circle invitations at /api/v1/care-circles/invitations/:code/join', 410));
};

router.post('/invite-code/validate', deprecatedFamilyInviteHandler);

router.post('/invite-code/redeem', deprecatedFamilyInviteHandler);

// ─── Request Access by Phone (Decommissioned) ─────────────────────────────────
router.post('/request-access', deprecatedFamilyInviteHandler);

// ─── My Access Status ─────────────────────────────────────────────────────────
// Check if the family member has a pending request (for polling on LinkPatient screen)
router.get('/access-status',
  requireRoles('FAMILY'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT cjr.id, cjr.status, cjr.created_at, c.id as circle_id, c.name as circle_name
       FROM circle_join_requests cjr
       JOIN care_circles c ON cjr.circle_id = c.id
       WHERE cjr.user_id = $1 AND c.terminated_at IS NULL
       ORDER BY cjr.created_at DESC LIMIT 1`,
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
      `SELECT fp.*, u.name, u.photo_url, u.phone, u.city, u.date_of_birth, u.gender, u.preferred_language
       FROM family_profiles fp JOIN users u ON u.id = fp.user_id
       WHERE fp.user_id = $1`,
      [req.user!.id],
    );
    // Auto-create profile row if it doesn't exist yet
    if (!result.rows[0]) {
      await pool.query(`INSERT INTO family_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [req.user!.id]);
      const fresh = await pool.query(
        `SELECT fp.*, u.name, u.photo_url, u.phone, u.city, u.date_of_birth, u.gender, u.preferred_language FROM family_profiles fp JOIN users u ON u.id = fp.user_id WHERE fp.user_id = $1`,
        [req.user!.id],
      );
      const freshRow = fresh.rows[0];
      return ok(res, {
        profile: freshRow
          ? { ...freshRow, preferred_language: resolvePreferredLanguage(freshRow.preferred_language) }
          : freshRow,
      });
    }
    const row = result.rows[0];
    ok(res, {
      profile: {
        ...row,
        preferred_language: resolvePreferredLanguage(row.preferred_language),
      },
    });
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

export default router;
