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
exports.createCareRequest = createCareRequest;
exports.getIncomingCareRequests = getIncomingCareRequests;
exports.getOutgoingCareRequests = getOutgoingCareRequests;
exports.getCareRequestById = getCareRequestById;
exports.acceptCareRequest = acceptCareRequest;
exports.declineCareRequest = declineCareRequest;
exports.withdrawCareRequest = withdrawCareRequest;
const zod_1 = require("zod");
const response_1 = require("../../shared/utils/response");
const svc = __importStar(require("./care-requests.service"));
const care_requests_types_1 = require("./care-requests.types");
const RequestIdParamSchema = zod_1.z.string().uuid({ message: 'Invalid care request ID format' });
async function createCareRequest(req, res) {
    const input = care_requests_types_1.CreateCareRequestSchema.parse(req.body);
    const result = await svc.createCareRequest(req.user, input);
    (0, response_1.created)(res, { request: result });
}
async function getIncomingCareRequests(req, res) {
    const query = care_requests_types_1.IncomingCareRequestQuerySchema.parse(req.query);
    const result = await svc.getIncomingCareRequests(req.user, query.status);
    (0, response_1.ok)(res, { requests: result });
}
async function getOutgoingCareRequests(req, res) {
    const query = care_requests_types_1.OutgoingCareRequestQuerySchema.parse(req.query);
    const result = await svc.getOutgoingCareRequests(req.user, query.patientId, query.status);
    (0, response_1.ok)(res, { requests: result });
}
async function getCareRequestById(req, res) {
    const requestId = RequestIdParamSchema.parse(req.params.id);
    const result = await svc.getCareRequestById(req.user, requestId);
    (0, response_1.ok)(res, { request: result });
}
async function acceptCareRequest(req, res) {
    const requestId = RequestIdParamSchema.parse(req.params.id);
    const result = await svc.acceptCareRequest(req.user, requestId);
    (0, response_1.ok)(res, result);
}
async function declineCareRequest(req, res) {
    const requestId = RequestIdParamSchema.parse(req.params.id);
    const input = care_requests_types_1.DeclineCareRequestSchema.parse(req.body);
    const result = await svc.declineCareRequest(req.user, requestId, input);
    (0, response_1.ok)(res, result);
}
async function withdrawCareRequest(req, res) {
    const requestId = RequestIdParamSchema.parse(req.params.id);
    const input = care_requests_types_1.WithdrawCareRequestSchema.parse(req.body);
    const result = await svc.withdrawCareRequest(req.user, requestId, input);
    (0, response_1.ok)(res, result);
}
//# sourceMappingURL=care-requests.controller.js.map