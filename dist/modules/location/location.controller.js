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
exports.recordObservation = recordObservation;
exports.ping = ping;
exports.batchSync = batchSync;
exports.getCurrentLocation = getCurrentLocation;
exports.requestLocationRefresh = requestLocationRefresh;
exports.getTrail = getTrail;
exports.getCareCircleMap = getCareCircleMap;
const response_1 = require("../../shared/utils/response");
const zod_1 = require("zod");
const svc = __importStar(require("./location.service"));
const awareness_service_1 = require("../awareness/awareness.service");
const fcm_service_1 = require("../notifications/fcm.service");
const config_1 = __importDefault(require("../../db/config"));
const AppError_1 = require("../../shared/errors/AppError");
const PingSchema = zod_1.z.object({
    lat: zod_1.z.number().min(-90).max(90),
    lng: zod_1.z.number().min(-180).max(180),
    accuracy_m: zod_1.z.number().optional(),
    source: zod_1.z.enum(['PHONE', 'WEARABLE', 'GLASS', 'MANUAL']).optional(),
    speed_kmh: zod_1.z.number().optional(),
    heading: zod_1.z.number().optional(),
    battery_pct: zod_1.z.number().int().min(0).max(100).optional(),
    network_status: zod_1.z.string().optional(),
    recorded_at: zod_1.z.string().datetime(),
});
const ObservationSchema = zod_1.z.object({
    lat: zod_1.z.number().min(-90).max(90),
    lng: zod_1.z.number().min(-180).max(180),
    accuracyMeters: zod_1.z.number().positive().max(10000).optional(),
    accuracy_m: zod_1.z.number().positive().max(10000).optional(),
    altitudeMeters: zod_1.z.number().optional(),
    batteryPct: zod_1.z.number().int().min(0).max(100).optional(),
    isCharging: zod_1.z.boolean().optional(),
    recordedAt: zod_1.z.string().datetime().optional(),
    recorded_at: zod_1.z.string().datetime().optional(),
});
async function recordObservation(req, res) {
    // Identity invariant: observations are emitted by the Patient's own device.
    // A caller may never nominate another Patient's UUID.
    if (req.user.role !== 'PATIENT') {
        throw new AppError_1.AppError('OBSERVATION_SELF_ONLY', 'Location observations may only be submitted by the Patient for their own device', 403);
    }
    const patientId = req.params.patientId ?? req.user.id;
    if (patientId !== req.user.id) {
        throw new AppError_1.AppError('OBSERVATION_SELF_ONLY', 'Location observations may only be submitted for the authenticated Patient', 403);
    }
    const body = ObservationSchema.parse(req.body);
    const { authoritativeSafeZonesService } = await Promise.resolve().then(() => __importStar(require('./authoritative-safe-zones.service')));
    const result = await authoritativeSafeZonesService.ingestLocationObservation(patientId, {
        lat: body.lat,
        lng: body.lng,
        accuracyMeters: body.accuracyMeters ?? body.accuracy_m ?? 10,
        altitudeMeters: body.altitudeMeters ?? null,
        batteryPct: body.batteryPct ?? null,
        isCharging: body.isCharging ?? false,
        recordedAt: body.recordedAt ?? body.recorded_at ?? new Date().toISOString(),
    });
    (0, response_1.created)(res, result);
}
async function ping(req, res) {
    const data = PingSchema.parse(req.body);
    if (req.user.role === 'PATIENT') {
        const ping = await svc.recordPing(req.user.id, data);
        // Fire authoritative Safe Zone evaluation and awareness asynchronously
        setImmediate(async () => {
            try {
                const { authoritativeSafeZonesService } = await Promise.resolve().then(() => __importStar(require('./authoritative-safe-zones.service')));
                await authoritativeSafeZonesService.ingestLocationObservation(req.user.id, {
                    lat: data.lat,
                    lng: data.lng,
                    accuracyMeters: data.accuracy_m || 10,
                    batteryPct: data.battery_pct,
                    recordedAt: data.recorded_at,
                });
            }
            catch (e) {
                console.error('[SafeZone eval error]', e);
            }
            try {
                await (0, awareness_service_1.evaluateAwareness)(req.user.id, data.lat, data.lng, data.speed_kmh ?? 0, data.accuracy_m, // GPS confidence filter
                data.battery_pct, data.network_status);
            }
            catch (e) {
                console.error('[Awareness eval error]', e);
            }
        });
        (0, response_1.created)(res, { ping });
    }
    else {
        // Caregiver or Family
        await svc.upsertUserLocation(req.user.id, data);
        // Resolve canonically associated patients for broadcasting
        let patientIds = [];
        if (req.user.role === 'CAREGIVER') {
            const cgRes = await config_1.default.query(`SELECT DISTINCT pa.patient_id
         FROM patient_assignments pa
         JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
         JOIN care_circles c ON cr.circle_id = c.id
         WHERE cr.caregiver_id = $1
           AND pa.is_active = TRUE
           AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
           AND c.terminated_at IS NULL`, [req.user.id]);
            patientIds = cgRes.rows.map((r) => r.patient_id);
        }
        else {
            const famRes = await config_1.default.query(`SELECT DISTINCT pca.patient_id
         FROM patient_circle_associations pca
         JOIN care_circles c ON pca.circle_id = c.id
         WHERE c.terminated_at IS NULL
           AND (
             c.owner_id = $1
             OR EXISTS (
               SELECT 1 FROM care_circle_members m
               WHERE m.circle_id = c.id AND m.user_id = $1
             )
           )`, [req.user.id]);
            patientIds = famRes.rows.map((r) => r.patient_id);
        }
        try {
            const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
            for (const pid of patientIds) {
                io.to(`patient:${pid}`).emit('care-circle:location-update', {
                    patient_id: pid,
                    member: {
                        id: req.user.id,
                        role: req.user.role,
                        photo_url: req.user.photo_url ?? null,
                        name: req.user.name,
                        lat: data.lat,
                        lng: data.lng,
                        recorded_at: data.recorded_at,
                    }
                });
            }
        }
        catch (_) { }
        (0, response_1.created)(res, { success: true });
    }
}
// Batch offline sync — processes queued offline pings in chronological order
async function batchSync(req, res) {
    const pings = zod_1.z.array(PingSchema).max(200).parse(req.body);
    if (req.user.role === 'PATIENT') {
        // Sort oldest-first for correct sequential awareness evaluation
        const sorted = [...pings].sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
        const saved = [];
        for (const p of sorted) {
            const row = await svc.recordPing(req.user.id, { ...p, is_offline_sync: true });
            saved.push(row);
        }
        // Run awareness on the most recent ping only (avoids 200x DB writes)
        if (sorted.length > 0) {
            const last = sorted[sorted.length - 1];
            setImmediate(async () => {
                try {
                    await (0, awareness_service_1.evaluateAwareness)(req.user.id, last.lat, last.lng, last.speed_kmh ?? 0, last.accuracy_m, last.battery_pct, last.network_status);
                }
                catch (e) {
                    console.error('[Batch awareness eval error]', e);
                }
            });
        }
        (0, response_1.created)(res, { synced: saved.length });
    }
    else {
        // Caregiver or Family batch sync
        const sorted = [...pings].sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
        for (const p of sorted) {
            await svc.upsertUserLocation(req.user.id, p);
        }
        if (sorted.length > 0) {
            const last = sorted[sorted.length - 1];
            let patientIds = [];
            if (req.user.role === 'CAREGIVER') {
                const cgRes = await config_1.default.query(`SELECT DISTINCT pa.patient_id
           FROM patient_assignments pa
           JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
           JOIN care_circles c ON cr.circle_id = c.id
           WHERE cr.caregiver_id = $1
             AND pa.is_active = TRUE
             AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
             AND c.terminated_at IS NULL`, [req.user.id]);
                patientIds = cgRes.rows.map((r) => r.patient_id);
            }
            else {
                const famRes = await config_1.default.query(`SELECT DISTINCT pca.patient_id
           FROM patient_circle_associations pca
           JOIN care_circles c ON pca.circle_id = c.id
           WHERE c.terminated_at IS NULL
             AND (
               c.owner_id = $1
               OR EXISTS (
                 SELECT 1 FROM care_circle_members m
                 WHERE m.circle_id = c.id AND m.user_id = $1
               )
             )`, [req.user.id]);
                patientIds = famRes.rows.map((r) => r.patient_id);
            }
            try {
                const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
                for (const pid of patientIds) {
                    io.to(`patient:${pid}`).emit('care-circle:location-update', {
                        patient_id: pid,
                        member: {
                            id: req.user.id,
                            role: req.user.role,
                            photo_url: req.user.photo_url ?? null,
                            name: req.user.name,
                            lat: last.lat,
                            lng: last.lng,
                            recorded_at: last.recorded_at,
                        }
                    });
                }
            }
            catch (_) { }
        }
        (0, response_1.created)(res, { synced: sorted.length });
    }
}
async function getCurrentLocation(req, res) {
    const location = await svc.getCurrentLocation(req.params.patientId);
    (0, response_1.ok)(res, { location });
}
async function requestLocationRefresh(req, res) {
    const { patientId } = req.params;
    // 1. WebSocket trigger
    try {
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        io.to(`patient:${patientId}`).emit('location:request', { patientId });
    }
    catch (err) {
        console.warn('[location.controller] Socket emit failed:', err);
    }
    // 2. Silent FCM Push Notification trigger
    await (0, fcm_service_1.sendSilentLocationRequest)(patientId);
    (0, response_1.ok)(res, { message: 'Location refresh request dispatched' });
}
async function getTrail(req, res) {
    const { limit = '100', cursor } = req.query;
    const result = await svc.getLocationTrail(req.params.patientId, parseInt(limit), cursor);
    (0, response_1.ok)(res, result);
}
async function getCareCircleMap(req, res) {
    const result = await svc.getCareCircleMapLocations(req.params.patientId);
    (0, response_1.ok)(res, result);
}
//# sourceMappingURL=location.controller.js.map