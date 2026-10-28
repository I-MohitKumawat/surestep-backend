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
const ctrl = __importStar(require("./users.controller"));
const router = (0, express_1.Router)();
// All routes require authentication
router.use(authenticate_1.authenticate);
// Own user
router.get('/me', (0, response_1.asyncHandler)(ctrl.getMe));
router.patch('/me', (0, response_1.asyncHandler)(ctrl.updateMe));
router.delete('/me', (0, response_1.asyncHandler)(ctrl.deleteMe));
router.post('/change-phone', (0, response_1.asyncHandler)(ctrl.changePhone));
// Patient profile
router.put('/patient', (0, response_1.asyncHandler)(ctrl.upsertPatientProfile));
router.get('/patient/:id', (0, requireRelationship_1.requireRelationship)('id'), (0, response_1.asyncHandler)(ctrl.getPatientProfile));
// Caregiver profile (public fields available, full profile requires relationship)
router.put('/caregiver', (0, response_1.asyncHandler)(ctrl.upsertCaregiverProfile));
router.get('/caregiver/:id', (0, response_1.asyncHandler)(ctrl.getCaregiverProfile));
// Family profile
router.put('/family', (0, response_1.asyncHandler)(ctrl.upsertFamilyProfile));
exports.default = router;
//# sourceMappingURL=users.router.js.map