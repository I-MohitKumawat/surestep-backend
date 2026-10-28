"use strict";
/**
 * Bull Job Queue — Background Workers
 *
 * Jobs:
 *  1. dailyOrientationCheck  — fires at 7:00am IST for each patient
 *  2. routineStateSweep      — every 15 min: marks BEHIND / MISSED_CRITICAL tasks
 *  3. weeklyReportGeneration — every Sunday night: builds cognitive_assessments rows
 *  4. noSignalEscalation     — every 5 min: escalates patients with NO_SIGNAL > 15 min
 */
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
exports.careRequestExpiryQueue = exports.reminderSweepQueue = exports.noSignalQueue = exports.weeklyReportQueue = exports.routineSweepQueue = exports.orientationQueue = void 0;
exports.scheduleJobs = scheduleJobs;
exports.queueOrientationForPatient = queueOrientationForPatient;
const bull_1 = __importDefault(require("bull"));
const config_1 = __importDefault(require("../db/config"));
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const opts = { redis: REDIS_URL };
// ─── Queue Definitions ────────────────────────────────────────────────────────
exports.orientationQueue = new bull_1.default('daily-orientation', opts);
exports.routineSweepQueue = new bull_1.default('routine-sweep', opts);
exports.weeklyReportQueue = new bull_1.default('weekly-report', opts);
exports.noSignalQueue = new bull_1.default('no-signal-escalation', opts);
exports.reminderSweepQueue = new bull_1.default('reminder-sweep', opts);
exports.careRequestExpiryQueue = new bull_1.default('care-request-expiry', opts);
// ─── Processors ───────────────────────────────────────────────────────────────
/** Daily orientation: queue a SCHEDULED voice message for each active patient */
exports.orientationQueue.process(async (job) => {
    const { patientId } = job.data;
    console.log(`[orientation] Processing patient ${patientId}`);
    // Check: hasn't had orientation today yet
    const today = new Date().toISOString().split('T')[0];
    const alreadySent = await config_1.default.query(`SELECT id FROM voice_messages
     WHERE patient_id = $1 AND trigger_type = 'SCHEDULED'
       AND created_at::date = $2 LIMIT 1`, [patientId, today]);
    if (alreadySent.rows[0])
        return { skipped: true };
    // Fetch patient name for script
    const user = await config_1.default.query('SELECT name, preferred_language FROM users WHERE id = $1', [patientId]);
    if (!user.rows[0])
        return;
    const { name, preferred_language: lang } = user.rows[0];
    const now = new Date();
    const day = now.toLocaleDateString('en-IN', { weekday: 'long' });
    const date = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const script = `Good morning ${name}! Today is ${day}, ${date}. Hope you have a wonderful day ahead.`;
    await config_1.default.query(`INSERT INTO voice_messages (patient_id, trigger_type, script, status)
     VALUES ($1, 'SCHEDULED', $2, 'QUEUED')`, [patientId, script]);
    return { queued: true };
});
/** Routine sweep decommissioned: Task mutation and legacy alert insertion prohibited in V1 */
exports.routineSweepQueue.process(async (_job) => {
    return { decommissioned: true };
});
/** Weekly report decommissioned: Cognitive assessment background generation prohibited in V1 */
exports.weeklyReportQueue.process(async (_job) => {
    return { decommissioned: true };
});
/** NO_SIGNAL escalation decommissioned: Geofence alert generation prohibited in V1 */
exports.noSignalQueue.process(async (_job) => {
    return { decommissioned: true };
});
/** Reminder sweep decommissioned: Active/snoozed reminder state manipulation and automated multi-tier escalation prohibited in V1 */
exports.reminderSweepQueue.process(async (_job) => {
    return { decommissioned: true };
});
/** Care Request Expiry sweep: marks expired PENDING requests and notifies requesters every 15 min */
exports.careRequestExpiryQueue.process(async (_job) => {
    try {
        const { sweepExpiredCareRequests } = await Promise.resolve().then(() => __importStar(require('../modules/care-requests/care-requests.service')));
        const expiredCount = await sweepExpiredCareRequests();
        if (expiredCount > 0) {
            console.log(`[careRequestExpiryQueue] Automatically expired ${expiredCount} care requests`);
        }
        return { expiredCount };
    }
    catch (err) {
        console.error('[careRequestExpiryQueue] Failed in care request expiry sweep:', err);
        throw err;
    }
});
// ─── Schedule Jobs ────────────────────────────────────────────────────────────
async function scheduleJobs() {
    // Clear legacy repeatable jobs first
    await Promise.all([
        exports.routineSweepQueue.removeRepeatable({ cron: '*/15 * * * *', tz: 'Asia/Kolkata' }),
        exports.weeklyReportQueue.removeRepeatable({ cron: '0 23 * * 0', tz: 'Asia/Kolkata' }),
        exports.noSignalQueue.removeRepeatable({ cron: '*/5 * * * *', tz: 'Asia/Kolkata' }),
        exports.reminderSweepQueue.removeRepeatable({ cron: '* * * * *', tz: 'Asia/Kolkata' }),
        exports.careRequestExpiryQueue.removeRepeatable({ cron: '*/15 * * * *', tz: 'Asia/Kolkata' }),
    ]).catch(() => { });
    // In V1 authoritative architecture: only careRequestExpiryQueue is scheduled (Workflow 05 §4 48h expiration)
    await exports.careRequestExpiryQueue.add({}, {
        repeat: { cron: '*/15 * * * *', tz: 'Asia/Kolkata' },
        jobId: 'care-request-expiry-repeat',
    });
    console.log('[Jobs] Canonical background job queues scheduled (care request expiry sweep only)');
}
/**
 * Queue morning orientation for a specific patient.
 * Called by the awareness engine on first app open of the day.
 */
async function queueOrientationForPatient(patientId) {
    await exports.orientationQueue.add({ patientId }, {
        jobId: `orientation:${patientId}:${new Date().toISOString().split('T')[0]}`,
        removeOnComplete: true,
        removeOnFail: false,
    });
}
// Error handlers
exports.orientationQueue.on('failed', (job, err) => console.error(`[orientation:failed] ${job.id}`, err));
exports.routineSweepQueue.on('failed', (job, err) => console.error(`[routineSweep:failed] ${job.id}`, err));
exports.weeklyReportQueue.on('failed', (job, err) => console.error(`[weeklyReport:failed] ${job.id}`, err));
exports.noSignalQueue.on('failed', (job, err) => console.error(`[noSignal:failed] ${job.id}`, err));
exports.reminderSweepQueue.on('failed', (job, err) => console.error(`[reminderSweep:failed] ${job.id}`, err));
//# sourceMappingURL=queues.js.map