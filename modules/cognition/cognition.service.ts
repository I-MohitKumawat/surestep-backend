import pool from '../../db/config';
import { AppError } from '../../shared/errors/AppError';

export async function recordSession(patientId: string, data: {
  game_type: string; difficulty_level: number; duration_seconds: number;
  completed: boolean; score?: number; error_count?: number; hint_count?: number;
  metrics?: Array<{ metric_type: string; value: number; context?: any }>;
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const session = await client.query(
      `INSERT INTO game_sessions
         (patient_id, game_type, difficulty_level, duration_seconds,
          completed, score, error_count, hint_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        patientId, data.game_type, data.difficulty_level ?? 1,
        data.duration_seconds, data.completed ?? false,
        data.score ?? null, data.error_count ?? 0, data.hint_count ?? 0,
      ],
    );

    const sessionId = session.rows[0].id;

    // Insert metrics batch
    if (data.metrics && data.metrics.length > 0) {
      for (const m of data.metrics) {
        await client.query(
          `INSERT INTO game_metrics (session_id, metric_type, value, context)
           VALUES ($1,$2,$3,$4)`,
          [sessionId, m.metric_type, m.value, m.context ? JSON.stringify(m.context) : null],
        );
      }
    }

    await client.query('COMMIT');
    return session.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getSessions(patientId: string, limit = 20, cursor?: string) {
  let query = `SELECT * FROM game_sessions WHERE patient_id = $1`;
  const params: any[] = [patientId];
  if (cursor) { query += ` AND played_at < $2`; params.push(cursor); }
  query += ` ORDER BY played_at DESC LIMIT $${params.length + 1}`;
  params.push(limit + 1);

  const result = await pool.query(query, params);
  const has_more = result.rows.length > limit;
  const sessions = has_more ? result.rows.slice(0, limit) : result.rows;
  return { sessions, has_more, next_cursor: has_more ? sessions[sessions.length - 1].played_at : null };
}

export async function getAssessments(patientId: string) {
  const result = await pool.query(
    `SELECT * FROM cognitive_assessments WHERE patient_id = $1 ORDER BY period_start DESC LIMIT 12`,
    [patientId],
  );
  return result.rows;
}
