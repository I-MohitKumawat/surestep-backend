/**
 * Bull Job Queue — Background Workers
 *
 * Jobs:
 *  1. dailyOrientationCheck  — fires at 7:00am IST for each patient
 *  2. routineStateSweep      — every 15 min: marks BEHIND / MISSED_CRITICAL tasks
 *  3. weeklyReportGeneration — every Sunday night: builds cognitive_assessments rows
 *  4. noSignalEscalation     — every 5 min: escalates patients with NO_SIGNAL > 15 min
 */
import Bull from 'bull';
export declare const orientationQueue: Bull.Queue<any>;
export declare const routineSweepQueue: Bull.Queue<any>;
export declare const weeklyReportQueue: Bull.Queue<any>;
export declare const noSignalQueue: Bull.Queue<any>;
export declare function scheduleJobs(): Promise<void>;
/**
 * Queue morning orientation for a specific patient.
 * Called by the awareness engine on first app open of the day.
 */
export declare function queueOrientationForPatient(patientId: string): Promise<void>;
//# sourceMappingURL=queues.d.ts.map