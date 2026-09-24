"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscoveryQuerySchema = void 0;
const zod_1 = require("zod");
// ─── Query Validation Schema ──────────────────────────────────────────────────
exports.DiscoveryQuerySchema = zod_1.z.object({
    search: zod_1.z.string().trim().max(100).optional(),
    query: zod_1.z.string().trim().max(100).optional(), // alias for search
    role: zod_1.z.string().trim().max(50).optional(),
    professionalRole: zod_1.z.string().trim().max(50).optional(), // alias for role
    dementiaExperience: zod_1.z
        .enum(['true', 'false', '1', '0'])
        .transform((val) => val === 'true' || val === '1')
        .optional(),
    minExperienceYears: zod_1.z.coerce.number().int().min(0).max(60).optional(),
    capabilities: zod_1.z
        .union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())])
        .transform((val) => (Array.isArray(val) ? val : val.split(',').map((s) => s.trim()).filter(Boolean)))
        .optional(),
    specializations: zod_1.z
        .union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())])
        .transform((val) => (Array.isArray(val) ? val : val.split(',').map((s) => s.trim()).filter(Boolean)))
        .optional(),
    languages: zod_1.z
        .union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())])
        .transform((val) => (Array.isArray(val) ? val : val.split(',').map((s) => s.trim()).filter(Boolean)))
        .optional(),
    availability: zod_1.z
        .union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())])
        .transform((val) => (Array.isArray(val) ? val : val.split(',').map((s) => s.trim()).filter(Boolean)))
        .optional(),
    city: zod_1.z.string().trim().max(100).optional(),
    maxHourlyRate: zod_1.z.coerce.number().min(0).max(100000).optional(),
    targetPatientId: zod_1.z.string().uuid().optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(50).default(20),
    sortBy: zod_1.z.enum(['newest', 'experience', 'price_asc', 'price_desc', 'rating']).default('newest'),
    sortOrder: zod_1.z.enum(['asc', 'desc']).optional(),
});
//# sourceMappingURL=discovery.types.js.map