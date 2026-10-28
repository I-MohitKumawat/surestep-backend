/**
 * SureStep — modules/care-circles/invitations.service.ts
 *
 * 6-Digit Numeric Invitation & Join Request Engine.
 * Baselines:
 *   - docs/architecture/TARGET_ARCHITECTURE.md (Sections 3.2, 5.4)
 *   - docs/workflows/03-CARE-CIRCLE.md (Sections 2, 3, 4, 5, 6, 7)
 */

import crypto from 'crypto';
import pool from '../../db/config';
import { AppError } from '../../shared/errors/AppError';
import { ReviewJoinRequestDTO } from './care-circles.types';

export class InvitationsService {
  /**
   * Generates a 6-digit numeric invitation code with a 72-hour TTL.
   * Actor must be Circle Owner or hold 'Manage Member Permissions'.
   * In accordance with 03-CARE-CIRCLE.md §2:
   *   "Regenerating an active invitation invalidates the previous invitation."
   */
  async generateInvitation(circleId: string, actorId: string) {
    // 1. Verify Circle is active
    const circleRes = await pool.query('SELECT id, name, owner_id, terminated_at FROM care_circles WHERE id = $1', [circleId]);
    const circle = circleRes.rows[0];
    if (!circle || circle.terminated_at) {
      throw new AppError('CIRCLE_NOT_FOUND', 'Active Care Circle not found', 404);
    }

    // 2. Authorize actor
    await this.assertCanManageMembers(circleId, actorId, circle.owner_id);

    // 3. Invalidate any existing ACTIVE invitation for this Circle
    await pool.query(
      `UPDATE circle_invitations
       SET status = 'REVOKED'
       WHERE circle_id = $1 AND status = 'ACTIVE'`,
      [circleId]
    );

    // 4. Generate unique 6-digit numeric code
    let code = '';
    let isUnique = false;
    for (let attempts = 0; attempts < 10; attempts++) {
      // 6 digits: 100000 to 999999
      const num = crypto.randomInt(100000, 1000000);
      code = num.toString();

      const existing = await pool.query('SELECT id FROM circle_invitations WHERE code = $1', [code]);
      if (existing.rows.length === 0) {
        isUnique = true;
        break;
      }
    }

    if (!isUnique) {
      throw new AppError('CODE_GENERATION_FAILED', 'Could not generate a unique invitation code', 500);
    }

    // 5. Insert new 72-hour invitation
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const insertRes = await pool.query(
      `INSERT INTO circle_invitations (circle_id, code, created_by, status, expires_at)
       VALUES ($1, $2, $3, 'ACTIVE', $4)
       RETURNING *`,
      [circleId, code, actorId, expiresAt.toISOString()]
    );

    return insertRes.rows[0];
  }

  /**
   * Look up an invitation by 6-digit code.
   * Validates code and TTL.
   * Does NOT expose Patient care information prior to membership approval (03-CARE-CIRCLE.md §2).
   */
  async getInvitationByCode(code: string) {
    if (!/^[0-9]{6}$/.test(code)) {
      throw new AppError('INVALID_CODE_FORMAT', 'Invitation code must be strictly 6 numeric digits', 400);
    }

    const res = await pool.query(
      `SELECT i.*, c.name as circle_name, u.name as owner_name, c.terminated_at
       FROM circle_invitations i
       JOIN care_circles c ON i.circle_id = c.id
       JOIN users u ON c.owner_id = u.id
       WHERE i.code = $1`,
      [code]
    );

    const inv = res.rows[0];
    if (!inv || inv.terminated_at) {
      throw new AppError('INVITATION_NOT_FOUND', 'Invitation not found or circle no longer active', 404);
    }

    if (inv.status !== 'ACTIVE') {
      throw new AppError('INVITATION_INACTIVE', `Invitation is ${inv.status.toLowerCase()} and cannot be used`, 400);
    }

    // Check expiry
    if (new Date(inv.expires_at) < new Date()) {
      await pool.query(`UPDATE circle_invitations SET status = 'EXPIRED' WHERE id = $1`, [inv.id]);
      throw new AppError('INVITATION_EXPIRED', 'Invitation has expired', 400);
    }

    return {
      id: inv.id,
      circleId: inv.circle_id,
      circleName: inv.circle_name,
      ownerName: inv.owner_name,
      expiresAt: inv.expires_at,
      status: inv.status,
    };
  }

  /**
   * Submit a Join Request using a 6-digit invitation code.
   * Rules:
   *   - Transitions invitation to 'USED' immediately upon creating the join request (03-CARE-CIRCLE.md §2, §3).
   *   - Does not grant membership immediately; creates a PENDING join request.
   *   - Applicant must not already belong to an active Circle.
   *   - Duplicate pending requests rejected by idx_uq_pending_circle_join_request.
   */
  async submitJoinRequest(code: string, applicantUserId: string) {
    // 1. Verify applicant
    const userRes = await pool.query('SELECT id, role, is_active FROM users WHERE id = $1', [applicantUserId]);
    const user = userRes.rows[0];
    if (!user || !user.is_active) {
      throw new AppError('USER_NOT_FOUND', 'Active user not found', 404);
    }

    // 2. Validate invitation
    const invitation = await this.getInvitationByCode(code);

    // 3. Check single active Circle invariant (user cannot already belong to an active circle)
    const existingMembership = await pool.query(
      `SELECT m.id FROM care_circle_members m
       JOIN care_circles c ON m.circle_id = c.id
       WHERE m.user_id = $1 AND c.terminated_at IS NULL
       UNION
       SELECT pca.id FROM patient_circle_associations pca
       JOIN care_circles c ON pca.circle_id = c.id
       WHERE pca.patient_id = $1 AND c.terminated_at IS NULL`,
      [applicantUserId]
    );

    if (existingMembership.rows.length > 0) {
      throw new AppError(
        'ALREADY_IN_ACTIVE_CIRCLE',
        'User already belongs to an active Care Circle. V1 permits participation in only one active Circle.',
        409
      );
    }

    // 4. Check if already has a pending request for this circle
    const existingPending = await pool.query(
      `SELECT id FROM circle_join_requests WHERE circle_id = $1 AND user_id = $2 AND status = 'PENDING'`,
      [invitation.circleId, applicantUserId]
    );
    if (existingPending.rows.length > 0) {
      throw new AppError('PENDING_REQUEST_EXISTS', 'You already have a pending join request for this Care Circle', 409);
    }

    // 5. In a transaction, mark invitation USED and create PENDING join request
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Re-verify and mark USED atomically
      const updateInv = await client.query(
        `UPDATE circle_invitations
         SET status = 'USED', used_at = NOW()
         WHERE id = $1 AND status = 'ACTIVE'
         RETURNING id`,
        [invitation.id]
      );

      if (updateInv.rows.length === 0) {
        throw new AppError('INVITATION_UNAVAILABLE', 'Invitation is no longer active', 400);
      }

      const requestRes = await client.query(
        `INSERT INTO circle_join_requests (circle_id, user_id, invitation_id, status)
         VALUES ($1, $2, $3, 'PENDING')
         RETURNING *`,
        [invitation.circleId, applicantUserId, invitation.id]
      );

      await client.query('COMMIT');
      return requestRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * List pending join requests for a Care Circle.
   * Actor must be Circle Owner or hold 'Manage Member Permissions'.
   */
  async listPendingJoinRequests(circleId: string, actorId: string) {
    const circleRes = await pool.query('SELECT owner_id, terminated_at FROM care_circles WHERE id = $1', [circleId]);
    const circle = circleRes.rows[0];
    if (!circle || circle.terminated_at) {
      throw new AppError('CIRCLE_NOT_FOUND', 'Active Care Circle not found', 404);
    }

    await this.assertCanManageMembers(circleId, actorId, circle.owner_id);

    const res = await pool.query(
      `SELECT jr.id, jr.circle_id, jr.user_id, jr.invitation_id, jr.status, jr.created_at,
              u.name, u.email, u.phone, u.role as applicant_role, u.photo_url
       FROM circle_join_requests jr
       JOIN users u ON jr.user_id = u.id
       WHERE jr.circle_id = $1 AND jr.status = 'PENDING'
       ORDER BY jr.created_at ASC`,
      [circleId]
    );

    return res.rows;
  }

  /**
   * Review a pending join request (ACCEPTED or REJECTED).
   * Actor must be Circle Owner or hold 'Manage Member Permissions'.
   * If ACCEPTED:
   *   - Patient applicant -> creates patient_circle_associations row + care_circle_members row.
   *   - Caregiver applicant -> creates care_circle_members row with role 'CAREGIVER'.
   *   - Family applicant -> creates care_circle_members row with role 'MEMBER'.
   */
  async reviewJoinRequest(requestId: string, reviewerId: string, dto: ReviewJoinRequestDTO) {
    const { decision } = dto;
    if (decision !== 'ACCEPTED' && decision !== 'REJECTED') {
      throw new AppError('INVALID_DECISION', 'Decision must be ACCEPTED or REJECTED', 400);
    }

    // 1. Fetch join request
    const reqRes = await pool.query(
      `SELECT jr.*, c.owner_id, c.terminated_at, u.role as applicant_role
       FROM circle_join_requests jr
       JOIN care_circles c ON jr.circle_id = c.id
       JOIN users u ON jr.user_id = u.id
       WHERE jr.id = $1`,
      [requestId]
    );
    const joinReq = reqRes.rows[0];
    if (!joinReq || joinReq.terminated_at) {
      throw new AppError('REQUEST_NOT_FOUND', 'Join request not found or circle terminated', 404);
    }

    if (joinReq.status !== 'PENDING') {
      throw new AppError('REQUEST_ALREADY_REVIEWED', `Join request is already ${joinReq.status}`, 400);
    }

    // 2. Authorize reviewer
    await this.assertCanManageMembers(joinReq.circle_id, reviewerId, joinReq.owner_id);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (decision === 'REJECTED') {
        const rejectedRes = await client.query(
          `UPDATE circle_join_requests
           SET status = 'REJECTED', reviewed_by = $1, reviewed_at = NOW()
           WHERE id = $2
           RETURNING *`,
          [reviewerId, requestId]
        );
        await client.query('COMMIT');
        return { request: rejectedRes.rows[0], membership: null, association: null };
      }

      // ACCEPTED:
      // Update join request
      const acceptedRes = await client.query(
        `UPDATE circle_join_requests
         SET status = 'ACCEPTED', reviewed_by = $1, reviewed_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [reviewerId, requestId]
      );

      let membership = null;
      let association = null;

      if (joinReq.applicant_role === 'PATIENT') {
        // Patient Join workflow: creates Patient-Circle Association + Member row
        const assocRes = await client.query(
          `INSERT INTO patient_circle_associations (circle_id, patient_id, associated_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (circle_id, patient_id) DO NOTHING
           RETURNING *`,
          [joinReq.circle_id, joinReq.user_id, reviewerId]
        );
        association = assocRes.rows[0];

        const memRes = await client.query(
          `INSERT INTO care_circle_members (circle_id, user_id, role_in_circle)
           VALUES ($1, $2, 'MEMBER')
           ON CONFLICT (circle_id, user_id) DO NOTHING
           RETURNING *`,
          [joinReq.circle_id, joinReq.user_id]
        );
        membership = memRes.rows[0];
      } else if (joinReq.applicant_role === 'CAREGIVER') {
        const memRes = await client.query(
          `INSERT INTO care_circle_members (circle_id, user_id, role_in_circle)
           VALUES ($1, $2, 'CAREGIVER')
           ON CONFLICT (circle_id, user_id) DO NOTHING
           RETURNING *`,
          [joinReq.circle_id, joinReq.user_id]
        );
        membership = memRes.rows[0];
      } else {
        // FAMILY or other member
        const memRes = await client.query(
          `INSERT INTO care_circle_members (circle_id, user_id, role_in_circle)
           VALUES ($1, $2, 'MEMBER')
           ON CONFLICT (circle_id, user_id) DO NOTHING
           RETURNING *`,
          [joinReq.circle_id, joinReq.user_id]
        );
        membership = memRes.rows[0];
      }

      await client.query('COMMIT');
      return { request: acceptedRes.rows[0], membership, association };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Helper: Assert actor is Circle Owner OR holds 'Manage Member Permissions'.
   */
  private async assertCanManageMembers(circleId: string, actorId: string, ownerId: string) {
    if (actorId === ownerId) {
      return; // Intrinsic Owner authority
    }

    const permRes = await pool.query(
      `SELECT p.id FROM circle_permissions p
       JOIN care_circle_members m ON p.member_id = m.id
       WHERE m.circle_id = $1 AND m.user_id = $2 AND p.permission_name = 'Manage Member Permissions'`,
      [circleId, actorId]
    );

    if (permRes.rows.length === 0) {
      throw new AppError(
        'FORBIDDEN',
        'Only the Circle Owner or a member with "Manage Member Permissions" can perform this action',
        403
      );
    }
  }
}

export const invitationsService = new InvitationsService();

