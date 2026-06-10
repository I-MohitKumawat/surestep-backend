export declare function uploadSample(recordedBy: string, patientId: string, data: {
    label: string;
    storage_path: string;
    duration_seconds: number;
    quality_score?: number;
    consent_given_at: string;
}): Promise<any>;
export declare function getSamples(patientId: string): Promise<any[]>;
export declare function deleteSample(sampleId: string, userId: string): Promise<void>;
export declare function sendManualMessage(senderId: string, patientId: string, data: {
    script: string;
    voice_sample_id?: string;
}): Promise<any>;
export declare function getMessages(patientId: string, limit?: number, cursor?: string): Promise<{
    messages: any[];
    has_more: boolean;
    next_cursor: any;
}>;
export declare function addFace(uploadedBy: string, patientId: string, data: {
    person_name: string;
    relationship_label: string;
    photo_url: string;
    display_order?: number;
}): Promise<any>;
export declare function getFaces(patientId: string): Promise<any[]>;
export declare function postStory(postedBy: string, patientId: string, data: {
    caption?: string;
    photo_url?: string;
    voice_note_url?: string;
}): Promise<any>;
export declare function getStories(patientId: string, limit?: number, cursor?: string): Promise<{
    stories: any[];
    has_more: boolean;
    next_cursor: any;
}>;
export declare function reactToStory(storyId: string, patientId: string): Promise<any>;
export declare function addMemory(uploadedBy: string, patientId: string, data: any): Promise<any>;
export declare function getDailyMemory(patientId: string): Promise<any>;
//# sourceMappingURL=voice.service.d.ts.map