"use strict";
/**
 * SureStep — shared/permissions/familyPermissions.ts
 *
 * Centralized permission definitions for the FAMILY role.
 * Import this in UI components and services to gate actions
 * without hardcoding role checks everywhere.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CARE_CIRCLE_ROUTING = exports.FAMILY_FORBIDDEN_ACTIONS = exports.FAMILY_ALLOWED_ACTIONS = void 0;
exports.familyCanDo = familyCanDo;
// ─── Actions Family CAN perform ───────────────────────────────────────────────
exports.FAMILY_ALLOWED_ACTIONS = [
    'VIEW_LOCATION',
    'VIEW_GEOFENCE_STATE',
    'VIEW_ROUTINE_PROGRESS',
    'VIEW_ALERT_HISTORY',
    'VIEW_CAREGIVER_RESOLUTIONS',
    'VIEW_CARE_CIRCLE',
    'UPLOAD_STORIES',
    'UPLOAD_VOICE_NOTES',
    'POST_CARE_NOTES',
    'SEND_MESSAGES',
    'RATE_CAREGIVER',
    'RECEIVE_NOTIFICATIONS',
    'CONFIGURE_NOTIFICATION_PREFS',
];
// ─── Actions Family CANNOT perform ───────────────────────────────────────────
exports.FAMILY_FORBIDDEN_ACTIONS = [
    'EDIT_GEOFENCE',
    'DELETE_GEOFENCE',
    'EDIT_ROUTINE',
    'DELETE_ROUTINE',
    'ACKNOWLEDGE_ALERT',
    'RESOLVE_ALERT',
    'CONFIGURE_MONITORING',
    'RUN_ASSESSMENT',
    'MODIFY_CARE_PLAN',
    'ADMINISTER_MEDICATION',
];
/**
 * Check if a family member is allowed to perform an action.
 * Use this in UI to conditionally show/hide controls.
 */
function familyCanDo(action) {
    return exports.FAMILY_ALLOWED_ACTIONS.includes(action);
}
/**
 * Alert routing tiers for Care Circle broadcast.
 * Determines which relationship types receive each event type.
 */
exports.CARE_CIRCLE_ROUTING = {
    SOS_TRIGGERED: ['CAREGIVER', 'GUARDIAN', 'FAMILY_CLOSE', 'FAMILY_EXTENDED'],
    ZONE_EXIT: ['CAREGIVER', 'GUARDIAN', 'FAMILY_CLOSE'],
    APPROACHING_BOUNDARY: ['CAREGIVER', 'GUARDIAN'],
    TASK_MISSED_CRITICAL: ['CAREGIVER', 'GUARDIAN', 'FAMILY_CLOSE'],
    NO_SIGNAL: ['CAREGIVER', 'GUARDIAN', 'FAMILY_CLOSE'],
    BATTERY_CRITICAL: ['CAREGIVER', 'FAMILY_CLOSE'],
    GENERAL: ['CAREGIVER', 'GUARDIAN', 'FAMILY_CLOSE'],
};
//# sourceMappingURL=familyPermissions.js.map