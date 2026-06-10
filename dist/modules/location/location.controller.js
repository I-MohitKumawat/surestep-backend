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
exports.ping = ping;
exports.batchSync = batchSync;
exports.getCurrentLocation = getCurrentLocation;
exports.requestLocationRefresh = requestLocationRefresh;
exports.getTrail = getTrail;
exports.listZones = listZones;
exports.createZone = createZone;
exports.updateZone = updateZone;
exports.deleteZone = deleteZone;
exports.listAlerts = listAlerts;
exports.acknowledgeAlert = acknowledgeAlert;
exports.getCareCircleMap = getCareCircleMap;
const response_1 = require("../../shared/utils/response");
const zod_1 = require("zod");
const svc = __importStar(require("./location.service"));
const awareness_service_1 = require("../awareness/awareness.service");
const fcm_service_1 = require("../notifications/fcm.service");
const config_1 = __importDefault(require("../../db/config"));
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
async function ping(req, res) {
    const data = PingSchema.parse(req.body);
    if (req.user.role === 'PATIENT') {
        const ping = await svc.recordPing(req.user.id, data);
        // Fire awareness evaluation asynchronously (don't block the ping response)
        setImmediate(async () => {
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
        // Broadcast to confirmed patients' rooms
        const rels = await config_1.default.query(`SELECT patient_user_id FROM patient_relationships
       WHERE related_user_id = $1 AND status = 'CONFIRMED'`, [req.user.id]);
        try {
            const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
            for (const rel of rels.rows) {
                io.to(`patient:${rel.patient_user_id}`).emit('care-circle:location-update', {
                    patient_id: rel.patient_user_id,
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
            const rels = await config_1.default.query(`SELECT patient_user_id FROM patient_relationships
         WHERE related_user_id = $1 AND status = 'CONFIRMED'`, [req.user.id]);
            try {
                const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
                for (const rel of rels.rows) {
                    io.to(`patient:${rel.patient_user_id}`).emit('care-circle:location-update', {
                        patient_id: rel.patient_user_id,
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
// ─── Geofence endpoints ───────────────────────────────────────────────────────
async function listZones(req, res) {
    const zones = await svc.getZones(req.params.patientId);
    (0, response_1.ok)(res, { zones });
}
async function createZone(req, res) {
    const zone = await svc.createZone(req.user.id, req.params.patientId, req.body);
    try {
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        io.to(`patient:${req.params.patientId}`).emit('geofences:change', { patientId: req.params.patientId });
    }
    catch (err) {
        console.warn('[location.controller] Socket emit for createZone failed:', err);
    }
    (0, response_1.created)(res, { zone });
}
async function updateZone(req, res) {
    const zone = await svc.updateZone(req.params.id, req.user.id, req.body);
    try {
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        io.to(`patient:${zone.patient_id}`).emit('geofences:change', { patientId: zone.patient_id });
    }
    catch (err) {
        console.warn('[location.controller] Socket emit for updateZone failed:', err);
    }
    (0, response_1.ok)(res, { zone });
}
async function deleteZone(req, res) {
    const zone = await svc.deactivateZone(req.params.id);
    try {
        const { io } = await Promise.resolve().then(() => __importStar(require('../../server')));
        io.to(`patient:${zone.patient_id}`).emit('geofences:change', { patientId: zone.patient_id });
    }
    catch (err) {
        console.warn('[location.controller] Socket emit for deleteZone failed:', err);
    }
    (0, response_1.ok)(res, { message: 'Zone deactivated' });
}
async function listAlerts(req, res) {
    const { limit = '20', cursor } = req.query;
    const result = await svc.getAlerts(req.params.patientId, parseInt(limit), cursor);
    (0, response_1.ok)(res, result);
}
async function acknowledgeAlert(req, res) {
    const alert = await svc.acknowledgeAlert(req.params.id, req.user.id);
    (0, response_1.ok)(res, { alert });
}
async function getCareCircleMap(req, res) {
    const result = await svc.getCareCircleMapLocations(req.params.patientId);
    (0, response_1.ok)(res, result);
}
//# sourceMappingURL=location.controller.js.map