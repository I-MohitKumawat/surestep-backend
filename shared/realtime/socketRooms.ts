/**
 * SureStep — shared/realtime/socketRooms.ts
 *
 * Keeps connected Socket.IO clients aligned with current Care Circle authorization.
 * Access changes (membership, patient association, caregiver relationship, assignment,
 * ownership transfer, removal, or account deletion) must take effect on already-open
 * sockets, not only on the next connection.
 */

import type { Server as SocketIOServer } from 'socket.io';
import pool from '../../db/config';

interface ResolvedAccess {
  patientIds: string[];
  circleIds: string[];
}

async function resolveAuthorizedRooms(userId: string): Promise<ResolvedAccess> {
  const userRes = await pool.query(
    'SELECT id, role, is_active, deleted_at FROM users WHERE id = $1',
    [userId]
  );
  const user = userRes.rows[0];

  if (!user || !user.is_active || user.deleted_at) {
    return { patientIds: [], circleIds: [] };
  }

  let patientIds: string[] = [];

  if (user.role === 'PATIENT') {
    patientIds = [userId];
  } else if (user.role === 'CAREGIVER') {
    const assignedRes = await pool.query(
      `SELECT DISTINCT pa.patient_id
       FROM patient_assignments pa
       JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
       JOIN care_circles c ON cr.circle_id = c.id
       WHERE cr.caregiver_id = $1
         AND pa.is_active = TRUE
         AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
         AND c.terminated_at IS NULL`,
      [userId]
    );
    patientIds = assignedRes.rows.map((row: any) => row.patient_id);
  } else {
    const patientRes = await pool.query(
      `SELECT DISTINCT pca.patient_id
       FROM patient_circle_associations pca
       JOIN care_circles c ON pca.circle_id = c.id
       WHERE c.terminated_at IS NULL
         AND (
           c.owner_id = $1
           OR EXISTS (
             SELECT 1 FROM care_circle_members m
             WHERE m.circle_id = c.id AND m.user_id = $1
           )
         )`,
      [userId]
    );
    patientIds = patientRes.rows.map((row: any) => row.patient_id);
  }

  const circleRes = await pool.query(
    `SELECT c.id
     FROM care_circles c
     WHERE c.terminated_at IS NULL
       AND (
         c.owner_id = $1
         OR EXISTS (
           SELECT 1 FROM care_circle_members m
           WHERE m.circle_id = c.id AND m.user_id = $1
         )
         OR EXISTS (
           SELECT 1 FROM patient_circle_associations pca
           WHERE pca.circle_id = c.id AND pca.patient_id = $1
         )
       )`,
    [userId]
  );

  return {
    patientIds,
    circleIds: circleRes.rows.map((row: any) => row.id),
  };
}

/**
 * Reconcile every open socket for a user with their current authorized
 * `patient:<id>` and `circle:<id>` rooms. Stale rooms are left immediately.
 */
export async function syncUserSocketRooms(
  userId: string,
  ioOverride?: SocketIOServer
): Promise<void> {
  try {
    const io = ioOverride ?? (await import('../../server')).io;
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    if (sockets.length === 0) return;

    const { patientIds, circleIds } = await resolveAuthorizedRooms(userId);
    const desiredPatientRooms = new Set(patientIds.map((id) => `patient:${id}`));
    const desiredCircleRooms = new Set(circleIds.map((id) => `circle:${id}`));

    for (const socket of sockets) {
      for (const room of Array.from(socket.rooms)) {
        if (room.startsWith('patient:') && !desiredPatientRooms.has(room)) {
          socket.leave(room);
        } else if (room.startsWith('circle:') && !desiredCircleRooms.has(room)) {
          socket.leave(room);
        }
      }

      for (const room of desiredPatientRooms) socket.join(room);
      for (const room of desiredCircleRooms) socket.join(room);
    }
  } catch (err) {
    console.warn('[socketRooms] Failed to synchronize socket rooms:', err);
  }
}

/**
 * Reconcile sockets for every user connected to a Circle (owner, members, and
 * associated Patients). Used when Circle-wide access changes (for example termination).
 */
export async function syncCircleSocketRooms(
  circleId: string,
  ioOverride?: SocketIOServer
): Promise<void> {
  try {
    const usersRes = await pool.query(
      `SELECT owner_id AS user_id FROM care_circles WHERE id = $1
       UNION
       SELECT user_id FROM care_circle_members WHERE circle_id = $1
       UNION
       SELECT patient_id AS user_id FROM patient_circle_associations WHERE circle_id = $1`,
      [circleId]
    );

    for (const row of usersRes.rows) {
      await syncUserSocketRooms(row.user_id, ioOverride);
    }
  } catch (err) {
    console.warn('[socketRooms] Failed to synchronize circle sockets:', err);
  }
}

/**
 * Force-disconnect all sockets for a deleted or fully revoked account.
 */
export async function disconnectUserSockets(
  userId: string,
  ioOverride?: SocketIOServer
): Promise<void> {
  try {
    const io = ioOverride ?? (await import('../../server')).io;
    io.in(`user:${userId}`).disconnectSockets(true);
  } catch (err) {
    console.warn('[socketRooms] Failed to disconnect user sockets:', err);
  }
}
