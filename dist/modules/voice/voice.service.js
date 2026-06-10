"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadSample = uploadSample;
exports.getSamples = getSamples;
exports.deleteSample = deleteSample;
exports.sendManualMessage = sendManualMessage;
exports.getMessages = getMessages;
exports.addFace = addFace;
exports.getFaces = getFaces;
exports.postStory = postStory;
exports.getStories = getStories;
exports.reactToStory = reactToStory;
exports.addMemory = addMemory;
exports.getDailyMemory = getDailyMemory;
const config_1 = __importDefault(require("../../db/config"));
const AppError_1 = require("../../shared/errors/AppError");
// ─── Voice Samples ────────────────────────────────────────────────────────────
async function uploadSample(recordedBy, patientId, data) {
    const result = await config_1.default.query(`INSERT INTO voice_samples
       (recorded_by, patient_id, label, storage_path, duration_seconds, quality_score, consent_given_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`, [recordedBy, patientId, data.label, data.storage_path, data.duration_seconds,
        data.quality_score ?? null, data.consent_given_at]);
    return result.rows[0];
}
async function getSamples(patientId) {
    const result = await config_1.default.query('SELECT * FROM voice_samples WHERE patient_id = $1 ORDER BY created_at DESC', [patientId]);
    return result.rows;
}
async function deleteSample(sampleId, userId) {
    // Consent record is NEVER deleted — only the storage path is cleared
    const result = await config_1.default.query(`UPDATE voice_samples
     SET storage_path = '', clone_status = 'FAILED', clone_voice_id = NULL
     WHERE id = $1 AND recorded_by = $2
     RETURNING id`, [sampleId, userId]);
    if (!result.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Sample not found or not authorised', 404);
}
// ─── Voice Messages ───────────────────────────────────────────────────────────
async function sendManualMessage(senderId, patientId, data) {
    const result = await config_1.default.query(`INSERT INTO voice_messages (patient_id, sender_id, trigger_type, voice_sample_id, script, status)
     VALUES ($1,$2,'MANUAL',$3,$4,'QUEUED')
     RETURNING *`, [patientId, senderId, data.voice_sample_id ?? null, data.script]);
    return result.rows[0];
}
async function getMessages(patientId, limit = 20, cursor) {
    let query = `SELECT * FROM voice_messages WHERE patient_id = $1`;
    const params = [patientId];
    if (cursor) {
        query += ` AND created_at < $2`;
        params.push(cursor);
    }
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit + 1);
    const result = await config_1.default.query(query, params);
    const has_more = result.rows.length > limit;
    const messages = has_more ? result.rows.slice(0, limit) : result.rows;
    return { messages, has_more, next_cursor: has_more ? messages[messages.length - 1].created_at : null };
}
// ─── Familiarity — Faces ──────────────────────────────────────────────────────
async function addFace(uploadedBy, patientId, data) {
    const result = await config_1.default.query(`INSERT INTO familiarity_faces (patient_id, uploaded_by, person_name, relationship_label, photo_url, display_order)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [patientId, uploadedBy, data.person_name, data.relationship_label, data.photo_url, data.display_order ?? 0]);
    return result.rows[0];
}
async function getFaces(patientId) {
    const result = await config_1.default.query('SELECT * FROM familiarity_faces WHERE patient_id = $1 ORDER BY display_order, created_at', [patientId]);
    return result.rows;
}
// ─── Family Story Posts ───────────────────────────────────────────────────────
async function postStory(postedBy, patientId, data) {
    const result = await config_1.default.query(`INSERT INTO family_story_posts (patient_id, posted_by, caption, photo_url, voice_note_url)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`, [patientId, postedBy, data.caption ?? null, data.photo_url ?? null, data.voice_note_url ?? null]);
    return result.rows[0];
}
async function getStories(patientId, limit = 10, cursor) {
    let query = `
    SELECT sp.*, u.name as posted_by_name, u.photo_url as posted_by_photo
    FROM family_story_posts sp JOIN users u ON u.id = sp.posted_by
    WHERE sp.patient_id = $1 AND sp.is_approved = TRUE
  `;
    const params = [patientId];
    if (cursor) {
        query += ` AND sp.created_at < $2`;
        params.push(cursor);
    }
    query += ` ORDER BY sp.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit + 1);
    const result = await config_1.default.query(query, params);
    const has_more = result.rows.length > limit;
    const stories = has_more ? result.rows.slice(0, limit) : result.rows;
    return { stories, has_more, next_cursor: has_more ? stories[stories.length - 1].created_at : null };
}
async function reactToStory(storyId, patientId) {
    const result = await config_1.default.query(`UPDATE family_story_posts SET patient_reacted = TRUE, reaction_at = NOW()
     WHERE id = $1 AND patient_id = $2 RETURNING *`, [storyId, patientId]);
    if (!result.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Story not found', 404);
    return result.rows[0];
}
// ─── Memory Items ─────────────────────────────────────────────────────────────
async function addMemory(uploadedBy, patientId, data) {
    const result = await config_1.default.query(`INSERT INTO memory_items (patient_id, uploaded_by, title, description, photo_url, voice_note_url, year)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [patientId, uploadedBy, data.title, data.description ?? null, data.photo_url ?? null,
        data.voice_note_url ?? null, data.year ?? null]);
    return result.rows[0];
}
async function getDailyMemory(patientId) {
    // Surface least-recently shown memory
    const result = await config_1.default.query(`SELECT * FROM memory_items WHERE patient_id = $1
     ORDER BY last_shown_at ASC NULLS FIRST, created_at LIMIT 1`, [patientId]);
    if (!result.rows[0])
        return null;
    await config_1.default.query(`UPDATE memory_items SET last_shown_at = NOW(), show_count = show_count + 1 WHERE id = $1`, [result.rows[0].id]);
    return result.rows[0];
}
//# sourceMappingURL=voice.service.js.map