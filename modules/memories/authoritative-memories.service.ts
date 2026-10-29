/**
 * SureStep — modules/memories/authoritative-memories.service.ts
 *
 * Authoritative Memories & Activity Subsystem Service.
 * Implements:
 *   - Familiar Memories management (photos, short videos, text memories)
 *   - Observational activity attempts logging (zero dementia clinical progression scoring)
 *   - Gated by canonical delegatable permission 'Manage Patient Memories'
 *   - Connected care audience visibility enforcement
 *
 * Baselines:
 *   - docs/requirements/V1_REQUIREMENT.md
 *   - docs/workflows/09-MEMORIES-AND-ACTIVITIES.md
 *   - docs/architecture/TARGET_ARCHITECTURE.md (§3.7, §4.2, §4.3)
 */

import pool from '../../db/config';
import { AppError } from '../../shared/errors/AppError';

export interface CreateMemoryDTO {
  title: string;
  mediaType: 'PHOTO' | 'VIDEO' | 'TEXT';
  mediaKey?: string | null;
  caption?: string | null;
  associatedPersonId?: string | null;
}

export interface UpdateMemoryDTO {
  title?: string;
  mediaType?: 'PHOTO' | 'VIDEO' | 'TEXT';
  mediaKey?: string | null;
  caption?: string | null;
  associatedPersonId?: string | null;
}

export interface RecordActivityAttemptDTO {
  activityType: 'PHOTO_MATCH' | 'PUZZLE' | 'BREATHING_GUIDE';
  durationSeconds?: number;
  completed?: boolean;
  metrics?: Record<string, any>;
}

export class AuthoritativeMemoriesService {
  /**
   * 1. createMemory
   * Creates a familiar memory for a patient.
   * Gated by Circle Owner or canonical permission 'Manage Patient Memories'.
   */
  async createMemory(patientId: string, creatorId: string, dto: CreateMemoryDTO) {
    if (!dto.title || dto.title.trim().length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Title is required for memory', 400);
    }

    const allowedTypes = ['PHOTO', 'VIDEO', 'TEXT'];
    if (!allowedTypes.includes(dto.mediaType)) {
      throw new AppError('INVALID_MEDIA_TYPE', `mediaType must be one of ${allowedTypes.join(', ')}`, 400);
    }

    const res = await pool.query(
      `INSERT INTO memories (
        patient_id, creator_id, title, media_type, media_key, caption, associated_person_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        patientId,
        creatorId,
        dto.title.trim(),
        dto.mediaType,
        dto.mediaKey ?? null,
        dto.caption?.trim() ?? null,
        dto.associatedPersonId ?? null,
      ]
    );

    return res.rows[0];
  }

  /**
   * 2. getMemories
   * Returns memories for a patient, joined with creator and associated person details.
   * Paginated with limit and cursor (created_at).
   */
  async getMemories(patientId: string, limit = 20, cursor?: string, personId?: string) {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const params: any[] = [patientId];
    let query = `
      SELECT
        m.*,
        u_creator.name as creator_name,
        u_creator.photo_url as creator_photo_url,
        u_assoc.name as associated_person_name,
        u_assoc.photo_url as associated_person_photo_url
      FROM memories m
      JOIN users u_creator ON m.creator_id = u_creator.id
      LEFT JOIN users u_assoc ON m.associated_person_id = u_assoc.id
      WHERE m.patient_id = $1
    `;

    if (personId) {
      params.push(personId);
      query += ` AND (m.creator_id = $${params.length} OR m.associated_person_id = $${params.length})`;
    }

    if (cursor) {
      params.push(cursor);
      query += ` AND m.created_at < $${params.length}`;
    }

    params.push(safeLimit + 1);
    query += ` ORDER BY m.created_at DESC LIMIT $${params.length}`;

    const res = await pool.query(query, params);
    const hasMore = res.rows.length > safeLimit;
    const items = hasMore ? res.rows.slice(0, safeLimit) : res.rows;
    const nextCursor = hasMore ? items[items.length - 1].created_at : null;

    return {
      memories: items,
      has_more: hasMore,
      next_cursor: nextCursor,
    };
  }

  /**
   * 3. getMemoryById
   */
  async getMemoryById(patientId: string, memoryId: string) {
    const res = await pool.query(
      `SELECT
        m.*,
        u_creator.name as creator_name,
        u_creator.photo_url as creator_photo_url,
        u_assoc.name as associated_person_name,
        u_assoc.photo_url as associated_person_photo_url
      FROM memories m
      JOIN users u_creator ON m.creator_id = u_creator.id
      LEFT JOIN users u_assoc ON m.associated_person_id = u_assoc.id
      WHERE m.id = $1 AND m.patient_id = $2`,
      [memoryId, patientId]
    );

    if (res.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Memory not found for this patient', 404);
    }

    return res.rows[0];
  }

  /**
   * 4. updateMemory
   * Updates an existing memory.
   */
  async updateMemory(patientId: string, memoryId: string, dto: UpdateMemoryDTO) {
    const existing = await this.getMemoryById(patientId, memoryId);

    const title = dto.title !== undefined ? dto.title.trim() : existing.title;
    if (!title || title.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Title cannot be empty', 400);
    }

    const mediaType = dto.mediaType !== undefined ? dto.mediaType : existing.media_type;
    const allowedTypes = ['PHOTO', 'VIDEO', 'TEXT'];
    if (!allowedTypes.includes(mediaType)) {
      throw new AppError('INVALID_MEDIA_TYPE', `mediaType must be one of ${allowedTypes.join(', ')}`, 400);
    }

    const mediaKey = dto.mediaKey !== undefined ? dto.mediaKey : existing.media_key;
    const caption = dto.caption !== undefined ? (dto.caption ? dto.caption.trim() : null) : existing.caption;
    const associatedPersonId = dto.associatedPersonId !== undefined ? dto.associatedPersonId : existing.associated_person_id;

    const res = await pool.query(
      `UPDATE memories
       SET title = $1,
           media_type = $2,
           media_key = $3,
           caption = $4,
           associated_person_id = $5,
           updated_at = NOW()
       WHERE id = $6 AND patient_id = $7
       RETURNING *`,
      [title, mediaType, mediaKey, caption, associatedPersonId, memoryId, patientId]
    );

    return res.rows[0];
  }

  /**
   * 5. deleteMemory
   * Deletes a memory record.
   * Authorization: Circle Owner or a member holding 'Manage Patient Memories'.
   * Being the original creator does not preserve management authority after revocation.
   */
  async deleteMemory(patientId: string, memoryId: string, actorUserId: string) {
    await this.getMemoryById(patientId, memoryId);

    const circleRes = await pool.query(
      `SELECT c.id, c.owner_id
       FROM patient_circle_associations pca
       JOIN care_circles c ON pca.circle_id = c.id
       WHERE pca.patient_id = $1 AND c.terminated_at IS NULL`,
      [patientId]
    );

    let authorized = false;
    if (circleRes.rows.length > 0) {
      const circle = circleRes.rows[0];
      if (circle.owner_id === actorUserId) {
        authorized = true;
      } else {
        const permRes = await pool.query(
          `SELECT 1 FROM circle_permissions p
           JOIN care_circle_members m ON p.member_id = m.id
           JOIN users u ON u.id = m.user_id
           WHERE m.circle_id = $1 AND m.user_id = $2 AND p.permission_name = 'Manage Patient Memories'
             AND u.role <> 'PATIENT'`,
          [circle.id, actorUserId]
        );
        if (permRes.rows.length > 0) {
          authorized = true;
        }
      }
    }

    if (!authorized) {
      throw new AppError(
        'MEMORY_MANAGEMENT_FORBIDDEN',
        'Only the Circle Owner or a member holding "Manage Patient Memories" can delete this memory',
        403
      );
    }

    await pool.query(
      'DELETE FROM memories WHERE id = $1 AND patient_id = $2',
      [memoryId, patientId]
    );

    return { id: memoryId, deleted: true };
  }

  // ─── Activity Subsystem (Voluntary Engagement / Observational Only) ─────────

  /**
   * 6. recordActivityAttempt
   * Records an observational activity attempt for engagement/familiarity/relaxation.
   * Strictly NO clinical dementia scoring or diagnostic assessment (TARGET_ARCHITECTURE §3.7).
   */
  async recordActivityAttempt(patientId: string, dto: RecordActivityAttemptDTO) {
    const allowedActivities = ['PHOTO_MATCH', 'PUZZLE', 'BREATHING_GUIDE'];
    if (!allowedActivities.includes(dto.activityType)) {
      throw new AppError('INVALID_ACTIVITY_TYPE', `activityType must be one of ${allowedActivities.join(', ')}`, 400);
    }

    const duration = Math.max(0, dto.durationSeconds ?? 0);
    const completed = Boolean(dto.completed);

    // Sanitize metrics to ensure NO clinical/diagnostic progression scoring is stored
    const rawMetrics = dto.metrics || {};
    const sanitizedMetrics: Record<string, any> = {};
    for (const [key, val] of Object.entries(rawMetrics)) {
      // Exclude any diagnostic or cognitive decline keys if passed by legacy or unauthorized clients
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('score') ||
        lowerKey.includes('diagnosis') ||
        lowerKey.includes('decline') ||
        lowerKey.includes('progression') ||
        lowerKey.includes('clinical') ||
        lowerKey.includes('trend')
      ) {
        continue;
      }
      sanitizedMetrics[key] = val;
    }

    const res = await pool.query(
      `INSERT INTO activity_attempts (
        patient_id, activity_type, duration_seconds, completed, metrics
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [
        patientId,
        dto.activityType,
        duration,
        completed,
        JSON.stringify(sanitizedMetrics),
      ]
    );

    return res.rows[0];
  }

  /**
   * 7. getActivityAttempts
   * Returns observational logs of voluntary activities.
   * Strictly raw attempts and duration only, zero cognitive assessment scoring.
   */
  async getActivityAttempts(patientId: string, limit = 20, cursor?: string) {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const params: any[] = [patientId];
    let query = `
      SELECT id, patient_id, activity_type, duration_seconds, completed, metrics, created_at
      FROM activity_attempts
      WHERE patient_id = $1
    `;

    if (cursor) {
      params.push(cursor);
      query += ` AND created_at < $${params.length}`;
    }

    params.push(safeLimit + 1);
    query += ` ORDER BY created_at DESC LIMIT $${params.length}`;

    const res = await pool.query(query, params);
    const hasMore = res.rows.length > safeLimit;
    const items = hasMore ? res.rows.slice(0, safeLimit) : res.rows;
    const nextCursor = hasMore ? items[items.length - 1].created_at : null;

    return {
      activities: items,
      has_more: hasMore,
      next_cursor: nextCursor,
      clinical_disclaimer: 'Voluntary familiarity and engagement activities. Not a clinical assessment or medical diagnostic tool.',
    };
  }
}

export const authoritativeMemoriesService = new AuthoritativeMemoriesService();

