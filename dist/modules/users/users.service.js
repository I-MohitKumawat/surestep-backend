"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMe = getMe;
exports.updateMe = updateMe;
exports.upsertPatientProfile = upsertPatientProfile;
exports.getPatientProfile = getPatientProfile;
exports.upsertCaregiverProfile = upsertCaregiverProfile;
exports.getCaregiverProfile = getCaregiverProfile;
exports.upsertFamilyProfile = upsertFamilyProfile;
const config_1 = __importDefault(require("../../db/config"));
const AppError_1 = require("../../shared/errors/AppError");
// ─── Users ───────────────────────────────────────────────────────────────────
async function getMe(userId) {
    const result = await config_1.default.query('SELECT * FROM users WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL', [userId]);
    if (!result.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'User not found', 404);
    const user = result.rows[0];
    let hasPatientProfile = false;
    let patientOnboardingSource = null;
    let hasCaregiverProfile = false;
    let hasFamilyProfile = false;
    let relationships = [];
    try {
        // Check which profile rows exist for this user
        const profileCheck = await config_1.default.query(`SELECT 
         EXISTS(SELECT 1 FROM patient_profiles WHERE user_id = $1) AS has_patient_profile,
         (SELECT onboarding_source FROM patient_profiles WHERE user_id = $1) AS patient_onboarding_source,
         EXISTS(SELECT 1 FROM caregiver_profiles WHERE user_id = $1) AS has_caregiver_profile,
         EXISTS(SELECT 1 FROM family_profiles WHERE user_id = $1) AS has_family_profile`, [userId]);
        hasPatientProfile = Boolean(profileCheck.rows[0]?.has_patient_profile);
        patientOnboardingSource = profileCheck.rows[0]?.patient_onboarding_source || null;
        hasCaregiverProfile = Boolean(profileCheck.rows[0]?.has_caregiver_profile);
        hasFamilyProfile = Boolean(profileCheck.rows[0]?.has_family_profile);
    }
    catch (err) {
        console.error('[getMe] Error checking profiles:', err);
    }
    try {
        // Check active relationships safely casting status to text
        const relResult = await config_1.default.query(`SELECT 
         pr.id,
         pr.patient_user_id,
         pr.related_user_id,
         pr.relationship_type,
         pr.status,
         pu.name AS patient_name,
         ru.name AS related_name
       FROM patient_relationships pr
       LEFT JOIN users pu ON pu.id = pr.patient_user_id
       LEFT JOIN users ru ON ru.id = pr.related_user_id
       WHERE (pr.patient_user_id = $1 OR pr.related_user_id = $1)
         AND pr.status::text IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`, [userId]);
        relationships = relResult.rows || [];
    }
    catch (err) {
        console.error('[getMe] Error checking relationships:', err);
    }
    // Resolve active domain role based on verified domain context
    let activeRole = 'NEW_USER';
    if (hasPatientProfile) {
        activeRole = 'PATIENT';
    }
    else if (hasCaregiverProfile || relationships.some((r) => r.related_user_id === userId && r.relationship_type === 'CAREGIVER')) {
        activeRole = 'CAREGIVER';
    }
    else if (hasFamilyProfile || relationships.some((r) => r.related_user_id === userId && ['FAMILY_CLOSE', 'FAMILY_EXTENDED', 'GUARDIAN'].includes(r.relationship_type))) {
        activeRole = 'FAMILY';
    }
    else if (user.role) {
        activeRole = user.role;
    }
    return {
        user,
        activeRole,
        careContext: {
            relationships,
            profiles: {
                hasPatientProfile,
                hasCaregiverProfile,
                hasFamilyProfile,
                patientOnboardingSource,
            },
        },
    };
}
async function updateMe(userId, data) {
    const fields = [];
    const values = [];
    let i = 1;
    if (data.name !== undefined) {
        fields.push(`name = $${i++}`);
        values.push(data.name);
    }
    if (data.preferred_language !== undefined) {
        fields.push(`preferred_language = $${i++}`);
        values.push(data.preferred_language);
    }
    if (data.city !== undefined) {
        fields.push(`city = $${i++}`);
        values.push(data.city);
    }
    if (data.date_of_birth !== undefined) {
        fields.push(`date_of_birth = $${i++}`);
        values.push(data.date_of_birth);
    }
    if (data.gender !== undefined) {
        fields.push(`gender = $${i++}`);
        values.push(data.gender);
    }
    if (data.photo_url !== undefined) {
        fields.push(`photo_url = $${i++}`);
        values.push(data.photo_url);
    }
    if (fields.length === 0)
        throw new AppError_1.AppError('VALIDATION_ERROR', 'No fields to update', 422);
    fields.push(`updated_at = NOW()`);
    values.push(userId);
    const result = await config_1.default.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, values);
    return result.rows[0];
}
// ─── Patient Profile ─────────────────────────────────────────────────────────
async function upsertPatientProfile(userId, data) {
    // Emergency contact resolution: check if contact phone matches an existing user
    let emergencyUserId = null;
    let emergencyStatus = 'UNLINKED';
    const cleanPhone = (data.emergency_contact_phone || '').trim();
    if (cleanPhone) {
        try {
            const match = await config_1.default.query('SELECT id FROM users WHERE phone = $1 AND id != $2', [cleanPhone, userId]);
            if (match.rows[0]) {
                emergencyUserId = match.rows[0].id;
                emergencyStatus = 'PENDING';
                // Ensure patient_relationships record exists
                await config_1.default.query(`INSERT INTO patient_relationships (
             patient_user_id, related_user_id, relationship_type, status, invited_by, note
           ) VALUES ($1, $2, 'FAMILY_CLOSE', 'PENDING', $1, 'Emergency contact added during onboarding')
           ON CONFLICT (patient_user_id, related_user_id) DO NOTHING`, [userId, emergencyUserId]);
            }
        }
        catch (relErr) {
            console.warn('[upsertPatientProfile] Emergency contact relationship notice:', relErr);
        }
    }
    const result = await config_1.default.query(`INSERT INTO patient_profiles (
       user_id,
       emergency_contact_name,
       emergency_contact_phone,
       emergency_contact_relation,
       emergency_contact_user_id,
       emergency_contact_status,
       diagnosis,
       diagnosis_date,
       severity_level,
       living_arrangement,
       care_needs,
       safety_concerns,
       communication_preferences,
       other_conditions,
       onboarding_source,
       medications,
       known_triggers,
       comfort_items,
       favourite_songs,
       cognitive_baseline_date,
       nimhans_patient_id
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
     )
     ON CONFLICT (user_id) DO UPDATE SET
       emergency_contact_name     = EXCLUDED.emergency_contact_name,
       emergency_contact_phone    = EXCLUDED.emergency_contact_phone,
       emergency_contact_relation = EXCLUDED.emergency_contact_relation,
       emergency_contact_user_id  = COALESCE(EXCLUDED.emergency_contact_user_id, patient_profiles.emergency_contact_user_id),
       emergency_contact_status   = EXCLUDED.emergency_contact_status,
       diagnosis                  = EXCLUDED.diagnosis,
       diagnosis_date             = EXCLUDED.diagnosis_date,
       severity_level             = EXCLUDED.severity_level,
       living_arrangement         = EXCLUDED.living_arrangement,
       care_needs                 = EXCLUDED.care_needs,
       safety_concerns            = EXCLUDED.safety_concerns,
       communication_preferences  = EXCLUDED.communication_preferences,
       other_conditions           = EXCLUDED.other_conditions,
       onboarding_source          = EXCLUDED.onboarding_source,
       medications                = EXCLUDED.medications,
       known_triggers             = EXCLUDED.known_triggers,
       comfort_items              = EXCLUDED.comfort_items,
       favourite_songs            = EXCLUDED.favourite_songs,
       cognitive_baseline_date    = EXCLUDED.cognitive_baseline_date,
       nimhans_patient_id         = EXCLUDED.nimhans_patient_id,
       updated_at                 = NOW()
     RETURNING *`, [
        userId,
        data.emergency_contact_name ?? null,
        data.emergency_contact_phone ?? null,
        data.emergency_contact_relation ?? null,
        emergencyUserId,
        emergencyStatus,
        data.diagnosis ?? null,
        data.diagnosis_date ?? null,
        data.severity_level ?? null,
        data.living_arrangement ?? null,
        data.care_needs ?? [],
        data.safety_concerns ?? [],
        data.communication_preferences ?? [],
        data.other_conditions ?? [],
        data.onboarding_source ?? 'SELF',
        JSON.stringify(data.medications ?? []),
        data.known_triggers ?? [],
        data.comfort_items ?? [],
        JSON.stringify(data.favourite_songs ?? []),
        data.cognitive_baseline_date ?? null,
        data.nimhans_patient_id ?? null,
    ]);
    // Mark onboarding complete
    await config_1.default.query(`UPDATE users SET onboarding_complete = TRUE, updated_at = NOW() WHERE id = $1`, [userId]);
    return result.rows[0];
}
async function getPatientProfile(patientId) {
    const result = await config_1.default.query(`SELECT pp.*, u.name, u.photo_url, u.city, u.preferred_language
     FROM patient_profiles pp
     JOIN users u ON u.id = pp.user_id
     WHERE pp.user_id = $1`, [patientId]);
    if (!result.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Patient profile not found', 404);
    return result.rows[0];
}
// ─── Caregiver Profile ───────────────────────────────────────────────────────
async function upsertCaregiverProfile(userId, data) {
    const result = await config_1.default.query(`INSERT INTO caregiver_profiles (
       user_id,
       years_of_experience,
       specializations,
       languages_spoken,
       availability_types,
       service_radius_km,
       max_patients,
       hourly_rate,
       daily_rate,
       bio,
       is_discoverable,
       professional_role,
       dementia_experience_years,
       has_dementia_training,
       care_capabilities,
       qualifications,
       service_city
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT (user_id) DO UPDATE SET
       years_of_experience       = EXCLUDED.years_of_experience,
       specializations           = EXCLUDED.specializations,
       languages_spoken          = EXCLUDED.languages_spoken,
       availability_types        = EXCLUDED.availability_types,
       service_radius_km         = EXCLUDED.service_radius_km,
       max_patients              = EXCLUDED.max_patients,
       hourly_rate               = EXCLUDED.hourly_rate,
       daily_rate                = EXCLUDED.daily_rate,
       bio                       = EXCLUDED.bio,
       is_discoverable           = EXCLUDED.is_discoverable,
       professional_role         = COALESCE(EXCLUDED.professional_role, caregiver_profiles.professional_role),
       dementia_experience_years = COALESCE(EXCLUDED.dementia_experience_years, caregiver_profiles.dementia_experience_years),
       has_dementia_training     = COALESCE(EXCLUDED.has_dementia_training, caregiver_profiles.has_dementia_training),
       care_capabilities         = COALESCE(EXCLUDED.care_capabilities, caregiver_profiles.care_capabilities),
       qualifications            = COALESCE(EXCLUDED.qualifications, caregiver_profiles.qualifications),
       service_city              = COALESCE(EXCLUDED.service_city, caregiver_profiles.service_city),
       updated_at                = NOW()
     RETURNING *`, [
        userId,
        data.years_of_experience ?? data.yearsExperience ?? 0,
        data.specializations ?? data.specs ?? [],
        data.languages_spoken ?? data.languagesSpoken ?? [],
        data.availability_types ?? data.availabilityTypes ?? [],
        data.service_radius_km ?? data.serviceRadiusKm ?? 10,
        data.max_patients ?? data.maxPatients ?? 3,
        data.hourly_rate ?? data.hourlyRate ?? null,
        data.daily_rate ?? data.dailyRate ?? null,
        data.bio ?? data.aboutMe ?? null,
        data.is_discoverable ?? data.isDiscoverable ?? true,
        data.professional_role ?? data.professionalRole ?? null,
        data.dementia_experience_years ?? data.dementiaExperienceYears ?? 0,
        data.has_dementia_training ?? data.hasDementiaTraining ?? false,
        data.care_capabilities ?? data.careCapabilities ?? [],
        JSON.stringify(data.qualifications ?? []),
        data.service_city ?? data.serviceCity ?? null,
    ]);
    await config_1.default.query(`UPDATE users SET onboarding_complete = TRUE, updated_at = NOW() WHERE id = $1`, [userId]);
    const row = result.rows[0];
    return {
        ...row,
        professionalRole: row.professional_role,
        yearsExperience: row.years_of_experience,
        dementiaExperienceYears: row.dementia_experience_years,
        hasDementiaTraining: row.has_dementia_training,
        careCapabilities: row.care_capabilities,
        specializations: row.specializations,
        qualifications: row.qualifications,
        languagesSpoken: row.languages_spoken,
        availabilityTypes: row.availability_types,
        serviceCity: row.service_city,
        serviceRadiusKm: row.service_radius_km,
        maxPatients: row.max_patients,
        hourlyRate: row.hourly_rate,
        dailyRate: row.daily_rate,
        aboutMe: row.bio,
        isDiscoverable: row.is_discoverable,
        verificationStatus: row.verification_status,
        isVerified: row.is_verified,
    };
}
async function getCaregiverProfile(caregiverId) {
    const result = await config_1.default.query(`SELECT cp.*, u.name, u.photo_url, u.city, u.preferred_language
     FROM caregiver_profiles cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.user_id = $1
       AND u.is_active = TRUE
       AND u.deleted_at IS NULL
       AND cp.is_discoverable = TRUE`, [caregiverId]);
    if (!result.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Caregiver profile not found or not discoverable', 404);
    const row = result.rows[0];
    return {
        ...row,
        rating: row.rating_count > 0 && row.rating != null ? parseFloat(row.rating) : null,
        ratingCount: parseInt(row.rating_count, 10) || 0,
        professionalRole: row.professional_role,
        yearsExperience: row.years_of_experience,
        dementiaExperienceYears: row.dementia_experience_years,
        hasDementiaTraining: row.has_dementia_training,
        careCapabilities: row.care_capabilities,
        specializations: row.specializations,
        qualifications: row.qualifications,
        languagesSpoken: row.languages_spoken,
        availabilityTypes: row.availability_types,
        serviceCity: row.service_city,
        serviceRadiusKm: row.service_radius_km,
        maxPatients: row.max_patients,
        hourlyRate: row.hourly_rate,
        dailyRate: row.daily_rate,
        aboutMe: row.bio,
        isDiscoverable: row.is_discoverable,
        verificationStatus: row.verification_status,
        isVerified: row.is_verified,
    };
}
// ─── Family Profile ──────────────────────────────────────────────────────────
async function upsertFamilyProfile(userId, data) {
    try {
        const result = await config_1.default.query(`INSERT INTO family_profiles (
         user_id,
         relation_label,
         proximity,
         involvement_interests,
         avatar_url,
         notify_on_breach,
         notify_on_missed_critical,
         notify_on_sos,
         notify_on_daily_digest,
         digest_frequency,
         whatsapp_number
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id) DO UPDATE SET
         relation_label            = COALESCE(EXCLUDED.relation_label, family_profiles.relation_label),
         proximity                 = COALESCE(EXCLUDED.proximity, family_profiles.proximity),
         involvement_interests     = COALESCE(EXCLUDED.involvement_interests, family_profiles.involvement_interests),
         avatar_url                = COALESCE(EXCLUDED.avatar_url, family_profiles.avatar_url),
         notify_on_breach          = COALESCE(EXCLUDED.notify_on_breach, family_profiles.notify_on_breach),
         notify_on_missed_critical = COALESCE(EXCLUDED.notify_on_missed_critical, family_profiles.notify_on_missed_critical),
         notify_on_sos             = COALESCE(EXCLUDED.notify_on_sos, family_profiles.notify_on_sos),
         notify_on_daily_digest    = COALESCE(EXCLUDED.notify_on_daily_digest, family_profiles.notify_on_daily_digest),
         digest_frequency          = COALESCE(EXCLUDED.digest_frequency, family_profiles.digest_frequency),
         whatsapp_number           = COALESCE(EXCLUDED.whatsapp_number, family_profiles.whatsapp_number),
         updated_at                = NOW()
       RETURNING *`, [
            userId,
            data.relation_label ?? null,
            data.proximity ?? null,
            data.involvement_interests ?? [],
            data.avatar_url ?? null,
            data.notify_on_breach ?? true,
            data.notify_on_missed_critical ?? true,
            data.notify_on_sos ?? true,
            data.notify_on_daily_digest ?? true,
            data.digest_frequency ?? 'DAILY',
            data.whatsapp_number ?? null,
        ]);
        await config_1.default.query(`UPDATE users SET onboarding_complete = TRUE, updated_at = NOW() WHERE id = $1`, [userId]);
        return result.rows[0];
    }
    catch (err) {
        console.warn('[users.service] upsertFamilyProfile notice:', err?.message);
        return null;
    }
}
//# sourceMappingURL=users.service.js.map