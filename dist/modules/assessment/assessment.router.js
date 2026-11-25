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
const express_1 = require("express");
const authenticate_1 = require("../../shared/middleware/authenticate");
const requireRelationship_1 = require("../../shared/middleware/requireRelationship");
const careCircleGuards_1 = require("../../shared/middleware/careCircleGuards");
const response_1 = require("../../shared/utils/response");
const AppError_1 = require("../../shared/errors/AppError");
const config_1 = __importDefault(require("../../db/config"));
const ctrl = __importStar(require("./assessment.controller"));
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
/**
 * Resolve the assessment's Patient before applying the canonical
 * resource-aware patient authorization policy. Assessment UUIDs are never
 * treated as authorization.
 */
async function requireAssessmentPatientAccess(req, _res, next) {
    try {
        const { rows } = await config_1.default.query('SELECT patient_id FROM care_assessments WHERE id = $1', [req.params.id]);
        if (!rows[0]) {
            throw new AppError_1.AppError('NOT_FOUND', 'Assessment not found', 404);
        }
        req.params.patientId = rows[0].patient_id;
        next();
    }
    catch (err) {
        next(err);
    }
}
// Save progress or submit final assessment
router.post('/patient/:patientId', (0, authenticate_1.requireRoles)('CAREGIVER'), (0, requireRelationship_1.requireRelationship)(), (0, response_1.asyncHandler)(ctrl.save));
// Get latest assessment
router.get('/patient/:patientId', (0, requireRelationship_1.requireRelationship)(), (0, response_1.asyncHandler)(ctrl.getLatest));
// Get historical versions
router.get('/patient/:patientId/history', (0, requireRelationship_1.requireRelationship)(), (0, response_1.asyncHandler)(ctrl.getHistory));
// Get specific assessment version by ID (resource-aware authorization)
router.get('/:id', requireAssessmentPatientAccess, (0, careCircleGuards_1.requireActivePatientAssignment)('patientId'), (0, response_1.asyncHandler)(ctrl.getById));
exports.default = router;
//# sourceMappingURL=assessment.router.js.map