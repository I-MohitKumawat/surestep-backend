/**
 * Bull Job Queue — Background Workers
 *
 * Active Queues:
 *  1. dailyOrientationCheck  — fires at 7:00am IST for each patient
 *  2. routineStateSweep      — every 15 min: materializes routine occurrence
 *                              horizons, advances Scheduled/Ongoing/Overdue,
 *                              and expires caregiver notice periods
 *  3. careRequestExpirySweep — every 15 min: expires stale PENDING care requests
 */
import Bull from 'bull';
export declare const orientationQueue: Bull.Queue<any>;
export declare const routineSweepQueue: Bull.Queue<any>;
export declare const careRequestExpiryQueue: Bull.Queue<any>;
export declare function scheduleJobs(): Promise<void>;
/**
 * Queue morning orientation for a specific patient.
 * Called by the awareness engine on first app open of the day.
 */
export declare function queueOrientationForPatient(patientId: string): Promise<void>;
//# sourceMappingURL=queues.d.ts.map