import { z } from 'zod';
export declare const DiscoveryQuerySchema: z.ZodObject<{
    search: z.ZodOptional<z.ZodString>;
    query: z.ZodOptional<z.ZodString>;
    role: z.ZodOptional<z.ZodString>;
    professionalRole: z.ZodOptional<z.ZodString>;
    dementiaExperience: z.ZodOptional<z.ZodPipe<z.ZodEnum<{
        0: "0";
        1: "1";
        true: "true";
        false: "false";
    }>, z.ZodTransform<boolean, "0" | "1" | "true" | "false">>>;
    minExperienceYears: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    capabilities: z.ZodOptional<z.ZodPipe<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>, z.ZodTransform<string[], string | string[]>>>;
    specializations: z.ZodOptional<z.ZodPipe<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>, z.ZodTransform<string[], string | string[]>>>;
    languages: z.ZodOptional<z.ZodPipe<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>, z.ZodTransform<string[], string | string[]>>>;
    availability: z.ZodOptional<z.ZodPipe<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>, z.ZodTransform<string[], string | string[]>>>;
    city: z.ZodOptional<z.ZodString>;
    maxHourlyRate: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    targetPatientId: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    sortBy: z.ZodDefault<z.ZodEnum<{
        rating: "rating";
        newest: "newest";
        experience: "experience";
        price_asc: "price_asc";
        price_desc: "price_desc";
    }>>;
    sortOrder: z.ZodOptional<z.ZodEnum<{
        asc: "asc";
        desc: "desc";
    }>>;
}, z.core.$strip>;
export type DiscoveryQueryParams = z.infer<typeof DiscoveryQuerySchema>;
export interface CaregiverSearchResult {
    caregiverId: string;
    name: string;
    photoUrl: string | null;
    professionalRole: string | null;
    yearsOfExperience: number;
    dementiaExperienceYears: number;
    hasDementiaTraining: boolean;
    specializations: string[];
    careCapabilities: string[];
    languagesSpoken: string[];
    availabilityTypes: string[];
    serviceCity: string | null;
    serviceRadiusKm: number;
    hourlyRateInr: number | null;
    dailyRateInr: number | null;
    rating: number | null;
    ratingCount: number;
    bioSummary: string | null;
    isDiscoverable: boolean;
    verificationStatus: string;
}
export interface CaregiverDetailedProfile extends CaregiverSearchResult {
    fullBio: string | null;
    qualifications: any[];
    verificationStatus: string;
    updatedAt: string;
}
export interface DiscoveryPagination {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasMore: boolean;
}
export interface DiscoverySearchResponse {
    caregivers: CaregiverSearchResult[];
    pagination: DiscoveryPagination;
}
//# sourceMappingURL=discovery.types.d.ts.map