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
exports.searchCaregivers = searchCaregivers;
exports.getCaregiverProfile = getCaregiverProfile;
const zod_1 = require("zod");
const response_1 = require("../../shared/utils/response");
const AppError_1 = require("../../shared/errors/AppError");
const svc = __importStar(require("./discovery.service"));
const discovery_types_1 = require("./discovery.types");
const CaregiverIdParamSchema = zod_1.z.string().uuid({ message: 'Invalid caregiverId UUID format' });
async function searchCaregivers(req, res) {
    const queryParams = discovery_types_1.DiscoveryQuerySchema.parse(req.query);
    const result = await svc.searchCaregivers(queryParams, req.user);
    (0, response_1.ok)(res, result);
}
async function getCaregiverProfile(req, res) {
    const parseResult = CaregiverIdParamSchema.safeParse(req.params.caregiverId);
    if (!parseResult.success) {
        throw new AppError_1.AppError('VALIDATION_ERROR', parseResult.error.issues[0]?.message || 'Invalid caregiver ID', 422);
    }
    const targetPatientId = typeof req.query.targetPatientId === 'string' ? req.query.targetPatientId : undefined;
    const profile = await svc.getCaregiverProfileById(req.params.caregiverId, req.user, targetPatientId);
    (0, response_1.ok)(res, { caregiver: profile });
}
//# sourceMappingURL=discovery.controller.js.map