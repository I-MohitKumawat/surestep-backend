/**
 * SureStep — shared/permissions/familyPermissions.ts
 *
 * Centralized permission definitions for the FAMILY role.
 * Import this in UI components and services to gate actions
 * without hardcoding role checks everywhere.
 */
export declare const FAMILY_ALLOWED_ACTIONS: readonly ["VIEW_LOCATION", "VIEW_GEOFENCE_STATE", "VIEW_ROUTINE_PROGRESS", "VIEW_ALERT_HISTORY", "VIEW_CAREGIVER_RESOLUTIONS", "VIEW_CARE_CIRCLE", "UPLOAD_STORIES", "UPLOAD_VOICE_NOTES", "POST_CARE_NOTES", "SEND_MESSAGES", "RATE_CAREGIVER", "RECEIVE_NOTIFICATIONS", "CONFIGURE_NOTIFICATION_PREFS"];
export declare const FAMILY_FORBIDDEN_ACTIONS: readonly ["EDIT_GEOFENCE", "DELETE_GEOFENCE", "EDIT_ROUTINE", "DELETE_ROUTINE", "ACKNOWLEDGE_ALERT", "RESOLVE_ALERT", "CONFIGURE_MONITORING", "RUN_ASSESSMENT", "MODIFY_CARE_PLAN", "ADMINISTER_MEDICATION"];
export type FamilyAllowedAction = typeof FAMILY_ALLOWED_ACTIONS[number];
export type FamilyForbiddenAction = typeof FAMILY_FORBIDDEN_ACTIONS[number];
/**
 * Check if a family member is allowed to perform an action.
 * Use this in UI to conditionally show/hide controls.
 */
export declare function familyCanDo(action: FamilyAllowedAction | FamilyForbiddenAction): boolean;
/**
 * Alert routing tiers for Care Circle broadcast.
 * Determines which relationship types receive each event type.
 */
export declare const CARE_CIRCLE_ROUTING: {
    readonly SOS_TRIGGERED: readonly ["CAREGIVER", "GUARDIAN", "FAMILY_CLOSE", "FAMILY_EXTENDED"];
    readonly ZONE_EXIT: readonly ["CAREGIVER", "GUARDIAN", "FAMILY_CLOSE"];
    readonly APPROACHING_BOUNDARY: readonly ["CAREGIVER", "GUARDIAN"];
    readonly TASK_MISSED_CRITICAL: readonly ["CAREGIVER", "GUARDIAN", "FAMILY_CLOSE"];
    readonly NO_SIGNAL: readonly ["CAREGIVER", "GUARDIAN", "FAMILY_CLOSE"];
    readonly BATTERY_CRITICAL: readonly ["CAREGIVER", "FAMILY_CLOSE"];
    readonly GENERAL: readonly ["CAREGIVER", "GUARDIAN", "FAMILY_CLOSE"];
};
//# sourceMappingURL=familyPermissions.d.ts.map