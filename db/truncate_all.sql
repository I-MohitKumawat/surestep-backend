-- Truncate all canonical application tables, preserving schema and migration history.
-- Run with: psql "$DATABASE_URL" -f db/truncate_all.sql
--
-- This list reflects the canonical schema after migrations 001-023. When a new
-- canonical table is added by a migration, add it here as well so the reset
-- remains deterministic.

BEGIN;

TRUNCATE TABLE
  activity_attempts,
  care_assessments,
  care_circle_members,
  care_circles,
  care_plans,
  care_requests,
  caregiver_payments,
  caregiver_profiles,
  caregiver_relationships,
  circle_invitations,
  circle_join_requests,
  circle_permissions,
  cognitive_assessments,
  device_registry,
  familiarity_faces,
  family_profiles,
  family_story_posts,
  game_metrics,
  game_sessions,
  location_observations,
  location_pings,
  memories,
  memory_items,
  notification_logs,
  notification_settings,
  patient_assignments,
  patient_circle_associations,
  patient_profiles,
  patient_relationships_archive,
  patient_states,
  routine_completions,
  routine_definitions,
  routine_occurrences,
  safe_zone_monitors,
  safe_zones,
  safety_alert_responses,
  safety_alerts,
  subscriptions,
  user_locations,
  users,
  voice_messages,
  voice_samples
RESTART IDENTITY CASCADE;

COMMIT;
