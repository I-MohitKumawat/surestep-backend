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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../../shared/middleware/authenticate");
const requireRelationship_1 = require("../../shared/middleware/requireRelationship");
const response_1 = require("../../shared/utils/response");
const svc = __importStar(require("./cognition.service"));
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
router.post('/sessions', (0, authenticate_1.requireRoles)('PATIENT'), (0, response_1.asyncHandler)(async (req, res) => {
    const session = await svc.recordSession(req.user.id, req.body);
    (0, response_1.created)(res, { session });
}));
router.get('/sessions/patient/:patientId', (0, authenticate_1.requireRoles)('CAREGIVER'), (0, requireRelationship_1.requireRelationship)('patientId', ['CAREGIVER']), (0, response_1.asyncHandler)(async (req, res) => {
    const { limit = '20', cursor } = req.query;
    const result = await svc.getSessions(req.params.patientId, parseInt(limit), cursor);
    (0, response_1.ok)(res, result);
}));
router.get('/assessments/patient/:patientId', (0, requireRelationship_1.requireRelationship)('patientId', ['CAREGIVER', 'GUARDIAN', 'DOCTOR']), (0, response_1.asyncHandler)(async (req, res) => {
    const data = await svc.getAssessments(req.params.patientId);
    (0, response_1.ok)(res, data);
}));
exports.default = router;
//# sourceMappingURL=cognition.router.js.map