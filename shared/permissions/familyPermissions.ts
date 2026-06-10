/**
 * SureStep — shared/permissions/familyPermissions.ts
 *
 * Centralized permission definitions for the FAMILY role.
 * Import this in UI components and services to gate actions
 * without hardcoding role checks everywhere.
 */

// ─── Actions Family CAN perform ───────────────────────────────────────────────
export const FAMILY_ALLOWED_ACTIONS = [
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
] as const;

// ─── Actions Family CANNOT perform ───────────────────────────────────────────
export const FAMILY_FORBIDDEN_ACTIONS = [
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
] as const;

export type FamilyAllowedAction   = typeof FAMILY_ALLOWED_ACTIONS[number];
export type FamilyForbiddenAction = typeof FAMILY_FORBIDDEN_ACTIONS[number];

/**
 * Check if a family member is allowed to perform an action.
 * Use this in UI to conditionally show/hide controls.
 */
export function familyCanDo(action: FamilyAllowedAction | FamilyForbiddenAction): boolean {
  return (FAMILY_ALLOWED_ACTIONS as readonly string[]).includes(action);
}

/**
 * Alert routing tiers for Care Circle broadcast.
 * Determines which relationship types receive each event type.
 */
export const CARE_CIRCLE_ROUTING = {
  SOS_TRIGGERED:        ['CAREGIVER', 'GUARDIAN', 'FAMILY_CLOSE', 'FAMILY_EXTENDED'],
  ZONE_EXIT:            ['CAREGIVER', 'GUARDIAN', 'FAMILY_CLOSE'],
  APPROACHING_BOUNDARY: ['CAREGIVER', 'GUARDIAN'],
  TASK_MISSED_CRITICAL: ['CAREGIVER', 'GUARDIAN', 'FAMILY_CLOSE'],
  NO_SIGNAL:            ['CAREGIVER', 'GUARDIAN', 'FAMILY_CLOSE'],
  BATTERY_CRITICAL:     ['CAREGIVER', 'FAMILY_CLOSE'],
  GENERAL:              ['CAREGIVER', 'GUARDIAN', 'FAMILY_CLOSE'],
} as const;
