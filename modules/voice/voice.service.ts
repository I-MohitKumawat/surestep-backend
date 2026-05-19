import pool from '../../db/config';
import { AppError } from '../../shared/errors/AppError';

// ─── Voice Samples ────────────────────────────────────────────────────────────

export async function uploadSample(recordedBy: string, patientId: string, data: {
  label: string; storage_path: string; duration_seconds: number;
  quality_score?: number; consent_given_at: string;
}) {
  const result = await pool.query(
    `INSERT INTO voice_samples
       (recorded_by, patient_id, label, storage_path, duration_seconds, quality_score, consent_given_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [recordedBy, patientId, data.label, data.storage_path, data.duration_seconds,
     data.quality_score ?? null, data.consent_given_at],
  );
  return result.rows[0];
}

export async function getSamples(patientId: string) {
  const result = await pool.query(
    'SELECT * FROM voice_samples WHERE patient_id = $1 ORDER BY created_at DESC',
    [patientId],
  );
  return result.rows;
}

export async function deleteSample(sampleId: string, userId: string) {
  // Consent record is NEVER deleted — only the storage path is cleared
  const result = await pool.query(
    `UPDATE voice_samples
     SET storage_path = '', clone_status = 'FAILED', clone_voice_id = NULL
     WHERE id = $1 AND recorded_by = $2
     RETURNING id`,
    [sampleId, userId],
  );
  if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Sample not found or not authorised', 404);
}

// ─── Voice Messages ───────────────────────────────────────────────────────────

export async function sendManualMessage(senderId: string, patientId: string, data: {
  script: string; voice_sample_id?: string;
}) {
  const result = await pool.query(
    `INSERT INTO voice_messages (patient_id, sender_id, trigger_type, voice_sample_id, script, status)
     VALUES ($1,$2,'MANUAL',$3,$4,'QUEUED')
     RETURNING *`,
    [patientId, senderId, data.voice_sample_id ?? null, data.script],
  );
  return result.rows[0];
}

export async function getMessages(patientId: string, limit = 20, cursor?: string) {
  let query = `SELECT * FROM voice_messages WHERE patient_id = $1`;
  const params: any[] = [patientId];
  if (cursor) { query += ` AND created_at < $2`; params.push(cursor); }
  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit + 1);

  const result = await pool.query(query, params);
  const has_more = result.rows.length > limit;
  const messages = has_more ? result.rows.slice(0, limit) : result.rows;
  return { messages, has_more, next_cursor: has_more ? messages[messages.length - 1].created_at : null };
}

// ─── Familiarity — Faces ──────────────────────────────────────────────────────

export async function addFace(uploadedBy: string, patientId: string, data: {
  person_name: string; relationship_label: string; photo_url: string; display_order?: number;
}) {
  const result = await pool.query(
    `INSERT INTO familiarity_faces (patient_id, uploaded_by, person_name, relationship_label, photo_url, display_order)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [patientId, uploadedBy, data.person_name, data.relationship_label, data.photo_url, data.display_order ?? 0],
  );
  return result.rows[0];
}

export async function getFaces(patientId: string) {
  const result = await pool.query(
    'SELECT * FROM familiarity_faces WHERE patient_id = $1 ORDER BY display_order, created_at',
    [patientId],
  );
  return result.rows;
}

// ─── Family Story Posts ───────────────────────────────────────────────────────

export async function postStory(postedBy: string, patientId: string, data: {
  caption?: string; photo_url?: string; voice_note_url?: string;
}) {
  const result = await pool.query(
    `INSERT INTO family_story_posts (patient_id, posted_by, caption, photo_url, voice_note_url)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [patientId, postedBy, data.caption ?? null, data.photo_url ?? null, data.voice_note_url ?? null],
  );
  return result.rows[0];
}

export async function getStories(patientId: string, limit = 10, cursor?: string) {
  let query = `
    SELECT sp.*, u.name as posted_by_name, u.photo_url as posted_by_photo
    FROM family_story_posts sp JOIN users u ON u.id = sp.posted_by
    WHERE sp.patient_id = $1 AND sp.is_approved = TRUE
  `;
  const params: any[] = [patientId];
  if (cursor) { query += ` AND sp.created_at < $2`; params.push(cursor); }
  query += ` ORDER BY sp.created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit + 1);

  const result = await pool.query(query, params);
  const has_more = result.rows.length > limit;
  const stories = has_more ? result.rows.slice(0, limit) : result.rows;
  return { stories, has_more, next_cursor: has_more ? stories[stories.length - 1].created_at : null };
}

export async function reactToStory(storyId: string, patientId: string) {
  const result = await pool.query(
    `UPDATE family_story_posts SET patient_reacted = TRUE, reaction_at = NOW()
     WHERE id = $1 AND patient_id = $2 RETURNING *`,
    [storyId, patientId],
  );
  if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Story not found', 404);
  return result.rows[0];
}

// ─── Memory Items ─────────────────────────────────────────────────────────────

export async function addMemory(uploadedBy: string, patientId: string, data: any) {
  const result = await pool.query(
    `INSERT INTO memory_items (patient_id, uploaded_by, title, description, photo_url, voice_note_url, year)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [patientId, uploadedBy, data.title, data.description ?? null, data.photo_url ?? null,
     data.voice_note_url ?? null, data.year ?? null],
  );
  return result.rows[0];
}

export async function getDailyMemory(patientId: string) {
  // Surface least-recently shown memory
  const result = await pool.query(
    `SELECT * FROM memory_items WHERE patient_id = $1
     ORDER BY last_shown_at ASC NULLS FIRST, created_at LIMIT 1`,
    [patientId],
  );
  if (!result.rows[0]) return null;
  await pool.query(
    `UPDATE memory_items SET last_shown_at = NOW(), show_count = show_count + 1 WHERE id = $1`,
    [result.rows[0].id],
  );
  return result.rows[0];
}
