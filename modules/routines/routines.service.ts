import pool from '../../db/config';
import { AppError } from '../../shared/errors/AppError';

// ─── Templates ────────────────────────────────────────────────────────────────

export async function getTemplates(caregiverId: string) {
  const result = await pool.query(
    `SELECT * FROM routine_templates
     WHERE created_by = $1 OR is_library_item = TRUE
     ORDER BY is_library_item DESC, created_at DESC`,
    [caregiverId],
  );
  return result.rows;
}

export async function createTemplate(caregiverId: string, data: any) {
  const result = await pool.query(
    `INSERT INTO routine_templates (created_by, title, description, emoji, steps, patient_hint, duration_minutes, category)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [caregiverId, data.title, data.description ?? null, data.emoji ?? null,
     JSON.stringify(data.steps ?? []), data.patient_hint ?? null,
     data.duration_minutes ?? 15, data.category ?? null],
  );
  return result.rows[0];
}

export async function assignTemplate(
  templateId: string,
  caregiverId: string,
  data: { patient_id: string; scheduled_date: string; scheduled_time: string; is_critical?: boolean },
) {
  const tmpl = await pool.query('SELECT * FROM routine_templates WHERE id = $1', [templateId]);
  if (!tmpl.rows[0]) throw new AppError('NOT_FOUND', 'Template not found', 404);
  const t = tmpl.rows[0];

  const result = await pool.query(
    `INSERT INTO tasks
       (patient_id, assigned_by, template_id, title, description, patient_hint, emoji,
        steps, scheduled_time, scheduled_date, duration_minutes, is_critical)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [data.patient_id, caregiverId, templateId, t.title, t.description, t.patient_hint, t.emoji,
     t.steps, data.scheduled_time, data.scheduled_date, t.duration_minutes, data.is_critical ?? false],
  );
  return result.rows[0];
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function getTodayTasks(patientId: string) {
  const today = new Date().toISOString().split('T')[0];
  const result = await pool.query(
    `SELECT t.*, u.name as assigned_by_name, u.photo_url as assigned_by_photo
     FROM tasks t
     JOIN users u ON u.id = t.assigned_by
     WHERE t.patient_id = $1 AND t.scheduled_date = $2 AND t.deleted_at IS NULL
     ORDER BY t.scheduled_time`,
    [patientId, today],
  );
  return result.rows;
}

export async function getTaskHistory(
  patientId: string,
  from: string,
  to: string,
  limit = 50,
  cursor?: string,
) {
  let query = `
    SELECT * FROM tasks
    WHERE patient_id = $1 AND scheduled_date BETWEEN $2 AND $3
  `;
  const params: any[] = [patientId, from, to];

  if (cursor) {
    query += ` AND created_at < $${params.length + 1}`;
    params.push(cursor);
  }

  query += ` ORDER BY scheduled_date DESC, scheduled_time LIMIT $${params.length + 1}`;
  params.push(limit + 1);

  const result = await pool.query(query, params);
  const has_more = result.rows.length > limit;
  const tasks = has_more ? result.rows.slice(0, limit) : result.rows;
  return { tasks, has_more, next_cursor: has_more ? tasks[tasks.length - 1].created_at : null };
}

export async function createTask(caregiverId: string, patientId: string, data: any) {
  const result = await pool.query(
    `INSERT INTO tasks
       (patient_id, assigned_by, title, description, patient_hint, emoji, steps,
        scheduled_time, scheduled_date, duration_minutes, is_critical,
        recurrence_type, recurrence_days, recurrence_end)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      patientId, caregiverId, data.title, data.description ?? null, data.patient_hint ?? null,
      data.emoji ?? null, JSON.stringify(data.steps ?? []),
      data.scheduled_time, data.scheduled_date, data.duration_minutes ?? 15,
      data.is_critical ?? false, data.recurrence_type ?? 'NONE',
      data.recurrence_days ?? null, data.recurrence_end ?? null,
    ],
  );
  return result.rows[0];
}

export async function updateTask(taskId: string, caregiverId: string, data: any) {
  const task = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
  if (!task.rows[0]) throw new AppError('NOT_FOUND', 'Task not found', 404);
  if (task.rows[0].assigned_by !== caregiverId) throw new AppError('ROLE_NOT_PERMITTED', 'Not authorised to edit this task', 403);

  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;

  const allowed = ['title','description','patient_hint','emoji','scheduled_time','scheduled_date',
                   'duration_minutes','is_critical','caregiver_note','voice_note_url'];
  for (const key of allowed) {
    if (data[key] !== undefined) { fields.push(`${key} = $${i++}`); values.push(data[key]); }
  }
  if (fields.length === 0) throw new AppError('VALIDATION_ERROR', 'No fields to update', 422);

  values.push(taskId);
  const result = await pool.query(
    `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values,
  );
  return result.rows[0];
}

export async function deleteTask(taskId: string, caregiverId: string) {
  const result = await pool.query(
    `DELETE FROM tasks WHERE id = $1 AND assigned_by = $2 RETURNING id`,
    [taskId, caregiverId],
  );
  if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Task not found or not authorised', 404);
}

export async function markTaskComplete(taskId: string, patientId: string) {
  const result = await pool.query(
    `UPDATE tasks SET status = 'DONE', completed_at = NOW()
     WHERE id = $1 AND patient_id = $2 AND status = 'PENDING'
     RETURNING *`,
    [taskId, patientId],
  );
  if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Task not found or already completed', 404);
  return result.rows[0];
}

export async function markTaskUnsure(taskId: string, patientId: string) {
  const result = await pool.query(
    `UPDATE tasks SET status = 'UNSURE'
     WHERE id = $1 AND patient_id = $2
     RETURNING *`,
    [taskId, patientId],
  );
  if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Task not found', 404);
  return result.rows[0];
}
