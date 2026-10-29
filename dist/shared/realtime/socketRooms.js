"use strict";
/**
 * SureStep — shared/realtime/socketRooms.ts
 *
 * Keeps connected Socket.IO clients aligned with current Care Circle authorization.
 * Access changes (membership, patient association, caregiver relationship, assignment,
 * ownership transfer, removal, or account deletion) must take effect on already-open
 * sockets, not only on the next connection.
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
exports.syncUserSocketRooms = syncUserSocketRooms;
exports.syncCircleSocketRooms = syncCircleSocketRooms;
exports.disconnectUserSockets = disconnectUserSockets;
const config_1 = __importDefault(require("../../db/config"));
async function resolveAuthorizedRooms(userId) {
    const userRes = await config_1.default.query('SELECT id, role, is_active, deleted_at FROM users WHERE id = $1', [userId]);
    const user = userRes.rows[0];
    if (!user || !user.is_active || user.deleted_at) {
        return { patientIds: [], circleIds: [] };
    }
    let patientIds = [];
    if (user.role === 'PATIENT') {
        patientIds = [userId];
    }
    else if (user.role === 'CAREGIVER') {
        const assignedRes = await config_1.default.query(`SELECT DISTINCT pa.patient_id
       FROM patient_assignments pa
       JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
       JOIN care_circles c ON cr.circle_id = c.id
       WHERE cr.caregiver_id = $1
         AND pa.is_active = TRUE
         AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
         AND c.terminated_at IS NULL`, [userId]);
        patientIds = assignedRes.rows.map((row) => row.patient_id);
    }
    else {
        const patientRes = await config_1.default.query(`SELECT DISTINCT pca.patient_id
       FROM patient_circle_associations pca
       JOIN care_circles c ON pca.circle_id = c.id
       WHERE c.terminated_at IS NULL
         AND (
           c.owner_id = $1
           OR EXISTS (
             SELECT 1 FROM care_circle_members m
             WHERE m.circle_id = c.id AND m.user_id = $1
           )
         )`, [userId]);
        patientIds = patientRes.rows.map((row) => row.patient_id);
    }
    const circleRes = await config_1.default.query(`SELECT c.id
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
       )`, [userId]);
    return {
        patientIds,
        circleIds: circleRes.rows.map((row) => row.id),
    };
}
/**
 * Reconcile every open socket for a user with their current authorized
 * `patient:<id>` and `circle:<id>` rooms. Stale rooms are left immediately.
 */
async function syncUserSocketRooms(userId, ioOverride) {
    try {
        const io = ioOverride ?? (await Promise.resolve().then(() => __importStar(require('../../server')))).io;
        const sockets = await io.in(`user:${userId}`).fetchSockets();
        if (sockets.length === 0)
            return;
        const { patientIds, circleIds } = await resolveAuthorizedRooms(userId);
        const desiredPatientRooms = new Set(patientIds.map((id) => `patient:${id}`));
        const desiredCircleRooms = new Set(circleIds.map((id) => `circle:${id}`));
        for (const socket of sockets) {
            for (const room of Array.from(socket.rooms)) {
                if (room.startsWith('patient:') && !desiredPatientRooms.has(room)) {
                    socket.leave(room);
                }
                else if (room.startsWith('circle:') && !desiredCircleRooms.has(room)) {
                    socket.leave(room);
                }
            }
            for (const room of desiredPatientRooms)
                socket.join(room);
            for (const room of desiredCircleRooms)
                socket.join(room);
        }
    }
    catch (err) {
        console.warn('[socketRooms] Failed to synchronize socket rooms:', err);
    }
}
/**
 * Reconcile sockets for every user connected to a Circle (owner, members, and
 * associated Patients). Used when Circle-wide access changes (for example termination).
 */
async function syncCircleSocketRooms(circleId, ioOverride) {
    try {
        const usersRes = await config_1.default.query(`SELECT owner_id AS user_id FROM care_circles WHERE id = $1
       UNION
       SELECT user_id FROM care_circle_members WHERE circle_id = $1
       UNION
       SELECT patient_id AS user_id FROM patient_circle_associations WHERE circle_id = $1`, [circleId]);
        for (const row of usersRes.rows) {
            await syncUserSocketRooms(row.user_id, ioOverride);
        }
    }
    catch (err) {
        console.warn('[socketRooms] Failed to synchronize circle sockets:', err);
    }
}
/**
 * Force-disconnect all sockets for a deleted or fully revoked account.
 */
async function disconnectUserSockets(userId, ioOverride) {
    try {
        const io = ioOverride ?? (await Promise.resolve().then(() => __importStar(require('../../server')))).io;
        io.in(`user:${userId}`).disconnectSockets(true);
    }
    catch (err) {
        console.warn('[socketRooms] Failed to disconnect user sockets:', err);
    }
}
//# sourceMappingURL=socketRooms.js.map