"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.provision = provision;
exports.addDevice = addDevice;
exports.listDevices = listDevices;
exports.removeDevice = removeDevice;
const firebase_1 = require("../../config/firebase");
const auth_validators_1 = require("./auth.validators");
const auth_service_1 = require("./auth.service");
const response_1 = require("../../shared/utils/response");
const AppError_1 = require("../../shared/errors/AppError");
const config_1 = __importDefault(require("../../db/config"));
/**
 * POST /auth/provision
 * Called once by the frontend right after Firebase sign-in when our DB has no row.
 * Reads the Firebase ID token from the Authorization header to get firebase_uid.
 */
async function provision(req, res) {
    const body = auth_validators_1.ProvisionSchema.parse(req.body);
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        throw new AppError_1.AppError('UNAUTHORIZED', 'Missing Bearer token', 401);
    }
    const idToken = authHeader.split(' ')[1];
    let firebaseUid;
    let firebaseEmail;
    let firebasePhone;
    try {
        if (idToken.startsWith('mock-dev-')) {
            firebaseUid = idToken.replace('-token', '-uid');
            firebaseEmail = `${firebaseUid}@surestep.app`;
        }
        else {
            const decoded = await firebase_1.adminAuth.verifyIdToken(idToken);
            firebaseUid = decoded.uid;
            firebaseEmail = decoded.email;
            firebasePhone = decoded.phone_number;
        }
    }
    catch {
        throw new AppError_1.AppError('UNAUTHORIZED', 'Invalid or expired Firebase token', 401);
    }
    const user = await (0, auth_service_1.provisionUser)({
        firebaseUid,
        email: firebaseEmail,
        name: body.name,
        role: body.role,
        phone: body.phone || firebasePhone,
        preferred_language: body.preferred_language,
    });
    (0, response_1.created)(res, { user });
}
/**
 * POST /auth/devices
 * Register FCM device token. Requires authenticate middleware.
 */
async function addDevice(req, res) {
    const body = auth_validators_1.RegisterDeviceSchema.parse(req.body);
    const device = await (0, auth_service_1.registerDevice)(req.user.id, body);
    (0, response_1.created)(res, { device });
}
/**
 * GET /auth/devices
 * List registered devices for the authenticated user.
 */
async function listDevices(req, res) {
    const devices = await (0, auth_service_1.getUserDevices)(req.user.id);
    (0, response_1.ok)(res, { devices });
}
/**
 * DELETE /auth/devices/:deviceId
 * Remove a device registration.
 */
async function removeDevice(req, res) {
    await config_1.default.query('DELETE FROM device_registry WHERE id = $1 AND user_id = $2', [req.params.deviceId, req.user.id]);
    (0, response_1.ok)(res, { message: 'Device removed' });
}
//# sourceMappingURL=auth.controller.js.map