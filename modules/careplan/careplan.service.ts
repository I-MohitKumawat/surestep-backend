import pool from '../../db/config';

export async function getCarePlanByPatientId(patientId: string) {
  const result = await pool.query(
    `SELECT cp.*, ca.version as assessment_version, ca.updated_at as assessment_completed_at
     FROM care_plans cp
     JOIN care_assessments ca ON ca.id = cp.assessment_id
     WHERE cp.patient_id = $1`,
    [patientId],
  );
  return result.rows[0] ?? null;
}
