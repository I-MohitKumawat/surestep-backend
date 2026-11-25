/**
 * Patients actively assigned to the authenticated Professional Caregiver.
 */
export declare function getMyPatients(caregiverId: string): Promise<any[]>;
/**
 * Caregivers actively assigned to a Patient.
 */
export declare function getMyCaregivers(patientId: string): Promise<any[]>;
/**
 * Members of the Patient's active Care Circle. For a FAMILY caller the
 * Patient is resolved from their Circle participation.
 */
export declare function getMyFamily(userId: string, role: string): Promise<any[]>;
/**
 * Caregiver discovery search. Delegates to the canonical discovery service;
 * phone/email are never exposed.
 */
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
//# sourceMappingURL=relationships.service.d.ts.map