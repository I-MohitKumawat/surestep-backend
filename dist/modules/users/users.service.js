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
exports.deleteAccount = deleteAccount;
exports.changePhoneNumber = changePhoneNumber;
const config_1 = __importDefault(require("../../db/config"));
const firebase_1 = require("../../config/firebase");
const AppError_1 = require("../../shared/errors/AppError");
const socketRooms_1 = require("../../shared/realtime/socketRooms");
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
        // Check active canonical relationships
        const relResult = await config_1.default.query(`SELECT 
         pa.id,
         pa.patient_id as patient_user_id,
         cr.caregiver_id as related_user_id,
         'CAREGIVER' as relationship_type,
         cr.status,
         pu.name AS patient_name,
         cu.name AS related_name
       FROM patient_assignments pa
       JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
       JOIN users pu ON pu.id = pa.patient_id
       JOIN users cu ON cu.id = cr.caregiver_id
       WHERE (pa.patient_id = $1 OR cr.caregiver_id = $1)
         AND pa.is_active = TRUE
         AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
       UNION
       SELECT 
         ccm.id,
         pca.patient_id as patient_user_id,
         ccm.user_id as related_user_id,
         COALESCE(ccm.role_in_circle, 'Circle Member') as relationship_type,
         'ACTIVE' as status,
         pu.name AS patient_name,
         mu.name AS related_name
       FROM patient_circle_associations pca
       JOIN care_circles c ON pca.circle_id = c.id
       JOIN care_circle_members ccm ON ccm.circle_id = c.id
       JOIN users pu ON pu.id = pca.patient_id
       JOIN users mu ON mu.id = ccm.user_id
       WHERE (pca.patient_id = $1 OR ccm.user_id = $1)
         AND c.terminated_at IS NULL
       UNION
       SELECT 
         c.id,
         pca.patient_id as patient_user_id,
         c.owner_id as related_user_id,
         'Owner' as relationship_type,
         'ACTIVE' as status,
         pu.name AS patient_name,
         ou.name AS related_name
       FROM patient_circle_associations pca
       JOIN care_circles c ON pca.circle_id = c.id
       JOIN users pu ON pu.id = pca.patient_id
       JOIN users ou ON ou.id = c.owner_id
       WHERE (pca.patient_id = $1 OR c.owner_id = $1)
         AND c.terminated_at IS NULL`, [userId]);
        relationships = relResult.rows || [];
    }
    catch (err) {
        console.error('[getMe] Error checking canonical relationships:', err);
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
    const cleanPhone = data.emergency_contact_phone !== undefined
        ? (data.emergency_contact_phone || '').trim()
        : undefined;
    // If user personal identity fields are provided, update the users table
    const userUpdates = [];
    const userParams = [];
    let pIdx = 1;
    if (data.name !== undefined) {
        userUpdates.push(`name = $${pIdx++}`);
        userParams.push(data.name);
    }
    if (data.date_of_birth !== undefined) {
        userUpdates.push(`date_of_birth = $${pIdx++}`);
        userParams.push(data.date_of_birth);
    }
    if (data.gender !== undefined) {
        userUpdates.push(`gender = $${pIdx++}`);
        userParams.push(data.gender);
    }
    if (data.preferred_language !== undefined) {
        userUpdates.push(`preferred_language = $${pIdx++}`);
        userParams.push(data.preferred_language);
    }
    if (data.city !== undefined || data.location !== undefined) {
        userUpdates.push(`city = $${pIdx++}`);
        userParams.push(data.city ?? data.location);
    }
    if (userUpdates.length > 0) {
        userParams.push(userId);
        await config_1.default.query(`UPDATE users SET ${userUpdates.join(', ')}, updated_at = NOW() WHERE id = $${pIdx}`, userParams);
    }
    const existingRes = await config_1.default.query('SELECT * FROM patient_profiles WHERE user_id = $1', [userId]);
    const existing = existingRes.rows[0];
    const emergName = data.emergency_contact_name !== undefined ? data.emergency_contact_name : (existing?.emergency_contact_name ?? null);
    const emergPhone = cleanPhone !== undefined ? cleanPhone : (existing?.emergency_contact_phone ?? null);
    const emergRel = data.emergency_contact_relation !== undefined ? data.emergency_contact_relation : (existing?.emergency_contact_relation ?? null);
    const diagnosis = data.diagnosis !== undefined ? data.diagnosis : (existing?.diagnosis ?? null);
    const diagnosisDate = data.diagnosis_date !== undefined ? data.diagnosis_date : (existing?.diagnosis_date ?? null);
    const severityLevel = data.severity_level !== undefined ? data.severity_level : (existing?.severity_level ?? null);
    const livingArrangement = data.living_arrangement !== undefined ? data.living_arrangement : (existing?.living_arrangement ?? null);
    const careNeeds = data.care_needs !== undefined ? data.care_needs : (existing?.care_needs ?? []);
    const safetyConcerns = data.safety_concerns !== undefined ? data.safety_concerns : (existing?.safety_concerns ?? []);
    const commPrefs = data.communication_preferences !== undefined ? data.communication_preferences : (existing?.communication_preferences ?? []);
    const otherConds = data.other_conditions !== undefined ? data.other_conditions : (existing?.other_conditions ?? []);
    const onboardingSource = data.onboarding_source !== undefined ? data.onboarding_source : (existing?.onboarding_source ?? 'SELF');
    const medications = data.medications !== undefined
        ? JSON.stringify(data.medications)
        : (existing?.medications ? (typeof existing.medications === 'string' ? existing.medications : JSON.stringify(existing.medications)) : '[]');
    const knownTriggers = data.known_triggers !== undefined ? data.known_triggers : (existing?.known_triggers ?? []);
    const comfortItems = data.comfort_items !== undefined ? data.comfort_items : (existing?.comfort_items ?? []);
    const favouriteSongs = data.favourite_songs !== undefined
        ? JSON.stringify(data.favourite_songs)
        : (existing?.favourite_songs ? (typeof existing.favourite_songs === 'string' ? existing.favourite_songs : JSON.stringify(existing.favourite_songs)) : '[]');
    const cogDate = data.cognitive_baseline_date !== undefined ? data.cognitive_baseline_date : (existing?.cognitive_baseline_date ?? null);
    const nimhansId = data.nimhans_patient_id !== undefined ? data.nimhans_patient_id : (existing?.nimhans_patient_id ?? null);
    await config_1.default.query(`INSERT INTO patient_profiles (
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
       emergency_contact_status   = COALESCE(EXCLUDED.emergency_contact_status, patient_profiles.emergency_contact_status),
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
        emergName,
        emergPhone,
        emergRel,
        existing?.emergency_contact_user_id ?? null,
        existing?.emergency_contact_status ?? 'UNLINKED',
        diagnosis,
        diagnosisDate,
        severityLevel,
        livingArrangement,
        careNeeds,
        safetyConcerns,
        commPrefs,
        otherConds,
        onboardingSource,
        medications,
        knownTriggers,
        comfortItems,
        favouriteSongs,
        cogDate,
        nimhansId,
    ]);
    const fullProfile = await getPatientProfile(userId);
    // Validate the 12 required fields before marking onboarding complete per Workflow 02 §2
    const isFieldValid = (val) => {
        if (val === null || val === undefined)
            return false;
        if (typeof val === 'string')
            return val.trim().length > 0;
        if (Array.isArray(val))
            return val.length > 0;
        return true;
    };
    const hasName = isFieldValid(fullProfile.name);
    const hasDob = isFieldValid(fullProfile.date_of_birth);
    const hasGender = isFieldValid(fullProfile.gender);
    const hasLang = isFieldValid(fullProfile.preferred_language);
    const hasLocation = isFieldValid(fullProfile.city);
    const hasLiving = isFieldValid(fullProfile.living_arrangement);
    const hasSeverity = isFieldValid(fullProfile.severity_level);
    const hasCareNeeds = isFieldValid(fullProfile.care_needs);
    const hasSafety = isFieldValid(fullProfile.safety_concerns);
    const hasEmergName = isFieldValid(fullProfile.emergency_contact_name);
    const hasEmergPhone = isFieldValid(fullProfile.emergency_contact_phone);
    const hasEmergRel = isFieldValid(fullProfile.emergency_contact_relation);
    const isComplete = hasName && hasDob && hasGender && hasLang && hasLocation &&
        hasLiving && hasSeverity && hasCareNeeds && hasSafety &&
        hasEmergName && hasEmergPhone && hasEmergRel;
    if (isComplete) {
        await config_1.default.query(`UPDATE users SET onboarding_complete = TRUE, updated_at = NOW() WHERE id = $1`, [userId]);
    }
    return {
        ...fullProfile,
        onboarding_complete: isComplete,
    };
}
async function getPatientProfile(patientId) {
    const result = await config_1.default.query(`SELECT pp.*, u.name, u.photo_url, u.city, u.preferred_language, u.date_of_birth, u.gender
     FROM users u
     LEFT JOIN patient_profiles pp ON pp.user_id = u.id
     WHERE u.id = $1`, [patientId]);
    if (!result.rows[0])
        throw new AppError_1.AppError('NOT_FOUND', 'Patient user not found', 404);
    const row = result.rows[0];
    return {
        user_id: patientId,
        name: row.name || '',
        photo_url: row.photo_url || null,
        city: row.city || '',
        preferred_language: row.preferred_language || 'English',
        date_of_birth: row.date_of_birth ? String(row.date_of_birth).split('T')[0] : null,
        gender: row.gender || '',
        emergency_contact_name: row.emergency_contact_name || '',
        emergency_contact_phone: row.emergency_contact_phone || '',
        emergency_contact_relation: row.emergency_contact_relation || '',
        diagnosis: row.diagnosis || '',
        diagnosis_date: row.diagnosis_date ? String(row.diagnosis_date).split('T')[0] : null,
        severity_level: row.severity_level || '',
        living_arrangement: row.living_arrangement || '',
        care_needs: row.care_needs || [],
        safety_concerns: row.safety_concerns || [],
        communication_preferences: row.communication_preferences || [],
        other_conditions: row.other_conditions || [],
        onboarding_source: row.onboarding_source || 'SELF',
        medications: typeof row.medications === 'string' ? JSON.parse(row.medications) : (row.medications || []),
        known_triggers: row.known_triggers || [],
        comfort_items: row.comfort_items || [],
        favourite_songs: typeof row.favourite_songs === 'string' ? JSON.parse(row.favourite_songs) : (row.favourite_songs || []),
        cognitive_baseline_date: row.cognitive_baseline_date || null,
        nimhans_patient_id: row.nimhans_patient_id || null,
        updated_at: row.updated_at || new Date().toISOString(),
    };
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
async function getCaregiverProfile(caregiverId, requestingUserId) {
    const isSelf = !!(requestingUserId && requestingUserId === caregiverId);
    const result = await config_1.default.query(`SELECT cp.*, u.name, u.photo_url, u.city, u.preferred_language
     FROM caregiver_profiles cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.user_id = $1
       AND u.is_active = TRUE
       AND u.deleted_at IS NULL
       ${isSelf ? '' : 'AND cp.is_discoverable = TRUE'}`, [caregiverId]);
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
// ─── Account Deletion (01-IDENTITY.md §6, 11-ACCOUNT-AND-SETTINGS.md §11) ──────
async function deleteAccount(userId) {
    const client = await config_1.default.connect();
    try {
        await client.query('BEGIN');
        // 1. Fetch user
        const userRes = await client.query('SELECT id, role, phone, email, firebase_uid, is_active FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const user = userRes.rows[0];
        if (!user || !user.is_active) {
            throw new AppError_1.AppError('USER_NOT_FOUND', 'Active user not found', 404);
        }
        // 2. Check if user owns an active Care Circle
        const ownedCircles = await client.query('SELECT id, name FROM care_circles WHERE owner_id = $1 AND terminated_at IS NULL', [userId]);
        if (ownedCircles.rows.length > 0) {
            throw new AppError_1.AppError('CANNOT_DELETE_CIRCLE_OWNER', `Cannot delete account while you own active Care Circle(s) (${ownedCircles.rows.map((r) => r.name).join(', ')}). You must transfer ownership or terminate the Circle first.`, 400);
        }
        // 3. Resolve Caregiver relationships and assignments
        await client.query(`UPDATE caregiver_relationships
       SET status = 'TERMINATED', ended_at = NOW(), termination_reason = 'ACCOUNT_DELETED'
       WHERE caregiver_id = $1 AND status != 'TERMINATED'`, [userId]);
        await client.query(`UPDATE patient_assignments
       SET is_active = FALSE
       WHERE relationship_id IN (SELECT id FROM caregiver_relationships WHERE caregiver_id = $1)`, [userId]);
        // 4. Resolve Patient dependencies
        let affectedCircleIds = [];
        if (user.role === 'PATIENT') {
            const associatedCircles = await client.query('SELECT circle_id FROM patient_circle_associations WHERE patient_id = $1', [userId]);
            affectedCircleIds = associatedCircles.rows.map((row) => row.circle_id);
            await client.query(`UPDATE patient_assignments SET is_active = FALSE WHERE patient_id = $1`, [userId]);
            await client.query(`DELETE FROM safe_zone_monitors WHERE patient_id = $1`, [userId]);
            if (affectedCircleIds.length > 0) {
                // Deactivate zones that no longer monitor any Patient, retaining configuration.
                await client.query(`UPDATE safe_zones z
           SET is_active = FALSE, updated_at = NOW()
           WHERE z.circle_id = ANY($1::uuid[])
             AND z.is_active = TRUE
             AND NOT EXISTS (
               SELECT 1 FROM safe_zone_monitors szm WHERE szm.safe_zone_id = z.id
             )`, [affectedCircleIds]);
            }
            await client.query(`DELETE FROM patient_circle_associations WHERE patient_id = $1`, [userId]);
            await client.query(`UPDATE care_requests SET status = 'WITHDRAWN', updated_at = NOW() WHERE patient_id = $1 AND status = 'PENDING'`, [userId]);
        }
        // Pending requests initiated by this account are withdrawn; requests where this
        // account is the requested caregiver are declined because the caregiver is unavailable.
        await client.query(`UPDATE care_requests SET status = 'WITHDRAWN', updated_at = NOW() WHERE requester_id = $1 AND status = 'PENDING'`, [userId]);
        await client.query(`UPDATE care_requests SET status = 'DECLINED', updated_at = NOW() WHERE caregiver_id = $1 AND status = 'PENDING'`, [userId]);
        // 5. Clean up circle memberships and permissions for non-owner
        const memberships = await client.query(`SELECT id FROM care_circle_members WHERE user_id = $1`, [userId]);
        for (const m of memberships.rows) {
            await client.query(`DELETE FROM circle_permissions WHERE member_id = $1`, [m.id]);
        }
        await client.query(`DELETE FROM care_circle_members WHERE user_id = $1`, [userId]);
        // Clean up circle invitations / join requests
        await client.query(`UPDATE circle_join_requests SET status = 'REJECTED', reviewed_at = NOW() WHERE user_id = $1 AND status = 'PENDING'`, [userId]);
        await client.query(`UPDATE circle_invitations SET status = 'REVOKED' WHERE created_by = $1 AND status = 'ACTIVE'`, [userId]);
        // 6. Invalidate sessions and registered devices
        await client.query(`DELETE FROM device_registry WHERE user_id = $1`, [userId]);
        // 7. Remove profiles and state tables. Failures here must abort the transaction
        // rather than leave a partially deleted account.
        await client.query(`DELETE FROM patient_states WHERE patient_id = $1`, [userId]);
        await client.query(`DELETE FROM patient_threads WHERE patient_id = $1`, [userId]);
        await client.query(`DELETE FROM patient_profiles WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM caregiver_profiles WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM family_profiles WHERE user_id = $1`, [userId]);
        // 8. Tombstone user to preserve audit integrity while revoking credentials and unblocking re-registration
        const delPrefix = 'DEL_' + String(userId).replace(/-/g, '').slice(0, 16);
        await client.query(`UPDATE users
       SET is_active = FALSE,
           deleted_at = NOW(),
           name = 'Deleted User',
           phone = $2,
           firebase_uid = $3,
           email = NULL,
           photo_url = NULL,
           updated_at = NOW()
       WHERE id = $1`, [userId, delPrefix, delPrefix]);
        await client.query('COMMIT');
        // 9. Live sockets for the deleted account are terminated, and remaining Circle
        // participants are resynchronized if a Patient's access was removed.
        await (0, socketRooms_1.disconnectUserSockets)(userId);
        for (const circleId of new Set(affectedCircleIds)) {
            await (0, socketRooms_1.syncCircleSocketRooms)(circleId);
        }
        // 10. Remove from Firebase Auth to permit clean phone re-registration
        if (user.firebase_uid && !user.firebase_uid.startsWith('mock-') && !user.firebase_uid.startsWith('DEL_')) {
            try {
                await firebase_1.adminAuth.deleteUser(user.firebase_uid);
                console.log(`[deleteAccount] Deleted Firebase Auth user ${user.firebase_uid}`);
            }
            catch (fbErr) {
                console.warn(`[deleteAccount] Firebase Auth user delete notice:`, fbErr?.message);
            }
        }
        return { success: true, message: 'Account deleted successfully' };
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
// ─── Phone Number Change (01-IDENTITY.md §5) ──────────────────────────────────
async function changePhoneNumber(userId, newPhone, newPhoneToken) {
    const cleanPhone = (newPhone || '').trim();
    if (!cleanPhone || cleanPhone.length < 8) {
        throw new AppError_1.AppError('VALIDATION_ERROR', 'A valid phone number is required', 400);
    }
    let verifiedPhone = cleanPhone;
    let newFirebaseUid;
    if (newPhoneToken) {
        try {
            if (newPhoneToken.startsWith('mock-dev-')) {
                verifiedPhone = cleanPhone;
            }
            else {
                const decoded = await firebase_1.adminAuth.verifyIdToken(newPhoneToken);
                if (decoded.phone_number) {
                    verifiedPhone = decoded.phone_number;
                }
                newFirebaseUid = decoded.uid;
            }
        }
        catch {
            throw new AppError_1.AppError('UNAUTHORIZED', 'Invalid or expired phone verification token', 401);
        }
    }
    const client = await config_1.default.connect();
    try {
        await client.query('BEGIN');
        // Check user exists and is active
        const userRes = await client.query('SELECT id, phone FROM users WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL FOR UPDATE', [userId]);
        if (!userRes.rows[0]) {
            throw new AppError_1.AppError('USER_NOT_FOUND', 'Active user not found', 404);
        }
        if (userRes.rows[0].phone === verifiedPhone) {
            throw new AppError_1.AppError('VALIDATION_ERROR', 'New phone number must be different from current phone number', 400);
        }
        // Check if new phone already belongs to another active account
        const conflictRes = await client.query('SELECT id FROM users WHERE phone = $1 AND id != $2 AND is_active = TRUE AND deleted_at IS NULL', [verifiedPhone, userId]);
        if (conflictRes.rows.length > 0) {
            throw new AppError_1.AppError('PHONE_ALREADY_EXISTS', 'This phone number already belongs to another SureStep account', 409);
        }
        // Atomically update phone number
        const updateRes = await client.query(`UPDATE users
       SET phone = $1,
           firebase_uid = COALESCE($2, firebase_uid),
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, name, phone, email, role, preferred_language, is_active, onboarding_complete`, [verifiedPhone, newFirebaseUid || null, userId]);
        await client.query('COMMIT');
        return updateRes.rows[0];
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
//# sourceMappingURL=users.service.js.map