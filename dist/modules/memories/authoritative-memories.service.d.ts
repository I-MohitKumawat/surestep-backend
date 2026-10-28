/**
 * SureStep — modules/memories/authoritative-memories.service.ts
 *
 * Authoritative Memories & Activity Subsystem Service.
 * Implements:
 *   - Familiar Memories management (photos, short videos, text memories)
 *   - Observational activity attempts logging (zero dementia clinical progression scoring)
 *   - Gated by canonical delegatable permission 'Manage Patient Memories'
 *   - Connected care audience visibility enforcement
 *
 * Baselines:
 *   - docs/requirements/V1_REQUIREMENT.md
 *   - docs/workflows/09-MEMORIES-AND-ACTIVITIES.md
 *   - docs/architecture/TARGET_ARCHITECTURE.md (§3.7, §4.2, §4.3)
 */
export interface CreateMemoryDTO {
    title: string;
    mediaType: 'PHOTO' | 'VIDEO' | 'TEXT';
    mediaKey?: string | null;
    caption?: string | null;
    associatedPersonId?: string | null;
}
export interface UpdateMemoryDTO {
    title?: string;
    mediaType?: 'PHOTO' | 'VIDEO' | 'TEXT';
    mediaKey?: string | null;
    caption?: string | null;
    associatedPersonId?: string | null;
}
export interface RecordActivityAttemptDTO {
    activityType: 'PHOTO_MATCH' | 'PUZZLE' | 'BREATHING_GUIDE';
    durationSeconds?: number;
    completed?: boolean;
    metrics?: Record<string, any>;
}
export declare class AuthoritativeMemoriesService {
    /**
     * 1. createMemory
     * Creates a familiar memory for a patient.
     * Gated by Circle Owner or canonical permission 'Manage Patient Memories'.
     */
    createMemory(patientId: string, creatorId: string, dto: CreateMemoryDTO): Promise<any>;
    /**
     * 2. getMemories
     * Returns memories for a patient, joined with creator and associated person details.
     * Paginated with limit and cursor (created_at).
     */
    getMemories(patientId: string, limit?: number, cursor?: string): Promise<{
        memories: any[];
        has_more: boolean;
        next_cursor: any;
    }>;
    /**
     * 3. getMemoryById
     */
    getMemoryById(patientId: string, memoryId: string): Promise<any>;
    /**
     * 4. updateMemory
     * Updates an existing memory.
     */
    updateMemory(patientId: string, memoryId: string, dto: UpdateMemoryDTO): Promise<any>;
    /**
     * 5. deleteMemory
     * Deletes a memory record.
     * Authorization check: caller must be Circle Owner, hold 'Manage Patient Memories', or be creator.
     */
    deleteMemory(patientId: string, memoryId: string, actorUserId: string): Promise<{
        id: string;
        deleted: boolean;
    }>;
    /**
     * 6. recordActivityAttempt
     * Records an observational activity attempt for engagement/familiarity/relaxation.
     * Strictly NO clinical dementia scoring or diagnostic assessment (TARGET_ARCHITECTURE §3.7).
     */
    recordActivityAttempt(patientId: string, dto: RecordActivityAttemptDTO): Promise<any>;
    /**
     * 7. getActivityAttempts
     * Returns observational logs of voluntary activities.
     * Strictly raw attempts and duration only, zero cognitive assessment scoring.
     */
    getActivityAttempts(patientId: string, limit?: number, cursor?: string): Promise<{
        activities: any[];
        has_more: boolean;
        next_cursor: any;
        clinical_disclaimer: string;
    }>;
}
export declare const authoritativeMemoriesService: AuthoritativeMemoriesService;
//# sourceMappingURL=authoritative-memories.service.d.ts.map