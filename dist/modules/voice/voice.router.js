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
const ctrl = __importStar(require("./voice.controller"));
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// Voice samples
router.post('/samples/patient/:patientId', (0, authenticate_1.requireRoles)('FAMILY'), (0, requireRelationship_1.requireRelationship)('patientId'), (0, response_1.asyncHandler)(ctrl.uploadSample));
router.get('/samples/patient/:patientId', (0, requireRelationship_1.requireRelationship)('patientId'), (0, response_1.asyncHandler)(ctrl.listSamples));
router.delete('/samples/:id', (0, authenticate_1.requireRoles)('FAMILY'), (0, response_1.asyncHandler)(ctrl.removeSample));
// Voice messages
router.post('/messages/manual/patient/:patientId', (0, authenticate_1.requireRoles)('FAMILY'), (0, requireRelationship_1.requireRelationship)('patientId'), (0, response_1.asyncHandler)(ctrl.sendManualMessage));
router.get('/messages/patient/:patientId', (0, requireRelationship_1.requireRelationship)('patientId'), (0, response_1.asyncHandler)(ctrl.listMessages));
// Familiarity — Faces
router.post('/faces/patient/:patientId', (0, authenticate_1.requireRoles)('FAMILY'), (0, requireRelationship_1.requireRelationship)('patientId'), (0, response_1.asyncHandler)(ctrl.addFace));
router.get('/faces/patient/:patientId', (0, requireRelationship_1.requireRelationship)('patientId'), (0, response_1.asyncHandler)(ctrl.listFaces));
// Stories
router.post('/stories/patient/:patientId', (0, authenticate_1.requireRoles)('FAMILY'), (0, requireRelationship_1.requireRelationship)('patientId', ['FAMILY_CLOSE', 'GUARDIAN']), (0, response_1.asyncHandler)(ctrl.postStory));
router.get('/stories/patient/:patientId', (0, response_1.asyncHandler)(ctrl.listStories));
router.post('/stories/:id/react', (0, authenticate_1.requireRoles)('PATIENT'), (0, response_1.asyncHandler)(ctrl.reactStory));
// Memories
router.post('/memories/patient/:patientId', (0, authenticate_1.requireRoles)('FAMILY'), (0, requireRelationship_1.requireRelationship)('patientId'), (0, response_1.asyncHandler)(ctrl.addMemory));
router.get('/memories/patient/:patientId/daily', (0, response_1.asyncHandler)(ctrl.getDailyMemory));
exports.default = router;
//# sourceMappingURL=voice.router.js.map