"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.myPatients = myPatients;
exports.myCaregivers = myCaregivers;
exports.myFamily = myFamily;
exports.searchCaregivers = searchCaregivers;
const response_1 = require("../../shared/utils/response");
const AppError_1 = require("../../shared/errors/AppError");
const svc = __importStar(require("./relationships.service"));
const config_1 = __importDefault(require("../../db/config"));
async function myPatients(req, res) {
    const patients = await svc.getMyPatients(req.user.id);
    (0, response_1.ok)(res, { patients });
}
async function myCaregivers(req, res) {
    let patientId = req.user.id;
    if (req.user.role === 'FAMILY') {
        const qPatientId = req.query.patientId;
        if (qPatientId) {
            const membership = await config_1.default.query(`SELECT pca.patient_id
         FROM patient_circle_associations pca
         JOIN care_circles c ON c.id = pca.circle_id AND c.terminated_at IS NULL
         LEFT JOIN care_circle_members m ON m.circle_id = c.id AND m.user_id = $2
         WHERE pca.patient_id = $1
           AND (c.owner_id = $2 OR m.id IS NOT NULL)
         LIMIT 1`, [qPatientId, req.user.id]);
            if (!membership.rows[0]) {
                throw new AppError_1.AppError('UNAUTHORIZED', 'You are not a member of the Circle associated with this Patient', 403);
            }
            patientId = qPatientId;
        }
        else {
            const defaultCircle = await config_1.default.query(`SELECT pca.patient_id
         FROM patient_circle_associations pca
         JOIN care_circles c ON c.id = pca.circle_id AND c.terminated_at IS NULL
         LEFT JOIN care_circle_members m ON m.circle_id = c.id AND m.user_id = $1
         WHERE c.owner_id = $1 OR m.user_id = $1
         ORDER BY pca.associated_at DESC
         LIMIT 1`, [req.user.id]);
            if (defaultCircle.rows[0])
                patientId = defaultCircle.rows[0].patient_id;
        }
    }
    const caregivers = await svc.getMyCaregivers(patientId);
    (0, response_1.ok)(res, { caregivers });
}
async function myFamily(req, res) {
    const family = await svc.getMyFamily(req.user.id, req.user.role);
    (0, response_1.ok)(res, { family });
}
async function searchCaregivers(req, res) {
    const query = req.query.query || '';
    const caregivers = await svc.searchCaregivers(req.user.id, query);
    (0, response_1.ok)(res, { caregivers });
}
//# sourceMappingURL=relationships.controller.js.map