-- Truncate all tables in the SureStep database to delete all application data
-- but keep the schema and tables intact.
BEGIN;

TRUNCATE TABLE 
  appointments,
  care_notes,
  caregiver_handovers,
  caregiver_payments,
  caregiver_profiles,
  caregiver_ratings,
  caregiver_wellbeing_logs,
  cognitive_assessments,
  daily_adherence_snapshots,
  device_registry,
  familiarity_faces,
  family_profiles,
  family_story_posts,
  game_metrics,
  game_sessions,
  geofence_alerts,
  geofence_zones,
  incident_reports,
  invite_codes,
  location_pings,
  memory_items,
  patient_profiles,
  patient_relationships,
  patient_states,
  patient_threads,
  routine_attachments,
  routine_execution_times,
  routine_templates,
  shared_documents,
  subscriptions,
  tasks,
  thread_messages,
  users,
  voice_messages,
  voice_samples
RESTART IDENTITY CASCADE;

COMMIT;
