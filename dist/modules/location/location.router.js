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
const ctrl = __importStar(require("./location.controller"));
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// Location pings
router.post('/ping', (0, authenticate_1.requireRoles)('PATIENT', 'CAREGIVER', 'FAMILY'), (0, response_1.asyncHandler)(ctrl.ping));
router.post('/pings/sync', (0, authenticate_1.requireRoles)('PATIENT', 'CAREGIVER', 'FAMILY'), (0, response_1.asyncHandler)(ctrl.batchSync));
router.get('/patient/:patientId/current', (0, requireRelationship_1.requireRelationship)('patientId'), (0, response_1.asyncHandler)(ctrl.getCurrentLocation));
router.get('/patient/:patientId/care-circle-map', (0, requireRelationship_1.requireRelationship)('patientId'), (0, response_1.asyncHandler)(ctrl.getCareCircleMap));
router.post('/patient/:patientId/refresh-request', (0, requireRelationship_1.requireRelationship)('patientId', ['CAREGIVER', 'GUARDIAN', 'FAMILY_CLOSE']), (0, response_1.asyncHandler)(ctrl.requestLocationRefresh));
router.get('/patient/:patientId/trail', (0, requireRelationship_1.requireRelationship)('patientId', ['CAREGIVER', 'GUARDIAN', 'FAMILY_CLOSE']), (0, response_1.asyncHandler)(ctrl.getTrail));
// Geofence zones
router.get('/geofences/patient/:patientId', (0, requireRelationship_1.requireRelationship)('patientId'), (0, response_1.asyncHandler)(ctrl.listZones));
router.post('/geofences/patient/:patientId', (0, requireRelationship_1.requireRelationship)('patientId', ['CAREGIVER', 'GUARDIAN']), (0, response_1.asyncHandler)(ctrl.createZone));
router.patch('/geofences/:id', (0, response_1.asyncHandler)(ctrl.updateZone));
router.delete('/geofences/:id', (0, response_1.asyncHandler)(ctrl.deleteZone));
// Geofence alerts
router.get('/geofences/alerts/patient/:patientId', (0, requireRelationship_1.requireRelationship)('patientId'), (0, response_1.asyncHandler)(ctrl.listAlerts));
router.post('/geofences/alerts/:id/acknowledge', (0, response_1.asyncHandler)(ctrl.acknowledgeAlert));
exports.default = router;
//# sourceMappingURL=location.router.js.map