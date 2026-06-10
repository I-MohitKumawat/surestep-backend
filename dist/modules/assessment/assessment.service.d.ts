export interface AssessmentPayload {
    status: 'DRAFT' | 'COMPLETED';
    patient_basics: any;
    emergency_contacts: any[];
    cognitive: any;
    risk: any;
    mobility: string;
    support_needs: any;
    tech_comfort: string;
    notes: any;
}
export declare function getLatestAssessment(patientId: string): Promise<any>;
export declare function getAssessmentHistory(patientId: string): Promise<any[]>;
export declare function getAssessmentById(id: string): Promise<any>;
export declare function saveAssessment(caregiverId: string, patientId: string, payload: AssessmentPayload): Promise<{
    assessmentId: string;
    status: "COMPLETED" | "DRAFT";
    relationshipStatus: any;
}>;
//# sourceMappingURL=assessment.service.d.ts.map