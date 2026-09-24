import { z } from 'zod';

// ─── Query Validation Schema ──────────────────────────────────────────────────

export const DiscoveryQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  query: z.string().trim().max(100).optional(), // alias for search
  role: z.string().trim().max(50).optional(),
  professionalRole: z.string().trim().max(50).optional(), // alias for role
  dementiaExperience: z
    .enum(['true', 'false', '1', '0'])
    .transform((val) => val === 'true' || val === '1')
    .optional(),
  minExperienceYears: z.coerce.number().int().min(0).max(60).optional(),
  capabilities: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : val.split(',').map((s) => s.trim()).filter(Boolean)))
    .optional(),
  specializations: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : val.split(',').map((s) => s.trim()).filter(Boolean)))
    .optional(),
  languages: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : val.split(',').map((s) => s.trim()).filter(Boolean)))
    .optional(),
  availability: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : val.split(',').map((s) => s.trim()).filter(Boolean)))
    .optional(),
  city: z.string().trim().max(100).optional(),
  maxHourlyRate: z.coerce.number().min(0).max(100000).optional(),
  targetPatientId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sortBy: z.enum(['newest', 'experience', 'price_asc', 'price_desc', 'rating']).default('newest'),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export type DiscoveryQueryParams = z.infer<typeof DiscoveryQuerySchema>;

// ─── Response DTOs ────────────────────────────────────────────────────────────

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
