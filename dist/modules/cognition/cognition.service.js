"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordSession = recordSession;
exports.getSessions = getSessions;
exports.getAssessments = getAssessments;
const config_1 = __importDefault(require("../../db/config"));
async function recordSession(patientId, data) {
    const client = await config_1.default.connect();
    try {
        await client.query('BEGIN');
        const session = await client.query(`INSERT INTO game_sessions
         (patient_id, game_type, difficulty_level, duration_seconds,
          completed, score, error_count, hint_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [
            patientId, data.game_type, data.difficulty_level ?? 1,
            data.duration_seconds, data.completed ?? false,
            data.score ?? null, data.error_count ?? 0, data.hint_count ?? 0,
        ]);
        const sessionId = session.rows[0].id;
        // Insert metrics batch
        if (data.metrics && data.metrics.length > 0) {
            for (const m of data.metrics) {
                await client.query(`INSERT INTO game_metrics (session_id, metric_type, value, context)
           VALUES ($1,$2,$3,$4)`, [sessionId, m.metric_type, m.value, m.context ? JSON.stringify(m.context) : null]);
            }
        }
        // Authoritative observational logging in activity_attempts (TARGET_ARCHITECTURE §3.7)
        const mappedType = data.game_type === 'PHOTO_MATCH' || data.game_type === 'PUZZLE' || data.game_type === 'BREATHING_GUIDE'
            ? data.game_type
            : data.game_type?.toLowerCase().includes('photo')
                ? 'PHOTO_MATCH'
                : data.game_type?.toLowerCase().includes('breath')
                    ? 'BREATHING_GUIDE'
                    : 'PUZZLE';
        await client.query(`INSERT INTO activity_attempts (patient_id, activity_type, duration_seconds, completed, metrics)
       VALUES ($1, $2, $3, $4, $5)`, [
            patientId,
            mappedType,
            Math.max(0, data.duration_seconds || 0),
            Boolean(data.completed),
            JSON.stringify({ error_count: data.error_count ?? 0, hint_count: data.hint_count ?? 0 }),
        ]);
        await client.query('COMMIT');
        return session.rows[0];
    }
    catch (e) {
        await client.query('ROLLBACK');
        throw e;
    }
    finally {
        client.release();
    }
}
async function getSessions(patientId, limit = 20, cursor) {
    let query = `SELECT * FROM game_sessions WHERE patient_id = $1`;
    const params = [patientId];
    if (cursor) {
        query += ` AND played_at < $2`;
        params.push(cursor);
    }
    query += ` ORDER BY played_at DESC LIMIT $${params.length + 1}`;
    params.push(limit + 1);
    const result = await config_1.default.query(query, params);
    const has_more = result.rows.length > limit;
    const sessions = has_more ? result.rows.slice(0, limit) : result.rows;
    return { sessions, has_more, next_cursor: has_more ? sessions[sessions.length - 1].played_at : null };
}
async function getAssessments(patientId) {
    const result = await config_1.default.query(`SELECT * FROM cognitive_assessments WHERE patient_id = $1 ORDER BY period_start DESC LIMIT 12`, [patientId]);
    return {
        assessments: result.rows,
        clinical_disclaimer: 'Voluntary familiarity and engagement activities. Not a clinical assessment or medical diagnostic tool.',
    };
}
//# sourceMappingURL=cognition.service.js.map