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
 *   - Replacement Rule: when next occurrence arrives, ongoing occurrence transitions to Overdue.
 *   - Historical Immutability: definition edits never rewrite Completed/Overdue occurrences.
 */
import { User } from '../../shared/types';
export interface CreateRoutineDefinitionInput {
    title: string;
    category: 'MEDICATION' | 'MEAL' | 'EXERCISE' | 'HYGIENE' | 'APPOINTMENT';
    description?: string | null;
    schedulePattern?: {
        frequency?: string;
        time?: string;
        daysOfWeek?: number[];
    };
}
export interface UpdateRoutineDefinitionInput {
    title?: string;
    category?: 'MEDICATION' | 'MEAL' | 'EXERCISE' | 'HYGIENE' | 'APPOINTMENT';
    description?: string | null;
    schedulePattern?: any;
    isActive?: boolean;
}
export declare class AuthoritativeRoutinesService {
    /**
     * 1. Create a Routine Definition
     */
    createDefinition(patientId: string, actorId: string, input: CreateRoutineDefinitionInput): Promise<any>;
    /**
     * 2. Update a Routine Definition
     */
    updateDefinition(patientId: string, routineId: string, input: UpdateRoutineDefinitionInput): Promise<any>;
    /**
     * 3. Get Routine Definitions for a Patient
     */
    getDefinitions(patientId: string, onlyActive?: boolean): Promise<any[]>;
    /**
     * 4. Get a single Routine Definition
     */
    getDefinitionById(patientId: string, routineId: string): Promise<any>;
    /**
     * 5. Delete (deactivate) a Routine Definition
     */
    deleteDefinition(patientId: string, routineId: string): Promise<any>;
    /**
     * 6. List Routine Occurrences for a Patient with Replacement Overdue Evaluation
     */
    listOccurrences(patientId: string, date?: string): Promise<any[]>;
    /**
     * 7. Sign off a Routine Occurrence
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
    /**
     * Helper: Replacement Overdue Rule (TARGET_ARCHITECTURE.md §5.2):
     * If occurrence N is Ongoing when occurrence N+1 arrives, occurrence N transitions to Overdue.
     * Also transitions past-due scheduled occurrences on earlier dates to OVERDUE.
     */
    private evaluateReplacementOverdue;
}
export declare const authoritativeRoutinesService: AuthoritativeRoutinesService;
//# sourceMappingURL=authoritative-routines.service.d.ts.map