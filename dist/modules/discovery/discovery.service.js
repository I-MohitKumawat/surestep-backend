"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateFamilyCareDiscoveryAuth = evaluateFamilyCareDiscoveryAuth;
exports.validateDiscoveryAccess = validateDiscoveryAccess;
exports.searchCaregivers = searchCaregivers;
exports.getCaregiverProfileById = getCaregiverProfileById;
const config_1 = __importDefault(require("../../db/config"));
const AppError_1 = require("../../shared/errors/AppError");
const cityNormalizer_1 = require("./cityNormalizer");
/**
 * Evaluate whether a family member has legitimate authority to search/discover care for a patient.
 */
async function evaluateFamilyCareDiscoveryAuth(familyUserId, targetPatientId) {
    const relCheck = await config_1.default.query(`SELECT pr.id, pr.relationship_type, pr.status, u.city AS patient_city
     FROM patient_relationships pr
     JOIN users u ON u.id = pr.patient_user_id
     WHERE pr.patient_user_id = $1
       AND pr.related_user_id = $2
       AND pr.status = 'CONFIRMED'
       AND pr.relationship_type IN ('GUARDIAN', 'FAMILY_CLOSE', 'FAMILY_EXTENDED')
     LIMIT 1`, [targetPatientId, familyUserId]);
    const row = relCheck.rows[0];
    if (!row) {
        return {
            hasActiveRelationship: false,
            relationshipType: null,
            relationshipStatus: null,
            hasCareResponsibility: false,
            canDiscoverCaregivers: false,
            patientCity: null,
        };
    }
    // 1. Relationship tier
    const hasActiveRelationship = true;
    const relationshipType = row.relationship_type;
    const relationshipStatus = row.status;
    // 2. Responsibility tier:
    // In the current schema, all confirmed family members in the care circle share care coordination.
    // Future extension: Check if row.responsibility === 'PRIMARY_COORDINATOR' or similar.
    const hasCareResponsibility = true;
    // 3. Permission tier:
    // In the current schema, discovery permission is granted to confirmed family members with care responsibility.
    // Future extension: Check explicit permission flag e.g. row.can_arrange_care === true.
    const canDiscoverCaregivers = hasActiveRelationship && hasCareResponsibility;
    return {
        hasActiveRelationship,
        relationshipType,
        relationshipStatus,
        hasCareResponsibility,
        canDiscoverCaregivers,
        patientCity: row.patient_city || null,
    };
}
/**
 * Validate that the requester has access to care discovery,
 * and verify targetPatientId authorization.
 *
 * Rules:
 *  - PATIENT: Allowed if self-created (onboarding_source != 'FAMILY'). targetPatientId resolves to self.
 *  - FAMILY: targetPatientId is REQUIRED. Must be confirmed care circle member for that patient.
 *  - CAREGIVER: Forbidden (ROLE_NOT_PERMITTED).
 */
async function validateDiscoveryAccess(user, targetPatientId) {
    const role = user.role;
    if (role !== 'PATIENT' && role !== 'FAMILY') {
        throw new AppError_1.AppError('ROLE_NOT_PERMITTED', 'Care discovery is only available to patients and family members', 403);
    }
    // 1. Patient requester checks
    if (role === 'PATIENT') {
        // Check if patient was created by family (onboarding_source = 'FAMILY')
        const profileRes = await config_1.default.query(`SELECT onboarding_source FROM patient_profiles WHERE user_id = $1`, [user.id]);
        const onboardingSource = profileRes.rows[0]?.onboarding_source;
        if (onboardingSource === 'FAMILY') {
            throw new AppError_1.AppError('DISCOVERY_MANAGED_BY_FAMILY', 'Care discovery for this patient is managed by their family care circle.', 403);
        }
        // Patient may target self or omit targetPatientId (resolves to self)
        if (targetPatientId && targetPatientId !== user.id) {
            throw new AppError_1.AppError('TARGET_PATIENT_UNAUTHORIZED', 'Patients can only search for care on their own behalf', 403);
        }
        return { targetPatientCity: user.city || null };
    }
    // 2. Family requester checks
    if (role === 'FAMILY') {
        if (!targetPatientId) {
            throw new AppError_1.AppError('TARGET_PATIENT_REQUIRED', 'A target patient context (targetPatientId) is required for family care discovery', 403);
        }
        const auth = await evaluateFamilyCareDiscoveryAuth(user.id, targetPatientId);
        if (!auth.hasActiveRelationship) {
            throw new AppError_1.AppError('TARGET_PATIENT_UNAUTHORIZED', 'You are not authorized to search for caregivers on behalf of this patient', 403);
        }
        if (!auth.canDiscoverCaregivers) {
            throw new AppError_1.AppError('INSUFFICIENT_CARE_PERMISSION', 'Your relationship tier does not permit arranging professional care for this patient', 403);
        }
        return { targetPatientCity: auth.patientCity };
    }
    return {};
}
/**
 * Canonical Caregiver Discovery Search query engine.
 */
async function searchCaregivers(inputParams, user) {
    const params = {
        page: 1,
        limit: 20,
        sortBy: 'newest',
        ...inputParams,
    };
    const { targetPatientCity } = await validateDiscoveryAccess(user, params.targetPatientId);
    const values = [];
    const whereClauses = [
        `u.role = 'CAREGIVER'`,
        `u.is_active = TRUE`,
        `u.deleted_at IS NULL`,
        `cp.is_discoverable = TRUE`,
    ];
    let paramIdx = 1;
    // Search text (matches name, professional_role, bio, specializations, capabilities, qualifications, service_city)
    const searchText = params.search || params.query;
    if (searchText && searchText.trim().length > 0) {
        const pattern = `%${searchText.trim()}%`;
        values.push(pattern);
        whereClauses.push(`(
      u.name ILIKE $${paramIdx} OR
      cp.professional_role ILIKE $${paramIdx} OR
      cp.bio ILIKE $${paramIdx} OR
      array_to_string(cp.specializations, ' ') ILIKE $${paramIdx} OR
      array_to_string(cp.care_capabilities, ' ') ILIKE $${paramIdx} OR
      cp.qualifications::text ILIKE $${paramIdx} OR
      COALESCE(cp.service_city, u.city) ILIKE $${paramIdx}
    )`);
        paramIdx++;
    }
    // Professional role
    const roleFilter = params.professionalRole || params.role;
    if (roleFilter && roleFilter.trim().length > 0) {
        values.push(`%${roleFilter.trim()}%`);
        whereClauses.push(`cp.professional_role ILIKE $${paramIdx}`);
        paramIdx++;
    }
    // Dementia experience
    if (params.dementiaExperience === true) {
        whereClauses.push(`(cp.has_dementia_training = TRUE OR cp.dementia_experience_years > 0)`);
    }
    // Minimum experience years
    if (params.minExperienceYears != null && params.minExperienceYears > 0) {
        values.push(params.minExperienceYears);
        whereClauses.push(`cp.years_of_experience >= $${paramIdx}`);
        paramIdx++;
    }
    // Care capabilities (array overlap)
    if (params.capabilities && params.capabilities.length > 0) {
        values.push(params.capabilities);
        whereClauses.push(`cp.care_capabilities && $${paramIdx}::text[]`);
        paramIdx++;
    }
    // Specializations (array overlap)
    if (params.specializations && params.specializations.length > 0) {
        values.push(params.specializations);
        whereClauses.push(`cp.specializations && $${paramIdx}::text[]`);
        paramIdx++;
    }
    // Languages spoken (array overlap)
    if (params.languages && params.languages.length > 0) {
        values.push(params.languages);
        whereClauses.push(`cp.languages_spoken && $${paramIdx}::text[]`);
        paramIdx++;
    }
    // Availability types (array overlap)
    if (params.availability && params.availability.length > 0) {
        values.push(params.availability);
        whereClauses.push(`cp.availability_types && $${paramIdx}::text[]`);
        paramIdx++;
    }
    // Explicit user-selected city filter
    // When the user explicitly filters by city, enforce matching with alias normalization.
    // Missing city filter must NEVER silently hide otherwise eligible caregivers.
    if (params.city && params.city.trim().length > 0) {
        const explicitCityAliases = (0, cityNormalizer_1.getCityAliases)(params.city);
        if (explicitCityAliases.length > 0) {
            const cityPattern = (0, cityNormalizer_1.buildCityRegexPattern)(explicitCityAliases);
            values.push(cityPattern);
            whereClauses.push(`(COALESCE(cp.service_city, u.city) ~* $${paramIdx})`);
            paramIdx++;
        }
    }
    // Location relevance signal (default ranking behavior when no explicit city filter is selected)
    // If targetPatientCity is available, prioritize local caregivers in ordering without hard-excluding
    // caregivers from other areas or with unset service cities.
    let localMatchParamIdx = null;
    if (!params.city && targetPatientCity && targetPatientCity.trim().length > 0) {
        const patientCityAliases = (0, cityNormalizer_1.getCityAliases)(targetPatientCity);
        if (patientCityAliases.length > 0) {
            const patientCityPattern = (0, cityNormalizer_1.buildCityRegexPattern)(patientCityAliases);
            values.push(patientCityPattern);
            localMatchParamIdx = paramIdx++;
        }
    }
    // Max hourly rate
    if (params.maxHourlyRate != null && params.maxHourlyRate > 0) {
        values.push(params.maxHourlyRate);
        whereClauses.push(`cp.hourly_rate IS NOT NULL AND cp.hourly_rate <= $${paramIdx}`);
        paramIdx++;
    }
    // Sorting
    // When default sorting (newest) is used, patient location serves as a relevance signal,
    // prioritizing local caregivers without excluding non-local or unset-city caregivers.
    // Explicit sort criteria (price, rating, experience) strictly respect their requested order.
    let orderClause;
    switch (params.sortBy) {
        case 'experience':
            orderClause = `ORDER BY cp.years_of_experience DESC, u.name ASC, u.id ASC`;
            break;
        case 'price_asc':
            orderClause = `ORDER BY cp.hourly_rate ASC NULLS LAST, u.name ASC, u.id ASC`;
            break;
        case 'price_desc':
            orderClause = `ORDER BY cp.hourly_rate DESC NULLS LAST, u.name ASC, u.id ASC`;
            break;
        case 'rating':
            // Honest rating sorting: unrated caregivers are placed last, never fake 5.0
            orderClause = `ORDER BY cp.rating DESC NULLS LAST, cp.rating_count DESC NULLS LAST, u.name ASC, u.id ASC`;
            break;
        case 'newest':
        default: {
            const localMatchOrder = localMatchParamIdx != null
                ? `(CASE WHEN COALESCE(cp.service_city, u.city) ~* $${localMatchParamIdx} THEN 0 ELSE 1 END) ASC, `
                : '';
            orderClause = `ORDER BY ${localMatchOrder}cp.updated_at DESC, u.created_at DESC, u.id ASC`;
            break;
        }
    }
    // Pagination
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;
    values.push(limit);
    const limitParam = `$${paramIdx++}`;
    values.push(offset);
    const offsetParam = `$${paramIdx++}`;
    const sql = `
    SELECT 
      u.id AS caregiver_id,
      u.name,
      u.photo_url,
      cp.professional_role,
      cp.years_of_experience,
      cp.dementia_experience_years,
      cp.has_dementia_training,
      cp.specializations,
      cp.care_capabilities,
      cp.languages_spoken,
      cp.availability_types,
      COALESCE(cp.service_city, u.city) AS service_city,
      cp.service_radius_km,
      cp.hourly_rate,
      cp.daily_rate,
      cp.rating,
      cp.rating_count,
      cp.bio,
      cp.verification_status,
      cp.is_discoverable,
      COUNT(*) OVER() AS total_count
    FROM users u
    JOIN caregiver_profiles cp ON cp.user_id = u.id
    WHERE ${whereClauses.join(' AND ')}
    ${orderClause}
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `;
    const result = await config_1.default.query(sql, values);
    const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
    const totalPages = Math.ceil(total / limit) || 1;
    const hasMore = page < totalPages;
    const caregivers = result.rows.map((row) => ({
        caregiverId: row.caregiver_id,
        name: row.name,
        photoUrl: row.photo_url || null,
        professionalRole: row.professional_role || null,
        yearsOfExperience: row.years_of_experience || 0,
        dementiaExperienceYears: row.dementia_experience_years || 0,
        hasDementiaTraining: Boolean(row.has_dementia_training),
        specializations: row.specializations || [],
        careCapabilities: row.care_capabilities || [],
        languagesSpoken: row.languages_spoken || [],
        availabilityTypes: row.availability_types || [],
        serviceCity: row.service_city || null,
        serviceRadiusKm: row.service_radius_km || 10,
        hourlyRateInr: row.hourly_rate != null ? parseFloat(row.hourly_rate) : null,
        dailyRateInr: row.daily_rate != null ? parseFloat(row.daily_rate) : null,
        rating: row.rating_count > 0 && row.rating != null ? parseFloat(row.rating) : null,
        ratingCount: parseInt(row.rating_count, 10) || 0,
        bioSummary: row.bio
            ? row.bio.length > 160
                ? `${row.bio.slice(0, 157)}...`
                : row.bio
            : null,
        isDiscoverable: Boolean(row.is_discoverable),
        verificationStatus: row.verification_status || 'PENDING',
    }));
    return {
        caregivers,
        pagination: {
            total,
            page,
            limit,
            totalPages,
            hasMore,
        },
    };
}
/**
 * Fetch detailed, authoritative Caregiver Profile for discovery.
 * Strips private phone, email, Firebase UID, and exact addresses.
 */
async function getCaregiverProfileById(caregiverId, user, targetPatientId) {
    await validateDiscoveryAccess(user, targetPatientId);
    const sql = `
    SELECT 
      u.id AS caregiver_id,
      u.name,
      u.photo_url,
      cp.professional_role,
      cp.years_of_experience,
      cp.dementia_experience_years,
      cp.has_dementia_training,
      cp.specializations,
      cp.care_capabilities,
      cp.languages_spoken,
      cp.availability_types,
      COALESCE(cp.service_city, u.city) AS service_city,
      cp.service_radius_km,
      cp.hourly_rate,
      cp.daily_rate,
      cp.rating,
      cp.rating_count,
      cp.bio,
      cp.qualifications,
      cp.verification_status,
      cp.is_discoverable,
      cp.updated_at
    FROM users u
    JOIN caregiver_profiles cp ON cp.user_id = u.id
    WHERE u.id = $1
      AND u.role = 'CAREGIVER'
      AND u.is_active = TRUE
      AND u.deleted_at IS NULL
      AND cp.is_discoverable = TRUE
  `;
    const result = await config_1.default.query(sql, [caregiverId]);
    if (!result.rows[0]) {
        throw new AppError_1.AppError('NOT_FOUND', 'Caregiver profile not found or not discoverable', 404);
    }
    const row = result.rows[0];
    return {
        caregiverId: row.caregiver_id,
        name: row.name,
        photoUrl: row.photo_url || null,
        professionalRole: row.professional_role || null,
        yearsOfExperience: row.years_of_experience || 0,
        dementiaExperienceYears: row.dementia_experience_years || 0,
        hasDementiaTraining: Boolean(row.has_dementia_training),
        specializations: row.specializations || [],
        careCapabilities: row.care_capabilities || [],
        languagesSpoken: row.languages_spoken || [],
        availabilityTypes: row.availability_types || [],
        serviceCity: row.service_city || null,
        serviceRadiusKm: row.service_radius_km || 10,
        hourlyRateInr: row.hourly_rate != null ? parseFloat(row.hourly_rate) : null,
        dailyRateInr: row.daily_rate != null ? parseFloat(row.daily_rate) : null,
        rating: row.rating_count > 0 && row.rating != null ? parseFloat(row.rating) : null,
        ratingCount: parseInt(row.rating_count, 10) || 0,
        bioSummary: row.bio
            ? row.bio.length > 160
                ? `${row.bio.slice(0, 157)}...`
                : row.bio
            : null,
        fullBio: row.bio || null,
        qualifications: Array.isArray(row.qualifications)
            ? row.qualifications
            : (typeof row.qualifications === 'string'
                ? (() => { try {
                    const p = JSON.parse(row.qualifications);
                    return Array.isArray(p) ? p : [row.qualifications];
                }
                catch {
                    return [row.qualifications];
                } })()
                : []),
        verificationStatus: row.verification_status || 'UNVERIFIED',
        updatedAt: row.updated_at,
        isDiscoverable: Boolean(row.is_discoverable),
    };
}
//# sourceMappingURL=discovery.service.js.map