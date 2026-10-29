/**
 * SureStep — shared/realtime/socketRooms.ts
 *
 * Keeps connected Socket.IO clients aligned with current Care Circle authorization.
 * Access changes (membership, patient association, caregiver relationship, assignment,
 * ownership transfer, removal, or account deletion) must take effect on already-open
 * sockets, not only on the next connection.
 */
import type { Server as SocketIOServer } from 'socket.io';
/**
 * Reconcile every open socket for a user with their current authorized
 * `patient:<id>` and `circle:<id>` rooms. Stale rooms are left immediately.
 */
export declare function syncUserSocketRooms(userId: string, ioOverride?: SocketIOServer): Promise<void>;
/**
 * Reconcile sockets for every user connected to a Circle (owner, members, and
 * associated Patients). Used when Circle-wide access changes (for example termination).
 */
export declare function syncCircleSocketRooms(circleId: string, ioOverride?: SocketIOServer): Promise<void>;
/**
 * Force-disconnect all sockets for a deleted or fully revoked account.
 */
export declare function disconnectUserSockets(userId: string, ioOverride?: SocketIOServer): Promise<void>;
//# sourceMappingURL=socketRooms.d.ts.map