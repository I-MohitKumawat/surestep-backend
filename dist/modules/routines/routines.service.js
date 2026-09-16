"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRoutineTemplates = getRoutineTemplates;
exports.createRoutineTemplate = createRoutineTemplate;
exports.updateRoutineTemplate = updateRoutineTemplate;
exports.deactivateRoutineTemplate = deactivateRoutineTemplate;
exports.addAttachment = addAttachment;
exports.removeAttachment = removeAttachment;
exports.syncTodayTasksForPatient = syncTodayTasksForPatient;
exports.emitRoutineSyncEvents = emitRoutineSyncEvents;
exports.getTodayTasks = getTodayTasks;
exports.getTaskHistory = getTaskHistory;
exports.createTask = createTask;
exports.updateTask = updateTask;
exports.deleteTask = deleteTask;
exports.updateTaskStatus = updateTaskStatus;
exports.getAdherenceSnapshot = getAdherenceSnapshot;
exports.getTemplates = getTemplates;
exports.markTaskComplete = markTaskComplete;
exports.markTaskUnsure = markTaskUnsure;
/**
 * SureStep Backend — modules/routines/routines.service.ts
 * Routine templates (care plan definitions), execution times, attachments,
 * task instances, idempotent status updates, and adherence snapshots.
 */
const config_1 = __importDefault(require("../../db/config"));
const AppError_1 = require("../../shared/errors/AppError");
// ─── Routine Templates ────────────────────────────────────────────────────────
/** Fetch all active routine templates for a patient, eager-loading execution times and attachments. */
async function getRoutineTemplates(patientId) {
    const { rows: templates } = await config_1.default.query(`SELECT rt.*,
       COALESCE(
         json_agg(DISTINCT ret.*) FILTER (WHERE ret.id IS NOT NULL), '[]'
       ) AS execution_times,
       COALESCE(
         json_agg(DISTINCT ra.*) FILTER (WHERE ra.id IS NOT NULL), '[]'
       ) AS attachments
     FROM routine_templates rt
     LEFT JOIN routine_execution_times ret ON ret.template_id = rt.id
     LEFT JOIN routine_attachments      ra  ON ra.template_id  = rt.id
     WHERE rt.patient_id = $1 AND rt.is_active = TRUE
     GROUP BY rt.id
     ORDER BY rt.created_at DESC`, [patientId]);
    return templates;
}
/** Create a new routine template with nested execution times. */
async function createRoutineTemplate(createdBy, patientId, data) {
    const client = await config_1.default.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`INSERT INTO routine_templates
         (patient_id, created_by, title, instructions_md, caregiver_notes,
          category, priority, icon_name, start_date, end_date,
          recurrence_pattern, completion_window)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::INTERVAL)
       RETURNING *`, [
            patientId, createdBy,
            data.title,
            data.instructions_md ?? null,
            data.caregiver_notes ?? null,
            data.category ?? 'custom',
            data.priority ?? 'medium',
            data.icon_name ?? null,
            data.start_date ?? new Date().toISOString().split('T')[0],
            data.end_date ?? null,
            JSON.stringify(data.recurrence_pattern ?? { type: 'DAILY' }),
            data.completion_window ?? '1 hour',
        ]);
        const template = rows[0];
        const executionTimes = [];
        if (Array.isArray(data.execution_times) && data.execution_times.length > 0) {
            for (const et of data.execution_times) {
                const etRow = await client.query(`INSERT INTO routine_execution_times (template_id, scheduled_time)
           VALUES ($1, $2) RETURNING *`, [template.id, et.scheduled_time]);
                executionTimes.push(etRow.rows[0]);
            }
        }
        const syncRes = await syncTodayTasksForPatient(patientId, client);
        await client.query('COMMIT');
        await emitRoutineSyncEvents(patientId, syncRes);
        return { ...template, execution_times: executionTimes, attachments: [] };
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
/** Update a routine template's fields and execution times. */
async function updateRoutineTemplate(templateId, createdBy, data) {
    const client = await config_1.default.connect();
    try {
        await client.query('BEGIN');
        const { rows: existing } = await client.query('SELECT * FROM routine_templates WHERE id = $1', [templateId]);
        if (!existing[0])
            throw new AppError_1.AppError('NOT_FOUND', 'Routine template not found', 404);
        if (existing[0].created_by !== createdBy)
            throw new AppError_1.AppError('ROLE_NOT_PERMITTED', 'Not authorised', 403);
        const allowed = [
            'title', 'instructions_md', 'caregiver_notes', 'category', 'priority',
            'icon_name', 'start_date', 'end_date', 'recurrence_pattern', 'completion_window',
        ];
        const fields = [];
        const values = [];
        let i = 1;
        for (const key of allowed) {
            if (data[key] !== undefined) {
                fields.push(`${key} = $${i++}`);
                values.push(key === 'recurrence_pattern' ? JSON.stringify(data[key]) : data[key]);
            }
        }
        if (fields.length > 0) {
            values.push(templateId);
            await client.query(`UPDATE routine_templates SET ${fields.join(', ')} WHERE id = $${i}`, values);
        }
        if (data.execution_times !== undefined) {
            await client.query('DELETE FROM routine_execution_times WHERE template_id = $1', [templateId]);
            if (Array.isArray(data.execution_times)) {
                for (const et of data.execution_times) {
                    await client.query(`INSERT INTO routine_execution_times (template_id, scheduled_time)
             VALUES ($1, $2)`, [templateId, et.scheduled_time]);
                }
            }
        }
        const syncRes = await syncTodayTasksForPatient(existing[0].patient_id, client);
        await client.query('COMMIT');
        await emitRoutineSyncEvents(existing[0].patient_id, syncRes);
        // Return the updated routine template eager-loaded with execution times and attachments
        const { rows: updated } = await config_1.default.query(`SELECT rt.*,
         COALESCE(
           json_agg(DISTINCT ret.*) FILTER (WHERE ret.id IS NOT NULL), '[]'
         ) AS execution_times,
         COALESCE(
           json_agg(DISTINCT ra.*) FILTER (WHERE ra.id IS NOT NULL), '[]'
         ) AS attachments
       FROM routine_templates rt
       LEFT JOIN routine_execution_times ret ON ret.template_id = rt.id
       LEFT JOIN routine_attachments      ra  ON ra.template_id  = rt.id
       WHERE rt.id = $1
       GROUP BY rt.id`, [templateId]);
        return updated[0];
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
/** Soft-delete (deactivate) a routine template. */
async function deactivateRoutineTemplate(templateId, createdBy) {
    const client = await config_1.default.connect();
    try {
        await client.query('BEGIN');
        const { rows: tmpl } = await client.query(`SELECT patient_id FROM routine_templates WHERE id = $1 AND created_by = $2`, [templateId, createdBy]);
        if (!tmpl[0])
            throw new AppError_1.AppError('NOT_FOUND', 'Template not found or not authorised', 404);
        const patientId = tmpl[0].patient_id;
        await client.query(`UPDATE routine_templates SET is_active = FALSE WHERE id = $1`, [templateId]);
        const syncRes = await syncTodayTasksForPatient(patientId, client);
        await client.query('COMMIT');
        await emitRoutineSyncEvents(patientId, syncRes);
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
// ─── Routine Attachments ──────────────────────────────────────────────────────
/** Add a file attachment record to a routine template. */
async function addAttachment(templateId, createdBy, data) {
    const { rows } = await config_1.default.query('SELECT id FROM routine_templates WHERE id = $1 AND created_by = $2', [templateId, createdBy]);
    if (!rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Template not found or not authorised', 404);
    const { rows: att } = await config_1.default.query(`INSERT INTO routine_attachments (template_id, file_url, file_type, display_name)
     VALUES ($1, $2, $3, $4) RETURNING *`, [templateId, data.file_url, data.file_type, data.display_name ?? null]);
    return att[0];
}
/** Remove an attachment from a routine template. */
async function removeAttachment(templateId, attachmentId, createdBy) {
    const { rows: tmpl } = await config_1.default.query('SELECT id FROM routine_templates WHERE id = $1 AND created_by = $2', [templateId, createdBy]);
    if (!tmpl[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Template not found or not authorised', 404);
    const { rows } = await config_1.default.query(`DELETE FROM routine_attachments WHERE id = $1 AND template_id = $2 RETURNING id`, [attachmentId, templateId]);
    if (!rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Attachment not found', 404);
}
// ─── Tasks ────────────────────────────────────────────────────────────────────
/** Synchronizes today's generated task instances and reminders for a patient based on active care plan templates. */
async function syncTodayTasksForPatient(patientId, client) {
    const today = new Date().toISOString().split('T')[0];
    const todayObj = new Date();
    const dayOfWeek = todayObj.getDay(); // 0 = Sunday, 1 = Monday, etc.
    // 1. Fetch all active templates for this patient
    const { rows: templates } = await client.query(`SELECT rt.*,
       COALESCE(
         json_agg(DISTINCT ret.*) FILTER (WHERE ret.id IS NOT NULL), '[]'
       ) AS execution_times
     FROM routine_templates rt
     LEFT JOIN routine_execution_times ret ON ret.template_id = rt.id
     WHERE rt.patient_id = $1 AND rt.is_active = TRUE
     GROUP BY rt.id`, [patientId]);
    // 2. Fetch all existing today's tasks generated from templates (where template_id IS NOT NULL)
    const { rows: existingTasks } = await client.query(`SELECT *, scheduled_time::text AS scheduled_time_str FROM tasks
     WHERE patient_id = $1 AND scheduled_date = $2 AND template_id IS NOT NULL`, [patientId, today]);
    // Map existing tasks for easy lookup
    const existingMap = new Map();
    for (const t of existingTasks) {
        const timeKey = `${t.template_id}_${t.scheduled_time_str.slice(0, 5)}`;
        existingMap.set(timeKey, t);
    }
    const expectedTimeKeys = new Set();
    const createdTasks = [];
    const updatedTasks = [];
    const deletedTasks = [];
    for (const tmpl of templates) {
        const pattern = tmpl.recurrence_pattern || { type: 'DAILY' };
        const type = pattern.type || 'DAILY';
        let match = false;
        if (type === 'DAILY') {
            match = true;
        }
        else if (type === 'WEEKLY') {
            const days = pattern.days || [];
            if (days.includes(dayOfWeek)) {
                match = true;
            }
        }
        if (match) {
            const times = tmpl.execution_times || [];
            for (const et of times) {
                const timeKey = `${tmpl.id}_${et.scheduled_time.slice(0, 5)}`;
                expectedTimeKeys.add(timeKey);
                const existingTask = existingMap.get(timeKey);
                if (existingTask) {
                    if (existingTask.deleted_at !== null) {
                        if (existingTask.status !== 'DONE') {
                            const { rows: restoredRows } = await client.query(`UPDATE tasks SET deleted_at = NULL, status = 'PENDING', updated_at = NOW(),
                   title = $1, instructions_md = $2, caregiver_note = $3,
                   category = $4, priority = $5, icon_name = $6, emoji = $7, is_critical = $8
                 WHERE id = $9 RETURNING *`, [
                                tmpl.title,
                                tmpl.instructions_md,
                                tmpl.caregiver_notes,
                                tmpl.category || 'custom',
                                tmpl.priority || 'medium',
                                tmpl.icon_name || '📋',
                                tmpl.icon_name || '📋',
                                tmpl.priority === 'critical',
                                existingTask.id
                            ]);
                            const restoredTask = restoredRows[0];
                            if (restoredTask) {
                                updatedTasks.push(restoredTask);
                                const scheduledAt = `${today}T${et.scheduled_time}`;
                                const historyJson = JSON.stringify([{ state: 'SCHEDULED', changed_at: new Date().toISOString() }]);
                                await client.query(`INSERT INTO reminders (patient_id, reference_id, reference_type, title, body, scheduled_at, state, history)
                   VALUES ($1, $2, 'ROUTINE', $3, $4, $5, 'SCHEDULED', $6)
                   ON CONFLICT DO NOTHING`, [patientId, restoredTask.id, tmpl.title, tmpl.instructions_md || null, scheduledAt, historyJson]);
                            }
                        }
                    }
                    else {
                        if (existingTask.status !== 'DONE') {
                            const hasChanged = existingTask.title !== tmpl.title ||
                                (existingTask.instructions_md ?? null) !== (tmpl.instructions_md ?? null) ||
                                (existingTask.caregiver_note ?? null) !== (tmpl.caregiver_notes ?? null) ||
                                (existingTask.category ?? 'custom') !== (tmpl.category ?? 'custom') ||
                                (existingTask.priority ?? 'medium') !== (tmpl.priority ?? 'medium') ||
                                (existingTask.icon_name ?? '📋') !== (tmpl.icon_name ?? '📋') ||
                                (existingTask.emoji ?? '📋') !== (tmpl.icon_name ?? '📋') ||
                                !!existingTask.is_critical !== (tmpl.priority === 'critical');
                            if (hasChanged) {
                                const { rows: updatedRows } = await client.query(`UPDATE tasks
                   SET title = $1, instructions_md = $2, caregiver_note = $3,
                       category = $4, priority = $5, icon_name = $6, emoji = $7, is_critical = $8,
                       updated_at = NOW()
                   WHERE id = $9 RETURNING *`, [
                                    tmpl.title,
                                    tmpl.instructions_md,
                                    tmpl.caregiver_notes,
                                    tmpl.category || 'custom',
                                    tmpl.priority || 'medium',
                                    tmpl.icon_name || '📋',
                                    tmpl.icon_name || '📋',
                                    tmpl.priority === 'critical',
                                    existingTask.id
                                ]);
                                if (updatedRows[0]) {
                                    updatedTasks.push(updatedRows[0]);
                                }
                                await client.query(`UPDATE reminders
                   SET title = $1, body = $2, updated_at = NOW()
                   WHERE reference_id = $3 AND reference_type = 'ROUTINE' AND state = 'SCHEDULED'`, [tmpl.title, tmpl.instructions_md || null, existingTask.id]);
                            }
                        }
                    }
                }
                else {
                    const taskInsert = await client.query(`INSERT INTO tasks
               (patient_id, assigned_by, template_id, title, instructions_md, caregiver_note,
                category, priority, icon_name, emoji,
                scheduled_time, scheduled_date, duration_minutes, is_critical, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 15, $13, 'PENDING')
             RETURNING *`, [
                        patientId,
                        tmpl.created_by,
                        tmpl.id,
                        tmpl.title,
                        tmpl.instructions_md,
                        tmpl.caregiver_notes,
                        tmpl.category || 'custom',
                        tmpl.priority || 'medium',
                        tmpl.icon_name || '📋',
                        tmpl.icon_name || '📋',
                        et.scheduled_time,
                        today,
                        tmpl.priority === 'critical'
                    ]);
                    const generatedTask = taskInsert.rows[0];
                    if (generatedTask) {
                        createdTasks.push(generatedTask);
                        const scheduledAt = `${today}T${et.scheduled_time}`;
                        const historyJson = JSON.stringify([{ state: 'SCHEDULED', changed_at: new Date().toISOString() }]);
                        await client.query(`INSERT INTO reminders (patient_id, reference_id, reference_type, title, body, scheduled_at, state, history)
               VALUES ($1, $2, 'ROUTINE', $3, $4, $5, 'SCHEDULED', $6)
               ON CONFLICT DO NOTHING`, [patientId, generatedTask.id, tmpl.title, tmpl.instructions_md || null, scheduledAt, historyJson]);
                    }
                }
            }
        }
    }
    const deletedReminderIds = [];
    for (const [timeKey, t] of existingMap.entries()) {
        if (!expectedTimeKeys.has(timeKey)) {
            if (t.status !== 'DONE' && t.deleted_at === null) {
                const { rows: deletedRows } = await client.query(`UPDATE tasks SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`, [t.id]);
                if (deletedRows[0]) {
                    deletedTasks.push(deletedRows[0]);
                }
                const { rows: deletedRems } = await client.query(`DELETE FROM reminders WHERE reference_id = $1 AND reference_type = 'ROUTINE' RETURNING id`, [t.id]);
                for (const r of deletedRems) {
                    deletedReminderIds.push(r.id);
                }
            }
        }
    }
    return { createdTasks, updatedTasks, deletedTasks, deletedReminderIds };
}
/** Emit WebSocket events for routine tasks and reminders. */
async function emitRoutineSyncEvents(patientId, syncResult) {
    try {
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        if (io) {
            for (const t of syncResult.deletedTasks) {
                io.to(`patient:${patientId}`).emit('task:delete', { taskId: t.id });
            }
            for (const rId of syncResult.deletedReminderIds) {
                io.to(`patient:${patientId}`).emit('reminder:skipped', { reminderId: rId });
            }
            for (const t of syncResult.updatedTasks) {
                io.to(`patient:${patientId}`).emit('task:update', { task: t });
                io.to(`patient:${patientId}`).emit('task:change', { task: t });
            }
            for (const t of syncResult.createdTasks) {
                io.to(`patient:${patientId}`).emit('task:update', { task: t });
                io.to(`patient:${patientId}`).emit('task:change', { task: t });
            }
        }
    }
    catch (err) {
        console.error('[routines.service] Failed to emit WebSocket sync events:', err);
    }
}
async function getTodayTasks(patientId) {
    const client = await config_1.default.connect();
    let syncResult = null;
    try {
        await client.query('BEGIN');
        syncResult = await syncTodayTasksForPatient(patientId, client);
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        console.error('[TodayTasksGenerator] Failed to sync daily task instances:', err);
    }
    finally {
        client.release();
    }
    if (syncResult) {
        await emitRoutineSyncEvents(patientId, syncResult);
    }
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await config_1.default.query(`SELECT t.*, u.name AS assigned_by_name, u.photo_url AS assigned_by_photo
     FROM tasks t
     LEFT JOIN users u ON u.id = t.assigned_by
     WHERE t.patient_id = $1 AND t.scheduled_date = $2 AND t.deleted_at IS NULL
     ORDER BY t.scheduled_time ASC`, [patientId, today]);
    return rows;
}
/** Fetch paginated task history for a patient between two dates. */
async function getTaskHistory(patientId, from, to, limit = 50, cursor) {
    let query = `
    SELECT * FROM tasks
    WHERE patient_id = $1 AND scheduled_date BETWEEN $2 AND $3 AND deleted_at IS NULL
  `;
    const params = [patientId, from, to];
    if (cursor) {
        query += ` AND created_at < $${params.length + 1}`;
        params.push(cursor);
    }
    query += ` ORDER BY scheduled_date DESC, scheduled_time LIMIT $${params.length + 1}`;
    params.push(limit + 1);
    const { rows } = await config_1.default.query(query, params);
    const has_more = rows.length > limit;
    const tasks = has_more ? rows.slice(0, limit) : rows;
    return { tasks, has_more, next_cursor: has_more ? tasks[tasks.length - 1].created_at : null };
}
/** Create a standalone task instance (no template). */
async function createTask(caregiverId, patientId, data) {
    const { rows } = await config_1.default.query(`INSERT INTO tasks
       (patient_id, assigned_by, title, instructions_md, caregiver_note,
        category, priority, icon_name, emoji,
        scheduled_time, scheduled_date, duration_minutes, is_critical,
        recurrence_type, recurrence_days, recurrence_end_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`, [
        patientId, caregiverId,
        data.title,
        data.instructions_md ?? data.patient_hint ?? null,
        data.caregiver_note ?? null,
        data.category ?? 'custom',
        data.priority ?? 'medium',
        data.icon_name ?? null,
        data.emoji ?? null,
        data.scheduled_time,
        data.scheduled_date,
        data.duration_minutes ?? 15,
        data.is_critical ?? false,
        data.recurrence_type ?? 'NONE',
        data.recurrence_days ?? null,
        data.recurrence_end_date ?? null,
    ]);
    const task = rows[0];
    if (task) {
        try {
            const scheduledAt = `${data.scheduled_date}T${data.scheduled_time}`;
            const historyJson = JSON.stringify([{ state: 'SCHEDULED', changed_at: new Date().toISOString() }]);
            await config_1.default.query(`INSERT INTO reminders (patient_id, reference_id, reference_type, title, body, scheduled_at, state, history)
         VALUES ($1, $2, 'ROUTINE', $3, $4, $5, 'SCHEDULED', $6)
         ON CONFLICT DO NOTHING`, [patientId, task.id, data.title, data.instructions_md || data.patient_hint || null, scheduledAt, historyJson]);
        }
        catch (err) {
            console.error('[routines.service] Failed to create reminder for createTask:', err);
        }
        try {
            const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
            io.to(`patient:${task.patient_id}`).emit('task:update', { task });
            io.to(`patient:${task.patient_id}`).emit('task:change', { task });
        }
        catch (err) {
            console.error('[routines.service] Failed to emit task:update for createTask:', err);
        }
    }
    return task;
}
/** Update editable fields of a task instance. */
async function updateTask(taskId, caregiverId, data) {
    const { rows: existing } = await config_1.default.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (!existing[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Task not found', 404);
    if (existing[0].assigned_by !== caregiverId)
        throw new AppError_1.AppError('ROLE_NOT_PERMITTED', 'Not authorised', 403);
    const allowed = [
        'title', 'instructions_md', 'caregiver_note', 'icon_name',
        'scheduled_time', 'scheduled_date', 'duration_minutes', 'is_critical', 'voice_note_url',
        'category', 'priority',
    ];
    const fields = [];
    const values = [];
    let i = 1;
    for (const key of allowed) {
        if (data[key] !== undefined) {
            fields.push(`${key} = $${i++}`);
            values.push(data[key]);
        }
    }
    if (fields.length === 0)
        throw new AppError_1.AppError('VALIDATION_ERROR', 'No fields to update', 422);
    fields.push(`updated_by = $${i++}`);
    values.push(caregiverId);
    values.push(taskId);
    const { rows } = await config_1.default.query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, values);
    const task = rows[0];
    if (task) {
        try {
            const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
            io.to(`patient:${task.patient_id}`).emit('task:update', { task });
            io.to(`patient:${task.patient_id}`).emit('task:change', { task });
        }
        catch (err) {
            console.error('[routines.service] Failed to emit task:update for updateTask:', err);
        }
    }
    return task;
}
/** Delete a task instance. */
async function deleteTask(taskId, caregiverId) {
    const taskRes = await config_1.default.query('SELECT patient_id FROM tasks WHERE id = $1', [taskId]);
    const patientId = taskRes.rows[0]?.patient_id;
    const { rows } = await config_1.default.query(`DELETE FROM tasks WHERE id = $1 AND assigned_by = $2 RETURNING id`, [taskId, caregiverId]);
    if (!rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Task not found or not authorised', 404);
    if (patientId) {
        try {
            const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
            io.to(`patient:${patientId}`).emit('task:delete', { taskId });
        }
        catch (err) {
            console.error('[routines.service] Failed to emit task:delete:', err);
        }
    }
}
async function syncReminderStatus(taskId, status, actorId) {
    try {
        const upper = status.toUpperCase();
        if (upper === 'DONE') {
            const now = new Date();
            const existing = await config_1.default.query('SELECT * FROM reminders WHERE reference_id = $1 AND reference_type = \'ROUTINE\'', [taskId]);
            if (existing.rows[0]) {
                const reminder = existing.rows[0];
                const history = Array.isArray(reminder.history) ? reminder.history : [];
                history.push({ state: 'COMPLETED', changed_at: now.toISOString(), actor_id: actorId });
                await config_1.default.query(`UPDATE reminders SET state = 'COMPLETED', history = $2, updated_at = NOW() WHERE id = $1`, [reminder.id, JSON.stringify(history)]);
                const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
                if (io) {
                    io.to(`patient:${reminder.patient_id}`).emit('reminder:completed', { reminderId: reminder.id });
                }
            }
        }
        else if (upper === 'SKIPPED') {
            const now = new Date();
            const existing = await config_1.default.query('SELECT * FROM reminders WHERE reference_id = $1 AND reference_type = \'ROUTINE\'', [taskId]);
            if (existing.rows[0]) {
                const reminder = existing.rows[0];
                const history = Array.isArray(reminder.history) ? reminder.history : [];
                history.push({ state: 'SKIPPED', changed_at: now.toISOString(), actor_id: actorId });
                await config_1.default.query(`UPDATE reminders SET state = 'SKIPPED', history = $2, updated_at = NOW() WHERE id = $1`, [reminder.id, JSON.stringify(history)]);
                const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
                if (io) {
                    io.to(`patient:${reminder.patient_id}`).emit('reminder:skipped', { reminderId: reminder.id });
                }
            }
        }
    }
    catch (err) {
        console.error('[routines.service] Failed to sync reminder status:', err);
    }
}
/**
 * Idempotent task status update.
 * If client_action_id is provided, uses ON CONFLICT logic to safely deduplicate
 * retries from the offline queue.
 */
async function updateTaskStatus(taskId, actorId, status, clientActionId) {
    const upperStatus = status.toUpperCase();
    if (clientActionId) {
        const { rows } = await config_1.default.query(`UPDATE tasks
       SET status = $1::task_status,
           completed_at = CASE WHEN $1 = 'DONE' THEN NOW() ELSE completed_at END,
           completed_by = CASE WHEN $1 = 'DONE' THEN $2::UUID ELSE completed_by END,
           updated_by = $2,
           client_action_id = $3
       WHERE id = $4
         AND (client_action_id IS NULL OR client_action_id != $3)
       RETURNING *`, [upperStatus, actorId, clientActionId, taskId]);
        let task = rows[0];
        if (!task) {
            const fullTask = await config_1.default.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
            task = fullTask.rows[0];
        }
        if (task) {
            await syncReminderStatus(taskId, upperStatus, actorId);
            try {
                const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
                io.to(`patient:${task.patient_id}`).emit('task:update', { task });
                io.to(`patient:${task.patient_id}`).emit('task:change', { task });
            }
            catch (err) {
                console.error('[routines.service] Failed to emit task:update on status update:', err);
            }
        }
        return task ?? { id: taskId, status: upperStatus, deduplicated: true };
    }
    const { rows } = await config_1.default.query(`UPDATE tasks
     SET status = $1::task_status,
         completed_at = CASE WHEN $1 = 'DONE' THEN NOW() ELSE completed_at END,
         completed_by = CASE WHEN $1 = 'DONE' THEN $2::UUID ELSE completed_by END,
         updated_by = $2
     WHERE id = $3
     RETURNING *`, [upperStatus, actorId, taskId]);
    if (!rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Task not found', 404);
    const task = rows[0];
    await syncReminderStatus(taskId, upperStatus, actorId);
    try {
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        io.to(`patient:${task.patient_id}`).emit('task:update', { task });
        io.to(`patient:${task.patient_id}`).emit('task:change', { task });
    }
    catch (err) {
        console.error('[routines.service] Failed to emit task:update on status update:', err);
    }
    return task;
}
// ─── Adherence Analytics ──────────────────────────────────────────────────────
/** Fetch precomputed snapshot, or compute live if not cached. */
async function getAdherenceSnapshot(patientId, date) {
    const { rows: cached } = await config_1.default.query(`SELECT * FROM daily_adherence_snapshots WHERE patient_id = $1 AND target_date = $2`, [patientId, date]);
    if (cached[0])
        return cached[0];
    const { rows: live } = await config_1.default.query(`SELECT
       COUNT(*)                                          AS total_scheduled,
       COUNT(*) FILTER (WHERE status = 'DONE')          AS total_completed,
       COUNT(*) FILTER (WHERE status = 'MISSED')        AS total_missed,
       ROUND(
         COUNT(*) FILTER (WHERE status = 'DONE')::NUMERIC
         / NULLIF(COUNT(*), 0) * 100, 2
       )                                                AS score_percentage
     FROM tasks
     WHERE patient_id = $1 AND scheduled_date = $2`, [patientId, date]);
    return {
        patient_id: patientId,
        target_date: date,
        total_scheduled: Number(live[0].total_scheduled),
        total_completed: Number(live[0].total_completed),
        total_missed: Number(live[0].total_missed),
        score_percentage: Number(live[0].score_percentage ?? 0),
        computed_at: new Date().toISOString(),
        is_live: true,
    };
}
// ─── Legacy helpers (kept for backward compat during migration) ───────────────
async function getTemplates(caregiverId) {
    const { rows } = await config_1.default.query(`SELECT * FROM routine_templates_v1
     WHERE created_by = $1 OR is_library_item = TRUE
     ORDER BY is_library_item DESC, created_at DESC`, [caregiverId]);
    return rows;
}
async function markTaskComplete(taskId, patientId) {
    return updateTaskStatus(taskId, patientId, 'DONE');
}
async function markTaskUnsure(taskId, patientId) {
    return updateTaskStatus(taskId, patientId, 'UNSURE');
}
//# sourceMappingURL=routines.service.js.map