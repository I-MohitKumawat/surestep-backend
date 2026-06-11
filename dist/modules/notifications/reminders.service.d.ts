export interface CreateReminderInput {
    patientId: string;
    referenceId?: string;
    referenceType: 'ROUTINE' | 'MEDICATION' | 'APPOINTMENT' | 'CUSTOM';
    title: string;
    body?: string;
    scheduledAt: string;
}
export declare function createReminder(input: CreateReminderInput): Promise<any>;
export declare function snoozeReminder(reminderId: string, snoozeMinutes?: number): Promise<any>;
export declare function completeReminder(reminderId: string, actorId: string): Promise<any>;
export declare function skipReminder(reminderId: string, actorId: string): Promise<any>;
export declare function getActivePatientReminders(patientId: string): Promise<any[]>;
/**
 * Sweeps active/snoozed/scheduled reminders and triggers state transitions
 * and notifications/escalations. Designed to run every 1 minute.
 */
export declare function runReminderSweep(): Promise<void>;
//# sourceMappingURL=reminders.service.d.ts.map