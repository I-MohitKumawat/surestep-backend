/**
 * SureStep — modules/care-circles/patient-assignments.service.ts
 *
 * Patient Assignment Service.
 * Scopes an active caregiver's routine, agenda, and telemetry access to specific Patient(s).
 * Baselines:
 *   - docs/architecture/TARGET_ARCHITECTURE.md (Sections 3.3, 4.3)
 *   - docs/workflows/03-CARE-CIRCLE.md (Section 8)
 *   - docs/workflows/06-CAREGIVER-RELATIONSHIP.md (Sections 6, 7)
 */
export declare class PatientAssignmentsService {
    /**
     * Assign an active Caregiver to a Patient.
     * Invariants:
     *   - Actor must be Circle Owner or hold 'Manage Caregiver Relationships'.
     *   - Caregiver relationship must be in ACTIVE or NOTICE_PERIOD status.
     *   - Patient must be associated with the same Care Circle.
     *   - Circle membership and caregiver relationship alone do NOT grant patient assignment.
     */
    assignCaregiverToPatient(relationshipId: string, patientId: string, actorId: string): Promise<any>;
    /**
     * Revoke a Caregiver-Patient assignment.
     * Actor must be Circle Owner or hold 'Manage Caregiver Relationships'.
     */
    revokePatientAssignment(relationshipId: string, patientId: string, actorId: string): Promise<any>;
    /**
     * Check if a Caregiver is actively assigned to a Patient.
     * Checks both relationship status (ACTIVE or NOTICE_PERIOD) and assignment (is_active = TRUE).
     */
    isCaregiverAssignedToPatient(caregiverUserId: string, patientId: string): Promise<boolean>;
    /**
     * List Patients assigned to a Caregiver.
     */
    getCaregiverAssignedPatients(caregiverUserId: string): Promise<any[]>;
    private assertCanManageCaregivers;
}
export declare const patientAssignmentsService: PatientAssignmentsService;
//# sourceMappingURL=patient-assignments.service.d.ts.map