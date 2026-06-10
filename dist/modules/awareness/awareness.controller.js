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
exports.getPatientState = getPatientState;
exports.getAllStates = getAllStates;
exports.sos = sos;
exports.updateEngagement = updateEngagement;
const response_1 = require("../../shared/utils/response");
const svc = __importStar(require("./awareness.service"));
async function getPatientState(req, res) {
    const state = await svc.getPatientState(req.params.patientId);
    (0, response_1.ok)(res, { state });
}
async function getAllStates(req, res) {
    const states = await svc.getAllPatientStates(req.user.id);
    (0, response_1.ok)(res, { states });
}
async function sos(req, res) {
    await svc.triggerSOS(req.user.id);
    (0, response_1.ok)(res, { message: 'SOS triggered. Emergency services notified.' });
}
async function updateEngagement(req, res) {
    const { state } = req.body;
    await svc.updateEngagement(req.user.id, state ?? 'ACTIVE');
    (0, response_1.ok)(res, { message: 'Engagement updated' });
}
//# sourceMappingURL=awareness.controller.js.map