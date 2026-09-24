export declare function sendCaregiverRequest(patientId: string, caregiverPhone: string): Promise<any>;
export declare function createFamilyInvite(guardianId: string, patientId: string, data: {
    relationship_type: string;
    notes?: string;
}): Promise<{
    invite_token: string;
    expires_at: Date;
    relationship: any;
}>;
export declare function acceptInvite(token: string, userId: string): Promise<any>;
export declare function getMyPatients(caregiverId: string): Promise<any[]>;
export declare function getMyCaregivers(patientId: string): Promise<any[]>;
export declare function getMyFamily(userId: string, role: string): Promise<any[]>;
export declare function updateRelationshipStatus(relId: string, userId: string, status: string): Promise<any>;
export declare function deleteRelationship(relId: string, userId: string): Promise<void>;
export declare function getConfirmedCaregiverForPatient(patientId: string): Promise<any>;
export declare function confirmCaregiverRelationship(patientId: string, caregiverId: string): Promise<any>;
/**
 * @deprecated Legacy caregiver removal.
 * Supports targeting specific caregiverId when patient has multiple caregivers.
 */
export declare function removeCaregiverRelationship(patientId: string, caregiverId?: string): Promise<any>;
export declare function getPendingRequestsForCaregiver(caregiverId: string): Promise<any[]>;
export declare function respondToCaregiverRequest(caregiverId: string, patientPhone: string, action: 'confirmed' | 'rejected'): Promise<{
    patientId: any;
}>;
export declare function completeMeeting(caregiverId: string, patientId: string): Promise<any>;
export declare function searchCaregivers(patientId: string, query: string): Promise<{
    id: string;
    name: string;
    photo_url: string | null;
    city: string | null;
    bio: string | null;
    years_of_experience: number;
    specializations: string[];
    languages_spoken: string[];
    availability_types: string[];
    service_radius_km: number;
    hourly_rate_inr: number | null;
    daily_rate_inr: number | null;
    rating: number | null;
    rating_count: number;
    professional_role: string | null;
}[]>;
export declare function generateInviteCode(caregiverId: string, patientId: string, relationshipType?: 'FAMILY_CLOSE' | 'FAMILY_EXTENDED' | 'GUARDIAN'): Promise<any>;
export declare function redeemInviteCode(code: string, familyUserId: string): Promise<any>;
export declare function getInviteCodesForPatient(caregiverId: string, patientId: string): Promise<any[]>;
export declare function revokeInviteCode(caregiverId: string, code: string): Promise<void>;
export declare function requestAccessByPhone(familyUserId: string, patientPhone: string): Promise<any>;
export declare function getFamilyPatient(familyUserId: string): Promise<any>;
export declare function getCareCircle(patientId: string): Promise<any[]>;
export declare function getPendingFamilyRequests(caregiverId: string): Promise<any[]>;
export declare function respondToFamilyRequest(caregiverId: string, requestId: string, action: 'approve' | 'reject'): Promise<any>;
export declare function deleteFamilyRelationshipByPatient(patientId: string, familyUserId: string): Promise<void>;
export declare function getCareCircleForCaregiver(caregiverId: string, patientId: string): Promise<any[]>;
export declare function getPatientRelationship(caregiverId: string, patientId: string): Promise<any>;
//# sourceMappingURL=relationships.service.d.ts.map