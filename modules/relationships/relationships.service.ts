/**
 * SureStep — modules/relationships/relationships.service.ts
 *
 * Canonical read models for Caregiver/Patient/Family visibility.
 * All relationship state is derived from care_circles, care_circle_members,
 * caregiver_relationships, and patient_assignments.
 *
 * Legacy patient_relationships-backed workflows are retired.
 */
import pool from '../../db/config';
import * as discoveryService from '../discovery/discovery.service';
import { computeLocationFreshness } from '../../shared/utils/locationFreshness';

/**
 * Patients actively assigned to the authenticated Professional Caregiver.
 */
export async function getMyPatients(caregiverId: string) {
  const result = await pool.query(
    `SELECT u.id, u.name, u.photo_url, u.city, u.preferred_language, u.date_of_birth, u.phone,
            cr.id as relationship_id, 'CAREGIVER' as relationship_type,
            cr.start_date as confirmed_at, cr.status as relationship_status,
            ps.location_state, ps.safety_state, ps.routine_state, ps.engagement_state,
            ps.last_ping_at, ps.sos_active, ps.computed_at,
            sz.name AS current_zone_name,
            COALESCE(ps.battery_pct, lp.battery_pct) AS battery_pct,
            ps.network_status,
            lp.accuracy_m, lp.speed_kmh, lp.recorded_at AS latest_ping_at,
            (
              SELECT COUNT(*)::int
              FROM safe_zone_monitors szm
              JOIN safe_zones sz2 ON sz2.id = szm.safe_zone_id
              JOIN care_circles c2 ON sz2.circle_id = c2.id
              WHERE szm.patient_id = pa.patient_id
                AND sz2.is_active = TRUE
                AND c2.terminated_at IS NULL
            ) AS monitored_zone_count
     FROM patient_assignments pa
     JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
     JOIN care_circles c ON cr.circle_id = c.id
     JOIN users u ON u.id = pa.patient_id
     LEFT JOIN patient_states ps ON ps.patient_id = pa.patient_id
     LEFT JOIN safe_zones sz ON sz.id = ps.last_known_zone_id
     LEFT JOIN LATERAL (
       SELECT battery_pct, accuracy_m, speed_kmh, recorded_at FROM location_pings
       WHERE patient_id = pa.patient_id
       ORDER BY recorded_at DESC LIMIT 1
     ) lp ON TRUE
     WHERE cr.caregiver_id = $1
       AND pa.is_active = TRUE
       AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
       AND c.terminated_at IS NULL
     ORDER BY
       ps.sos_active DESC NULLS LAST,
       CASE ps.safety_state WHEN 'CRITICAL' THEN 0 WHEN 'BREACH' THEN 1 WHEN 'APPROACHING' THEN 2 ELSE 3 END,
       u.name`,
    [caregiverId],
  );
  return result.rows.map((row: any) => {
    const effectivePingAt = row.last_ping_at ?? row.latest_ping_at ?? null;
    const freshness = computeLocationFreshness(effectivePingAt, row.accuracy_m);
    const monitoredZoneCount = Number(row.monitored_zone_count ?? 0);
    const hasActiveSafeZone = monitoredZoneCount > 0;
    const zoneName = hasActiveSafeZone ? (row.current_zone_name ?? null) : null;

    return {
      ...row,
      last_ping_at: effectivePingAt,
      location_freshness: freshness.freshness_tier,
      is_low_confidence: freshness.is_low_confidence,
      location_age_minutes: freshness.age_minutes,
      monitored_zone_count: monitoredZoneCount,
      has_active_safe_zone: hasActiveSafeZone,
      last_known_zone_name: zoneName,
      current_zone_name: freshness.freshness_tier === 'CURRENT' ? zoneName : null,
    };
  });
}

/**
 * Caregivers actively assigned to a Patient.
 */
export async function getMyCaregivers(patientId: string) {
  const result = await pool.query(
    `SELECT u.id, u.name, u.photo_url, u.city, u.phone,
            c.bio, c.years_of_experience, c.specializations, c.languages_spoken,
            c.availability_types, c.hourly_rate as hourly_rate_inr, c.daily_rate as daily_rate_inr,
            c.professional_role, c.rating, c.rating_count,
            cr.id as relationship_id, 'CAREGIVER' as relationship_type,
            cr.status, pa.assigned_at as confirmed_at
     FROM patient_assignments pa
     JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
     JOIN care_circles cc ON cr.circle_id = cc.id
     JOIN users u ON u.id = cr.caregiver_id
     LEFT JOIN caregiver_profiles c ON c.user_id = cr.caregiver_id
     WHERE pa.patient_id = $1
       AND pa.is_active = TRUE
       AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
       AND cc.terminated_at IS NULL
     ORDER BY pa.assigned_at DESC NULLS LAST, cr.created_at DESC`,
    [patientId],
  );
  return result.rows;
}

/**
 * Members of the Patient's active Care Circle. For a FAMILY caller the
 * Patient is resolved from their Circle participation.
 */
export async function getMyFamily(userId: string, role: string) {
  let patientId = userId;

  if (role === 'FAMILY') {
    const resolved = await pool.query(
      `SELECT pca.patient_id
       FROM patient_circle_associations pca
       JOIN care_circles c ON pca.circle_id = c.id AND c.terminated_at IS NULL
       WHERE c.owner_id = $1
          OR EXISTS (
            SELECT 1 FROM care_circle_members m
            WHERE m.circle_id = c.id AND m.user_id = $1
          )
       ORDER BY pca.associated_at DESC
       LIMIT 1`,
      [userId],
    );
    if (!resolved.rows[0]) return [];
    patientId = resolved.rows[0].patient_id;
  }

  const result = await pool.query(
    `SELECT u.id, u.name, u.photo_url, u.phone,
            COALESCE(ccm.role_in_circle, 'Circle Member') as relationship_type,
            'CONFIRMED' as status,
            ccm.joined_at as confirmed_at
     FROM patient_circle_associations pca
     JOIN care_circles c ON pca.circle_id = c.id AND c.terminated_at IS NULL
     JOIN care_circle_members ccm ON ccm.circle_id = c.id
     JOIN users u ON u.id = ccm.user_id
     WHERE pca.patient_id = $1
     UNION
     SELECT u.id, u.name, u.photo_url, u.phone,
            'Owner' as relationship_type,
            'CONFIRMED' as status,
            c.created_at as confirmed_at
     FROM patient_circle_associations pca
     JOIN care_circles c ON pca.circle_id = c.id AND c.terminated_at IS NULL
     JOIN users u ON u.id = c.owner_id
     WHERE pca.patient_id = $1
     ORDER BY relationship_type, name`,
    [patientId],
  );
  return result.rows;
}

/**
 * Caregiver discovery search. Delegates to the canonical discovery service;
 * phone/email are never exposed.
 */
export async function searchCaregivers(patientId: string, query: string) {
  const userRes = await pool.query(`SELECT * FROM users WHERE id = $1`, [patientId]);
  const user = userRes.rows[0];
  if (!user) return [];

  const response = await discoveryService.searchCaregivers(
    { query, limit: 50, page: 1, sortBy: 'newest' },
    user,
  );

  return response.caregivers.map((c) => ({
    id: c.caregiverId,
    name: c.name,
    photo_url: c.photoUrl,
    city: c.serviceCity,
    bio: c.bioSummary,
    years_of_experience: c.yearsOfExperience,
    specializations: c.specializations,
    languages_spoken: c.languagesSpoken,
    availability_types: c.availabilityTypes,
    service_radius_km: c.serviceRadiusKm,
    hourly_rate_inr: c.hourlyRateInr,
    daily_rate_inr: c.dailyRateInr,
    rating: c.rating,
    rating_count: c.ratingCount,
    professional_role: c.professionalRole,
  }));
}
