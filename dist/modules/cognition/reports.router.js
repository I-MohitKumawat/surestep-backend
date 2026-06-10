"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_1 = require("../../shared/middleware/authenticate");
const requireRelationship_1 = require("../../shared/middleware/requireRelationship");
const response_1 = require("../../shared/utils/response");
const config_1 = __importDefault(require("../../db/config"));
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// ─── Family Digest ────────────────────────────────────────────────────────────
router.get('/family-digest/patient/:patientId', (0, authenticate_1.requireRoles)('FAMILY'), (0, requireRelationship_1.requireRelationship)('patientId'), (0, response_1.asyncHandler)(async (req, res) => {
    const { patientId } = req.params;
    const [state, tasks, lastAlert, recentSession] = await Promise.all([
        config_1.default.query('SELECT * FROM patient_states WHERE patient_id = $1', [patientId]),
        config_1.default.query(`SELECT status, COUNT(*) as count FROM tasks
         WHERE patient_id = $1 AND scheduled_date = CURRENT_DATE GROUP BY status`, [patientId]),
        config_1.default.query(`SELECT * FROM geofence_alerts WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 1`, [patientId]),
        config_1.default.query(`SELECT ca.* FROM cognitive_assessments ca WHERE patient_id = $1 ORDER BY period_start DESC LIMIT 1`, [patientId]),
    ]);
    const taskSummary = Object.fromEntries(tasks.rows.map((r) => [r.status.toLowerCase(), parseInt(r.count)]));
    (0, response_1.ok)(res, {
        digest: {
            patient_state: state.rows[0] ?? null,
            today_tasks: taskSummary,
            last_alert: lastAlert.rows[0] ?? null,
            latest_assessment: recentSession.rows[0] ?? null,
        },
    });
}));
// ─── Caregiver Weekly Summary ─────────────────────────────────────────────────
router.get('/caregiver-summary/patient/:patientId', (0, authenticate_1.requireRoles)('CAREGIVER'), (0, requireRelationship_1.requireRelationship)('patientId', ['CAREGIVER']), (0, response_1.asyncHandler)(async (req, res) => {
    const { patientId } = req.params;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const since = sevenDaysAgo.toISOString().split('T')[0];
    const [tasks, alerts, sessions] = await Promise.all([
        config_1.default.query(`SELECT status, COUNT(*) as count FROM tasks
         WHERE patient_id = $1 AND scheduled_date >= $2 GROUP BY status`, [patientId, since]),
        config_1.default.query(`SELECT alert_type, severity, COUNT(*) as count FROM geofence_alerts
         WHERE patient_id = $1 AND created_at >= $2 GROUP BY alert_type, severity`, [patientId, since]),
        config_1.default.query(`SELECT game_type, AVG(score) as avg_score, COUNT(*) as count
         FROM game_sessions WHERE patient_id = $1 AND played_at >= $2 GROUP BY game_type`, [patientId, since]),
    ]);
    (0, response_1.ok)(res, {
        summary: {
            period: { from: since, to: new Date().toISOString().split('T')[0] },
            task_completion: Object.fromEntries(tasks.rows.map((r) => [r.status, parseInt(r.count)])),
            alerts: alerts.rows,
            cognitive_sessions: sessions.rows,
        },
    });
}));
// ─── Clinical Export (Doctor) ─────────────────────────────────────────────────
router.get('/clinical-export/patient/:patientId', (0, authenticate_1.requireRoles)('FAMILY'), // DOCTOR role maps to FAMILY with relationship_type=DOCTOR
(0, requireRelationship_1.requireRelationship)('patientId', ['DOCTOR']), (0, response_1.asyncHandler)(async (req, res) => {
    const { patientId } = req.params;
    const [patient, assessments, sessions] = await Promise.all([
        config_1.default.query('SELECT u.*, pp.* FROM users u JOIN patient_profiles pp ON pp.user_id = u.id WHERE u.id = $1', [patientId]),
        config_1.default.query('SELECT * FROM cognitive_assessments WHERE patient_id = $1 ORDER BY period_start', [patientId]),
        config_1.default.query(`SELECT gs.*, array_agg(json_build_object('metric_type', gm.metric_type, 'value', gm.value) ORDER BY gm.recorded_at) as metrics
         FROM game_sessions gs LEFT JOIN game_metrics gm ON gm.session_id = gs.id
         WHERE gs.patient_id = $1 GROUP BY gs.id ORDER BY gs.played_at DESC LIMIT 50`, [patientId]),
    ]);
    (0, response_1.ok)(res, {
        clinical_export: {
            patient: patient.rows[0] ?? null,
            assessments: assessments.rows,
            game_sessions: sessions.rows,
            exported_at: new Date().toISOString(),
        },
    });
}));
exports.default = router;
//# sourceMappingURL=reports.router.js.map