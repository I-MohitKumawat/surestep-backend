"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.provisionUser = provisionUser;
exports.registerDevice = registerDevice;
exports.getUserDevices = getUserDevices;
const config_1 = __importDefault(require("../../db/config"));
/**
 * Creates the in-app user row after Firebase sign-in.
 * Idempotent — returns existing row if already provisioned.
 */
async function provisionUser(input) {
    const { firebaseUid, email, name, role, phone, preferred_language } = input;
    const effectiveRole = role || 'PATIENT';
    // Idempotent: return existing row if already provisioned
    const existing = await config_1.default.query('SELECT * FROM users WHERE firebase_uid = $1', [firebaseUid]);
    if (existing.rows[0])
        return existing.rows[0];
    // Phone uniqueness check (optional field)
    if (phone) {
        const phoneCheck = await config_1.default.query('SELECT * FROM users WHERE phone = $1', [phone]);
        if (phoneCheck.rows[0]) {
            const existingUser = phoneCheck.rows[0];
            console.log(`[AuthService] Linking existing phone user ${existingUser.id} to new firebase_uid ${firebaseUid}`);
            // Preserve existing role if user already has an established role; otherwise assign effectiveRole
            const targetRole = existingUser.role || effectiveRole;
            const updateResult = await config_1.default.query(`UPDATE users 
         SET firebase_uid = $1, role = $2, name = COALESCE(NULLIF(name, ''), $3), email = COALESCE(email, $4), updated_at = NOW() 
         WHERE id = $5 
         RETURNING *`, [firebaseUid, targetRole, name, email ?? null, existingUser.id]);
            const user = updateResult.rows[0];
            // Seed empty profile rows for the user's role
            if (targetRole === 'PATIENT') {
                await config_1.default.query('INSERT INTO patient_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
                await config_1.default.query('INSERT INTO patient_states (patient_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
                await config_1.default.query('INSERT INTO patient_threads (patient_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
            }
            else if (targetRole === 'CAREGIVER') {
                await config_1.default.query('INSERT INTO caregiver_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
            }
            else if (targetRole === 'FAMILY') {
                await config_1.default.query('INSERT INTO family_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
            }
            return user;
        }
    }
    const result = await config_1.default.query(`INSERT INTO users (firebase_uid, email, name, role, phone, preferred_language)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`, [firebaseUid, email ?? null, name, effectiveRole, phone ?? null, preferred_language ?? 'en']);
    const user = result.rows[0];
    // Seed empty profile rows for the user's role
    if (effectiveRole === 'PATIENT') {
        await config_1.default.query('INSERT INTO patient_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
        await config_1.default.query('INSERT INTO patient_states (patient_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
        await config_1.default.query('INSERT INTO patient_threads (patient_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
    }
    else if (effectiveRole === 'CAREGIVER') {
        await config_1.default.query('INSERT INTO caregiver_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
    }
    else if (effectiveRole === 'FAMILY') {
        await config_1.default.query('INSERT INTO family_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
    }
    return user;
}
/**
 * Registers or updates a device FCM token for push notifications.
 */
async function registerDevice(userId, data) {
    const result = await config_1.default.query(`INSERT INTO device_registry (user_id, device_type, device_token, device_name, os_version, app_version, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (user_id, device_token) DO UPDATE
       SET last_seen_at = NOW(),
           app_version  = EXCLUDED.app_version,
           os_version   = EXCLUDED.os_version
     RETURNING *`, [userId, data.device_type, data.device_token, data.device_name ?? null, data.os_version ?? null, data.app_version ?? null]);
    return result.rows[0];
}
/**
 * Lists all registered devices for a user.
 */
async function getUserDevices(userId) {
    const result = await config_1.default.query('SELECT * FROM device_registry WHERE user_id = $1 ORDER BY last_seen_at DESC', [userId]);
    return result.rows;
}
//# sourceMappingURL=auth.service.js.map