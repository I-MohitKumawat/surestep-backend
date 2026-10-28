export declare function recordSession(patientId: string, data: {
    game_type: string;
    difficulty_level: number;
    duration_seconds: number;
    completed: boolean;
    score?: number;
    error_count?: number;
    hint_count?: number;
    metrics?: Array<{
        metric_type: string;
        value: number;
        context?: any;
    }>;
}): Promise<any>;
export declare function getSessions(patientId: string, limit?: number, cursor?: string): Promise<{
    sessions: any[];
    has_more: boolean;
    next_cursor: any;
}>;
export declare function getAssessments(patientId: string): Promise<{
    assessments: any[];
    clinical_disclaimer: string;
}>;
//# sourceMappingURL=cognition.service.d.ts.map