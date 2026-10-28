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
export declare function getActivePatientReminders(patientId: string): Promise<any[]>;
/**
 * Sweeps active/snoozed/scheduled reminders for ordinary state transitions:
 * - Activates scheduled reminders that are now due.
 * - Reactivates snoozed reminders whose snooze window has expired.
 * NOTE: Automated escalation chains and task status mutation are strictly removed per V1 architecture.
 */
export declare function runReminderSweep(): Promise<void>;
//# sourceMappingURL=reminders.service.d.ts.map