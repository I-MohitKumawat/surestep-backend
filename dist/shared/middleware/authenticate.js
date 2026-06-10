"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRoles = exports.authenticate = void 0;
const firebase_1 = require("../../config/firebase");
const config_1 = __importDefault(require("../../db/config"));
const AppError_1 = require("../errors/AppError");
// ─── authenticate ─────────────────────────────────────────────────────────────
// Verifies Firebase ID token, resolves the row in our `users` table, and
// attaches it to req.user so every downstream handler has a typed, DB-backed user.
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            throw new AppError_1.AppError('UNAUTHORIZED', 'Missing Bearer token', 401);
        }
        const idToken = authHeader.split(' ')[1];
        let firebaseUid;
        let decodedEmail;
        let decodedPhone;
        if (idToken.startsWith('mock-dev-')) {
            const rawUid = idToken.replace('mock-dev-', '').replace('-token', '');
            const rawUserRes = await config_1.default.query('SELECT * FROM users WHERE firebase_uid = $1 AND is_active = TRUE AND deleted_at IS NULL', [rawUid]);
            if (rawUserRes.rows[0]) {
                firebaseUid = rawUid;
                decodedEmail = `${firebaseUid}@surestep.app`;
            }
            else {
                firebaseUid = idToken.replace('-token', '-uid');
                decodedEmail = `${firebaseUid}@surestep.app`;
            }
        }
        else {
            // Verify the Firebase ID token — throws if expired / invalid
            const decoded = await firebase_1.adminAuth.verifyIdToken(idToken);
            firebaseUid = decoded.uid;
            decodedEmail = decoded.email;
            decodedPhone = decoded.phone_number;
        }
        let result = await config_1.default.query('SELECT * FROM users WHERE firebase_uid = $1 AND is_active = TRUE AND deleted_at IS NULL', [firebaseUid]);
        // If not found by UID, but we have a verified phone number from Firebase, check if user exists by phone
        if (!result.rows[0] && decodedPhone) {
            const phoneResult = await config_1.default.query('SELECT * FROM users WHERE phone = $1 AND is_active = TRUE AND deleted_at IS NULL', [decodedPhone]);
            if (phoneResult.rows[0]) {
                const existingUser = phoneResult.rows[0];
                console.log(`[AuthMiddleware] Syncing firebase_uid for user ${existingUser.id} from ${existingUser.firebase_uid} to ${firebaseUid}`);
                const updateRes = await config_1.default.query('UPDATE users SET firebase_uid = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [firebaseUid, existingUser.id]);
                result = updateRes;
            }
        }
        if (!result.rows[0]) {
            if (idToken.startsWith('mock-dev-')) {
                // Auto-provision developer demo user!
                const role = idToken.includes('patient') ? 'PATIENT' : idToken.includes('caregiver') ? 'CAREGIVER' : 'FAMILY';
                const name = `Demo ${role.charAt(0) + role.slice(1).toLowerCase()}`;
                const phone = role === 'PATIENT' ? '+919999999999' : '+918888888888';
                const city = 'Bangalore'; // Same city to make testing matching city search automatic!
                console.log(`[DevBypass] Auto-provisioning mock dev user: ${name} (${role})`);
                // 1. Insert into users
                const insertUser = await config_1.default.query(`INSERT INTO users (firebase_uid, phone, name, role, city, onboarding_complete)
           VALUES ($1, $2, $3, $4, $5, TRUE)
           RETURNING *`, [firebaseUid, phone, name, role, city]);
                const newUser = insertUser.rows[0];
                // 2. Create the corresponding profile table row
                if (role === 'PATIENT') {
                    await config_1.default.query(`INSERT INTO patient_profiles (patient_user_id, emergency_contact_name, emergency_contact_phone)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`, [newUser.id, 'Emergency Friend', '+919999999900']);
                }
                else if (role === 'CAREGIVER') {
                    await config_1.default.query(`INSERT INTO caregiver_profiles (caregiver_user_id, years_of_experience, hourly_rate_inr, specializations, availability_types, discoverable)
             VALUES ($1, 5, 250, ARRAY['Dementia', 'Alzheimer''s'], ARRAY['Full-time', 'Part-time'], TRUE)
             ON CONFLICT DO NOTHING`, [newUser.id]);
                }
                result = insertUser;
            }
            else {
                // User authenticated with Firebase but hasn't completed in-app provisioning.
                // The frontend should call POST /auth/provision to create the DB row.
                throw new AppError_1.AppError('USER_NOT_PROVISIONED', 'Complete profile setup to continue.', 404);
            }
        }
        req.user = result.rows[0];
        next();
    }
    catch (err) {
        // Re-wrap Firebase token errors as UNAUTHORIZED
        if (err?.code?.startsWith?.('auth/')) {
            return next(new AppError_1.AppError('UNAUTHORIZED', 'Invalid or expired token', 401));
        }
        next(err);
    }
};
exports.authenticate = authenticate;
// ─── requireRoles ─────────────────────────────────────────────────────────────
// Role guard — call after authenticate. Rejects if user.role not in allowed list.
const requireRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            next(new AppError_1.AppError('UNAUTHORIZED', 'Authentication required', 401));
            return;
        }
        if (!roles.includes(req.user.role)) {
            next(new AppError_1.AppError('ROLE_NOT_PERMITTED', `This action requires role: ${roles.join(' or ')}`, 403));
            return;
        }
        next();
    };
};
exports.requireRoles = requireRoles;
//# sourceMappingURL=authenticate.js.map