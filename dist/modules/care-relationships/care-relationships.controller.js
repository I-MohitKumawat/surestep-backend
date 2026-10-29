"use strict";
/**
 * SureStep — modules/care-relationships/care-relationships.controller.ts
 *
 * Express controller handlers for Care Relationship termination & history.
 */
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
exports.endCareRelationship = endCareRelationship;
exports.getCareRelationshipHistory = getCareRelationshipHistory;
exports.createResignation = createResignation;
exports.getResignation = getResignation;
exports.getPendingResignations = getPendingResignations;
exports.acceptResignation = acceptResignation;
exports.declineResignation = declineResignation;
exports.withdrawResignation = withdrawResignation;
const zod_1 = require("zod");
const response_1 = require("../../shared/utils/response");
const AppError_1 = require("../../shared/errors/AppError");
const svc = __importStar(require("./care-relationships.service"));
const care_relationships_types_1 = require("./care-relationships.types");
const config_1 = __importDefault(require("../../db/config"));
const EndCareRelationshipSchema = zod_1.z.object({
    reason: zod_1.z.enum(care_relationships_types_1.CANONICAL_END_REASONS),
    notes: zod_1.z.string().max(500, 'Notes must not exceed 500 characters').nullable().optional(),
});
const CreateResignationSchema = zod_1.z.object({
    reason: zod_1.z.enum(care_relationships_types_1.CANONICAL_RESIGNATION_REASONS),
    notes: zod_1.z.string().max(500, 'Notes must not exceed 500 characters').nullable().optional(),
});
const DeclineResignationSchema = zod_1.z.object({
    notes: zod_1.z.string().max(500, 'Notes must not exceed 500 characters').nullable().optional(),
});
async function endCareRelationship(req, res) {
    const relationshipId = req.params.relationshipId || req.params.id;
    if (!relationshipId) {
        throw new AppError_1.AppError('VALIDATION_ERROR', 'Relationship ID is required in URL parameters', 400);
    }
    const parseResult = EndCareRelationshipSchema.safeParse(req.body);
    if (!parseResult.success) {
        const errorMsg = parseResult.error.issues.map((e) => e.message).join(', ');
        throw new AppError_1.AppError('VALIDATION_ERROR', errorMsg, 400);
    }
    const relationship = await svc.endCareRelationship(relationshipId, parseResult.data, req.user);
    (0, response_1.ok)(res, { relationship });
}
async function getCareRelationshipHistory(req, res) {
    let targetPatientId = req.query.patientId || '';
    if (!targetPatientId) {
        if (req.user.role === 'PATIENT') {
            targetPatientId = req.user.id;
        }
        else if (req.user.role === 'FAMILY') {
            const rel = await config_1.default.query(`SELECT pca.patient_id FROM care_circle_members ccm
         JOIN care_circles c ON ccm.circle_id = c.id
         JOIN patient_circle_associations pca ON pca.circle_id = c.id
         WHERE ccm.user_id = $1 AND c.terminated_at IS NULL
         UNION
         SELECT pca.patient_id FROM care_circles c
         JOIN patient_circle_associations pca ON pca.circle_id = c.id
         WHERE c.owner_id = $1 AND c.terminated_at IS NULL
         LIMIT 1`, [req.user.id]);
            if (rel.rows[0]) {
                targetPatientId = rel.rows[0].patient_id;
            }
        }
    }
    if (!targetPatientId) {
        throw new AppError_1.AppError('VALIDATION_ERROR', 'Target patientId is required to fetch care history', 400);
    }
    const history = await svc.getCareRelationshipHistory(targetPatientId, req.user);
    (0, response_1.ok)(res, { history });
}
// ─── Deprecated Phase 3B Handlers (410 GONE) ─────────────────────────────────
async function createResignation(_req, _res) {
    throw new AppError_1.AppError('INTERACTIVE_RESIGNATION_DEPRECATED', 'Interactive resignation negotiation has been replaced by the non-interactive 7-day Notice Period. Use POST /care-relationships/:id/notice.', 410);
}
async function getResignation(_req, _res) {
    throw new AppError_1.AppError('INTERACTIVE_RESIGNATION_DEPRECATED', 'Interactive resignation negotiation has been replaced by the non-interactive 7-day Notice Period. Use POST /care-relationships/:id/notice.', 410);
}
async function getPendingResignations(_req, _res) {
    throw new AppError_1.AppError('INTERACTIVE_RESIGNATION_DEPRECATED', 'Interactive resignation negotiation has been replaced by the non-interactive 7-day Notice Period.', 410);
}
async function acceptResignation(_req, _res) {
    throw new AppError_1.AppError('INTERACTIVE_RESIGNATION_DEPRECATED', 'Interactive resignation negotiation has been replaced by the non-interactive 7-day Notice Period. Use POST /care-relationships/:id/terminate for immediate departure.', 410);
}
async function declineResignation(_req, _res) {
    throw new AppError_1.AppError('INTERACTIVE_RESIGNATION_DEPRECATED', 'Interactive resignation negotiation is not supported in V1; notice periods are non-interactive.', 410);
}
async function withdrawResignation(_req, _res) {
    throw new AppError_1.AppError('INTERACTIVE_RESIGNATION_DEPRECATED', 'Interactive resignation negotiation is not supported in V1.', 410);
}
//# sourceMappingURL=care-relationships.controller.js.map