/**
 * SureStep — modules/routines/authoritative-routines.service.ts
 *
 * Authoritative Routine Definitions, Occurrences, and Sign-Off Service.
 * Baselines:
 *   - docs/architecture/TARGET_ARCHITECTURE.md (Sections 3.4, 4.3, 5.2)
 *   - docs/workflows/04-PATIENT-CARE.md (Sections 3, 12, 14, 26)
 *
 * Invariants:
 *   - Caregivers strictly forbidden from routine definition CRUD (403 CAREGIVER_ROUTINE_CRUD_FORBIDDEN).
 *   - Circle ownership alone does not grant routine definition CRUD.
 *   - Assigned Caregivers with active assignment are authorized for routine occurrence sign-off.
 *   - Occurrences follow: Scheduled -> Ongoing -> Completed / Overdue.
 *   - No Skip, Missed, or Snoozed states.
 *   - Replacement Rule: when the next occurrence arrives, an unfinished ONGOING
 *     occurrence transitions to OVERDUE. Completed occurrences never change.
 *   - Historical Immutability: definition edits never rewrite Completed/Overdue
 *     occurrences. Future SCHEDULED occurrences are cancelled and regenerated.
 */
import { User } from '../../shared/types';
export interface RoutineSchedulePatternInput {
    frequency?: string;
    time?: string;
    times?: string[];
    daysOfWeek?: Array<number | string>;
}
export interface CreateRoutineDefinitionInput {
    title: string;
    category: 'MEDICATION' | 'MEAL' | 'EXERCISE' | 'HYGIENE' | 'APPOINTMENT';
    description?: string | null;
    schedulePattern?: RoutineSchedulePatternInput;
}
export interface UpdateRoutineDefinitionInput {
    title?: string;
    category?: 'MEDICATION' | 'MEAL' | 'EXERCISE' | 'HYGIENE' | 'APPOINTMENT';
    description?: string | null;
    schedulePattern?: RoutineSchedulePatternInput;
    isActive?: boolean;
}
export interface NormalizedSchedulePattern {
    frequency: 'DAILY' | 'WEEKLY';
    time: string;
    times: string[];
    daysOfWeek: number[];
}
export declare const ROUTINE_CATEGORIES: readonly ["MEDICATION", "MEAL", "EXERCISE", "HYGIENE", "APPOINTMENT"];
/** Number of days, including today, for which occurrences are generated. */
export declare const OCCURRENCE_HORIZON_DAYS = 14;
/**
 * Normalize the persisted schedule shape. Legacy shapes used `type`/`days`
 * or a single `time`; the canonical shape is frequency + times[] + daysOfWeek[].
 */
export declare function normalizeSchedulePattern(raw: unknown): NormalizedSchedulePattern;
export declare class AuthoritativeRoutinesService {
    /**
     * 1. Create a Routine Definition and materialize its occurrence horizon.
     */
    createDefinition(patientId: string, actorId: string, input: CreateRoutineDefinitionInput): Promise<any>;
    /**
     * 2. Update a Routine Definition.
     *
     * Future SCHEDULED occurrences are cancelled before regenerating the new
     * schedule. Completed, Ongoing, and Overdue history is never rewritten.
     */
    updateDefinition(patientId: string, routineId: string, input: UpdateRoutineDefinitionInput): Promise<any>;
    /**
     * 3. Get Routine Definitions for a Patient (materializes the horizon first).
     */
    getDefinitions(patientId: string, onlyActive?: boolean): Promise<any[]>;
    /**
     * 4. Get a single Routine Definition.
     */
    getDefinitionById(patientId: string, routineId: string): Promise<any>;
    /**
     * 5. Delete (deactivate) a Routine Definition.
     */
    deleteDefinition(patientId: string, routineId: string): Promise<any>;
    /**
     * 6. List Routine Occurrences for a Patient with Replacement Overdue Evaluation.
     */
    listOccurrences(patientId: string, date?: string): Promise<any[]>;
    /**
     * 7. Sign off a Routine Occurrence.
     * Invariant (04-PATIENT-CARE.md §3, §12, §14):
     *   - Care participation action confirming task completion.
     *   - Records completion in routine_completions.
     *   - Transitions occurrence status from SCHEDULED or ONGOING to COMPLETED.
     *   - No skip or missed state.
     */
    signOffOccurrence(patientId: string, routineId: string, occurrenceId: string, actorUser: User, notes?: string): Promise<{
        occurrence: any;
        completion: any;
    }>;
    private getOccurrenceWindow;
    /**
     * Idempotently generate all occurrence slots for one definition over the
     * current horizon. No-op for inactive definitions.
     */
    private materializeDefinition;
    /** Materialize the occurrence horizon for every active definition of a patient. */
    materializePatient(patientId: string, client?: any): Promise<number>;
    /** Materialize the occurrence horizon for every active definition. */
    materializeAllActive(client?: any): Promise<number>;
    /**
     * Advance the canonical occurrence lifecycle:
     *   SCHEDULED -> ONGOING once the scheduled slot arrives.
     *   ONGOING -> OVERDUE when a later occurrence slot has arrived.
     * Completed occurrences are never touched.
     */
    sweepOccurrenceStates(patientId?: string, client?: any): Promise<{
        started: any;
        overdue: any;
    }>;
    /** Cancel future SCHEDULED occurrences belonging to inactive definitions. */
    cancelInactiveScheduled(client?: any): Promise<any>;
    /**
     * Periodic sweep: extend the horizon, cancel orphaned future slots, and
     * advance Scheduled -> Ongoing -> Overdue states.
     */
    sweepRoutineOccurrences(): Promise<{
        started: any;
        overdue: any;
        materialized: number;
        cancelled: any;
    }>;
}
export declare const authoritativeRoutinesService: AuthoritativeRoutinesService;
//# sourceMappingURL=authoritative-routines.service.d.ts.map