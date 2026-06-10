import pool from '../../db/config';
import { AppError } from '../../shared/errors/AppError';

export interface AssessmentPayload {
  status: 'DRAFT' | 'COMPLETED';
  patient_basics: any;
  emergency_contacts: any[];
  cognitive: any;
  risk: any;
  mobility: string;
  support_needs: any;
  tech_comfort: string;
  notes: any;
}

export async function getLatestAssessment(patientId: string) {
  const result = await pool.query(
    `SELECT * FROM care_assessments
     WHERE patient_id = $1 AND is_latest = TRUE`,
    [patientId],
  );
  return result.rows[0] ?? null;
}

export async function getAssessmentHistory(patientId: string) {
  const result = await pool.query(
    `SELECT id, version, status, created_at, updated_at
     FROM care_assessments
     WHERE patient_id = $1
     ORDER BY version DESC`,
    [patientId],
  );
  return result.rows;
}

export async function getAssessmentById(id: string) {
  const result = await pool.query(
    `SELECT * FROM care_assessments WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function saveAssessment(
  caregiverId: string,
  patientId: string,
  payload: AssessmentPayload,
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify caregiver relationship status
    const relResult = await client.query(
      `SELECT status FROM patient_relationships
       WHERE patient_user_id = $1 AND related_user_id = $2 AND relationship_type = 'CAREGIVER'`,
      [patientId, caregiverId],
    );

    if (!relResult.rows[0]) {
      throw new AppError('FORBIDDEN', 'No caregiver relationship exists for this patient', 403);
    }

    const currentRelStatus = relResult.rows[0].status;
    const allowedStatuses = ['MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE'];
    if (!allowedStatuses.includes(currentRelStatus)) {
      throw new AppError(
        'FORBIDDEN',
        `Assessment cannot be started. Relationship status is ${currentRelStatus}. Meeting must be completed first.`,
        403,
      );
    }

    // 2. Look for existing latest assessment
    const existingResult = await client.query(
      `SELECT * FROM care_assessments
       WHERE patient_id = $1 AND is_latest = TRUE`,
      [patientId],
    );

    const existing = existingResult.rows[0];

    let assessmentId = '';
    let nextVersion = 1;
    let shouldInsertNew = true;

    if (existing) {
      if (existing.status === 'DRAFT') {
        // If it's a DRAFT, we update in-place
        shouldInsertNew = false;
        assessmentId = existing.id;
        nextVersion = existing.version;
      } else {
        // If it's COMPLETED, we must create a new version and set is_latest = false on the old one
        await client.query(
          `UPDATE care_assessments SET is_latest = FALSE WHERE id = $1`,
          [existing.id],
        );
        nextVersion = existing.version + 1;
      }
    }

    if (shouldInsertNew) {
      const insertRes = await client.query(
        `INSERT INTO care_assessments (
          patient_id, caregiver_id, version, status, is_latest,
          patient_basics, emergency_contacts, cognitive, risk,
          mobility, support_needs, tech_comfort, notes
         )
         VALUES ($1, $2, $3, $4, TRUE, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          patientId,
          caregiverId,
          nextVersion,
          payload.status,
          payload.patient_basics || {},
          JSON.stringify(payload.emergency_contacts || []),
          payload.cognitive || {},
          payload.risk || {},
          payload.mobility || 'Independent',
          payload.support_needs || {},
          payload.tech_comfort || 'Independent smartphone use',
          payload.notes || {},
        ],
      );
      assessmentId = insertRes.rows[0].id;
    } else {
      // Update in-place
      await client.query(
        `UPDATE care_assessments
         SET status = $1,
             patient_basics = $2,
             emergency_contacts = $3,
             cognitive = $4,
             risk = $5,
             mobility = $6,
             support_needs = $7,
             tech_comfort = $8,
             notes = $9,
             updated_at = NOW()
         WHERE id = $10`,
        [
          payload.status,
          payload.patient_basics || {},
          JSON.stringify(payload.emergency_contacts || []),
          payload.cognitive || {},
          payload.risk || {},
          payload.mobility || 'Independent',
          payload.support_needs || {},
          payload.tech_comfort || 'Independent smartphone use',
          payload.notes || {},
          assessmentId,
        ],
      );
    }

    // 3. Status progression logic
    let nextRelStatus = currentRelStatus;
    if (payload.status === 'COMPLETED') {
      nextRelStatus = 'ACTIVE_CARE';
    } else if (currentRelStatus === 'MEETING_COMPLETED') {
      nextRelStatus = 'ASSESSMENT_PENDING';
    }

    if (nextRelStatus !== currentRelStatus) {
      await client.query(
        `UPDATE patient_relationships
         SET status = $1, confirmed_at = COALESCE(confirmed_at, NOW())
         WHERE patient_user_id = $2 AND related_user_id = $3 AND relationship_type = 'CAREGIVER'`,
        [nextRelStatus, patientId, caregiverId],
      );
    }

    // 4. Generate/Update Care Plan if status is COMPLETED
    if (payload.status === 'COMPLETED') {
      const goals = generateGoals(payload);
      const monitoring = generateMonitoring(payload);
      const riskProfile = {
        fall_risk: payload.risk?.fall_risk || 'Low',
        wandering_risk: payload.risk?.wandering_risk || 'Low',
        medication_adherence_risk: payload.risk?.medication_adherence_risk || 'Low',
        emergency_risk: payload.risk?.emergency_risk || 'Low',
      };

      // Check if Care Plan already exists for this patient
      const cpCheck = await client.query(
        `SELECT id FROM care_plans WHERE patient_id = $1`,
        [patientId],
      );

      if (cpCheck.rows[0]) {
        await client.query(
          `UPDATE care_plans
           SET assessment_id = $1,
               care_goals = $2,
               monitoring_requirements = $3,
               risk_profile = $4,
               updated_at = NOW()
           WHERE patient_id = $5`,
          [assessmentId, goals, monitoring, riskProfile, patientId],
        );
      } else {
        await client.query(
          `INSERT INTO care_plans (
            patient_id, assessment_id, care_goals, monitoring_requirements,
            recommended_routines, recommended_geofencing, risk_profile
           )
           VALUES ($1, $2, $3, $4, '[]'::jsonb, '{}'::jsonb, $5)`,
          [patientId, assessmentId, goals, monitoring, riskProfile],
        );
      }
    }

    await client.query('COMMIT');
    return { assessmentId, status: payload.status, relationshipStatus: nextRelStatus };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Helper Functions for Care Plan Defaults ─────────────────────────────────

function generateGoals(payload: AssessmentPayload): string {
  const goals: string[] = [];
  goals.push(`Provide comprehensive caregiver support for ${payload.patient_basics?.preferred_name || 'Patient'}.`);

  if (payload.mobility && payload.mobility !== 'Independent') {
    goals.push(`Support mobility constraints (Level: ${payload.mobility}).`);
  }

  const needs = payload.support_needs || {};
  if (needs.medication_reminders) goals.push('Establish and monitor a strict medication schedule.');
  if (needs.meal_reminders) goals.push('Ensure regular nutrition and meal reminders.');
  if (needs.hydration_reminders) goals.push('Keep patient hydrated throughout the day.');
  if (needs.safety_monitoring) goals.push('Set up geofences to track patient wandering risk.');

  return goals.join('\n');
}

function generateMonitoring(payload: AssessmentPayload): string {
  const requirements: string[] = [];

  const risk = payload.risk || {};
  if (risk.fall_risk === 'High') {
    requirements.push('Fall Risk: High. Requires close monitoring during ambulation.');
  }
  if (risk.wandering_risk === 'High') {
    requirements.push('Wandering Risk: High. Establish hard geofence alert notification.');
  }

  const needs = payload.support_needs || {};
  if (needs.safety_monitoring) {
    requirements.push('Safety monitoring via active GPS geofencing requested.');
  }

  if (requirements.length === 0) {
    requirements.push('Standard daily wellbeing checks and routine monitoring.');
  }

  return requirements.join('\n');
}
