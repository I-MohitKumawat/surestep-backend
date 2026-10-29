/** Fetch all active routine templates for a patient, eager-loading execution times and attachments. */
export declare function getRoutineTemplates(patientId: string): Promise<any[]>;
/** Create a new routine template with nested execution times. */
export declare function createRoutineTemplate(createdBy: string, patientId: string, data: any): Promise<any>;
/**
 * Update a routine template's fields and execution times.
 * Authorization is enforced by the route guard against the patient's care plan;
 * the creator of the row is not an authorization boundary.
 */
export declare function updateRoutineTemplate(templateId: string, data: any): Promise<any>;
/** Soft-delete (deactivate) a routine template. Authorization is enforced by the route guard. */
export declare function deactivateRoutineTemplate(templateId: string): Promise<void>;
/** Add a file attachment record to a routine template. Authorization is enforced by the route guard. */
export declare function addAttachment(templateId: string, data: {
    file_url: string;
    file_type: string;
    display_name?: string;
}): Promise<any>;
/** Remove an attachment from a routine template. Authorization is enforced by the route guard. */
export declare function removeAttachment(templateId: string, attachmentId: string): Promise<void>;
/** Synchronizes today's generated task instances and reminders for a patient based on active care plan templates. */
export declare function syncTodayTasksForPatient(patientId: string, client: any): Promise<{
    createdTasks: any[];
    updatedTasks: any[];
    deletedTasks: any[];
    deletedReminderIds: string[];
}>;
/** Emit WebSocket events for routine tasks and reminders. */
export declare function emitRoutineSyncEvents(patientId: string, syncResult: {
    createdTasks: any[];
    updatedTasks: any[];
    deletedTasks: any[];
    deletedReminderIds: string[];
}): Promise<void>;
export declare function getTodayTasks(patientId: string): Promise<any[]>;
/** Fetch paginated task history for a patient between two dates. */
export declare function getTaskHistory(patientId: string, from: string, to: string, limit?: number, cursor?: string): Promise<{
    tasks: any[];
    has_more: boolean;
    next_cursor: any;
}>;
/** Create a standalone task instance (no template). */
export declare function createTask(caregiverId: string, patientId: string, data: any): Promise<any>;
/** Update editable fields of a task instance. */
export declare function updateTask(taskId: string, caregiverId: string, data: any): Promise<any>;
/** Delete a task instance. */
export declare function deleteTask(taskId: string, caregiverId: string): Promise<void>;
/**
 * Idempotent task status update.
 * If client_action_id is provided, uses ON CONFLICT logic to safely deduplicate
 * retries from the offline queue.
 */
export declare function updateTaskStatus(taskId: string, actorId: string, status: string, clientActionId?: string): Promise<any>;
/** Fetch precomputed snapshot, or compute live if not cached. */
export declare function getAdherenceSnapshot(patientId: string, date: string): Promise<any>;
export declare function getTemplates(caregiverId: string): Promise<any[]>;
export declare function markTaskComplete(taskId: string, patientId: string): Promise<any>;
export declare function markTaskUnsure(taskId: string, patientId: string): Promise<any>;
//# sourceMappingURL=routines.service.d.ts.map