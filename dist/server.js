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
exports.io = void 0;
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const firebase_1 = require("./config/firebase");
const response_1 = require("./shared/utils/response");
// ─── Route Modules ────────────────────────────────────────────────────────────
const auth_router_1 = __importDefault(require("./modules/auth/auth.router"));
const users_router_1 = __importDefault(require("./modules/users/users.router"));
const relationships_router_1 = __importDefault(require("./modules/relationships/relationships.router"));
const routines_router_1 = __importDefault(require("./modules/routines/routines.router"));
const location_router_1 = __importDefault(require("./modules/location/location.router"));
const awareness_router_1 = __importDefault(require("./modules/awareness/awareness.router"));
const voice_router_1 = __importDefault(require("./modules/voice/voice.router"));
const cognition_router_1 = __importDefault(require("./modules/cognition/cognition.router"));
const reports_router_1 = __importDefault(require("./modules/cognition/reports.router"));
const alerts_router_1 = __importDefault(require("./modules/alerts/alerts.router"));
const notifications_router_1 = __importDefault(require("./modules/notifications/notifications.router"));
const payments_router_1 = __importDefault(require("./modules/payments/payments.router"));
const family_router_1 = __importDefault(require("./modules/family/family.router"));
const media_router_1 = __importDefault(require("./modules/media/media.router"));
const assessment_router_1 = __importDefault(require("./modules/assessment/assessment.router"));
const careplan_router_1 = __importDefault(require("./modules/careplan/careplan.router"));
const path_1 = __importDefault(require("path"));
// ─── App Setup ────────────────────────────────────────────────────────────────
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
// ─── WebSocket Server ─────────────────────────────────────────────────────────
exports.io = new socket_io_1.Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
});
// Patient rooms: each patient gets a room `patient:{id}`
// Caregivers/family join rooms for their linked patients on connection.
exports.io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token;
        if (!token)
            return next(new Error('UNAUTHORIZED'));
        // Verify Firebase ID token
        const decoded = await firebase_1.adminAuth.verifyIdToken(token);
        const firebaseUid = decoded.uid;
        const { default: pool } = await Promise.resolve().then(() => __importStar(require('./db/config')));
        const result = await pool.query('SELECT id, role FROM users WHERE firebase_uid = $1 AND is_active = TRUE AND deleted_at IS NULL', [firebaseUid]);
        if (!result.rows[0])
            return next(new Error('USER_NOT_PROVISIONED'));
        socket.userId = result.rows[0].id;
        socket.userRole = result.rows[0].role;
        next();
    }
    catch {
        next(new Error('UNAUTHORIZED'));
    }
});
exports.io.on('connection', async (socket) => {
    const userId = socket.userId;
    const userRole = socket.userRole;
    // Join user's personal room
    socket.join(`user:${userId}`);
    // Join all linked patient rooms
    try {
        const { default: pool } = await Promise.resolve().then(() => __importStar(require('./db/config')));
        if (userRole === 'PATIENT') {
            socket.join(`patient:${userId}`);
        }
        else {
            // Caregiver or Family: join rooms for all active patient links
            const result = await pool.query(`SELECT patient_user_id FROM patient_relationships
         WHERE related_user_id = $1 AND status::text IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`, [userId]);
            for (const row of result.rows) {
                socket.join(`patient:${row.patient_user_id}`);
                console.log(`[WebSocket] User ${userId} auto-joined room patient:${row.patient_user_id}`);
            }
        }
    }
    catch (err) {
        console.error('[WebSocket] Room join error:', err);
    }
    socket.on('location:request', (data) => {
        if (data && data.patientId) {
            exports.io.to(`patient:${data.patientId}`).emit('location:request', { patientId: data.patientId });
        }
    });
    socket.on('join:patient', async (patientId) => {
        if (!patientId)
            return;
        try {
            const { default: pool } = await Promise.resolve().then(() => __importStar(require('./db/config')));
            if (userRole === 'PATIENT' && userId === patientId) {
                socket.join(`patient:${patientId}`);
                console.log(`[WebSocket] Patient ${userId} joined room patient:${patientId}`);
            }
            else {
                const check = await pool.query(`SELECT 1 FROM patient_relationships
           WHERE patient_user_id = $1 AND related_user_id = $2 
             AND status::text IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`, [patientId, userId]);
                if (check.rows.length > 0) {
                    socket.join(`patient:${patientId}`);
                    console.log(`[WebSocket] Caregiver/Family ${userId} joined room patient:${patientId}`);
                }
                else {
                    console.warn(`[WebSocket] User ${userId} unauthorized to join room patient:${patientId}`);
                }
            }
        }
        catch (err) {
            console.error('[WebSocket] join:patient error:', err);
        }
    });
    socket.on('disconnect', () => {
        // rooms auto-cleaned by socket.io
    });
});
// ─── Middleware ───────────────────────────────────────────────────────────────
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json({ limit: '10mb' }));
// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    const dbUrl = process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@') : null;
    res.json({ status: 'ok', version: '1.0.4', dbUrl, ts: new Date().toISOString() });
});
// ─── API Routes ───────────────────────────────────────────────────────────────
const api = '/api/v1';
app.use(`${api}/auth`, auth_router_1.default);
app.use(`${api}/users`, users_router_1.default);
app.use(`${api}/profiles`, users_router_1.default);
app.use(`${api}/relationships`, relationships_router_1.default);
app.use(api, routines_router_1.default);
app.use(`${api}/location`, location_router_1.default);
app.use(`${api}/geofences`, location_router_1.default);
app.use(`${api}/awareness`, awareness_router_1.default);
app.use(`${api}/voice`, voice_router_1.default);
app.use(`${api}/familiarity`, voice_router_1.default);
app.use(`${api}/cognition`, cognition_router_1.default);
app.use(`${api}/reports`, reports_router_1.default);
app.use(`${api}/threads`, alerts_router_1.default);
app.use(`${api}/calendar`, alerts_router_1.default);
app.use(`${api}/documents`, alerts_router_1.default);
app.use(`${api}/handovers`, alerts_router_1.default);
app.use(`${api}/wellbeing`, alerts_router_1.default);
app.use(`${api}/incidents`, alerts_router_1.default);
app.use(`${api}/ratings`, alerts_router_1.default);
app.use(`${api}/alerts`, notifications_router_1.default);
app.use(`${api}/payments`, payments_router_1.default);
app.use(`${api}/family`, family_router_1.default);
app.use(`${api}/media`, media_router_1.default);
app.use(`${api}/assessments`, assessment_router_1.default);
app.use(`${api}/care-plans`, careplan_router_1.default);
app.use('/uploads', express_1.default.static(path_1.default.join(process.cwd(), 'uploads')));
// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(response_1.errorHandler);
// ─── Start ────────────────────────────────────────────────────────────────────
if (require.main === module) {
    const PORT = parseInt(process.env.PORT || '3000', 10);
    httpServer.listen(PORT, async () => {
        console.log(`\n🚀 SureStep API running on http://localhost:${PORT}`);
        console.log(`   WebSocket server ready`);
        console.log(`   Environment: ${process.env.NODE_ENV ?? 'development'}\n`);
        // Start Bull background job queues (non-fatal if Redis unavailable in dev)
        try {
            const { scheduleJobs } = await Promise.resolve().then(() => __importStar(require('./jobs/queues')));
            await scheduleJobs();
        }
        catch (err) {
            console.warn('[Jobs] Could not start job queues (Redis may be offline in dev):', err.message);
        }
    });
}
exports.default = app;
//# sourceMappingURL=server.js.map