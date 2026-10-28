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
exports.io = exports.httpServer = void 0;
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
const discovery_router_1 = __importDefault(require("./modules/discovery/discovery.router"));
const care_requests_router_1 = __importDefault(require("./modules/care-requests/care-requests.router"));
const care_relationships_router_1 = __importDefault(require("./modules/care-relationships/care-relationships.router"));
const care_circles_router_1 = __importDefault(require("./modules/care-circles/care-circles.router"));
const memories_router_1 = __importDefault(require("./modules/memories/memories.router"));
const path_1 = __importDefault(require("path"));
// ─── App Setup ────────────────────────────────────────────────────────────────
const app = (0, express_1.default)();
exports.httpServer = (0, http_1.createServer)(app);
// ─── WebSocket Server ─────────────────────────────────────────────────────────
exports.io = new socket_io_1.Server(exports.httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
});
// Patient rooms: each patient gets a room `patient:{id}`
// Caregivers/family join rooms for their linked patients on connection.
exports.io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token;
        if (!token)
            return next(new Error('UNAUTHORIZED'));
        let firebaseUid;
        if (token.startsWith('mock-dev-')) {
            firebaseUid = token.replace('mock-dev-', '').replace('-token', '');
        }
        else {
            // Verify Firebase ID token
            const decoded = await firebase_1.adminAuth.verifyIdToken(token);
            firebaseUid = decoded.uid;
        }
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
/**
 * Resolves whether a socket user is canonically authorized to access a given patient room.
 * Invariants:
 *  - Patient: can access own room (userId === patientId)
 *  - Family: must have active Care Circle membership (or ownership) in a circle coordinating the patient
 *  - Caregiver: must have an active relationship (or approved NOTICE_PERIOD) AND explicit active patient assignment
 */
async function isAuthorizedForPatientRoom(pool, userId, userRole, patientId) {
    if (userRole === 'PATIENT') {
        return userId === patientId;
    }
    if (userRole === 'CAREGIVER') {
        const cgCheck = await pool.query(`SELECT pa.id
       FROM patient_assignments pa
       JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
       JOIN care_circles c ON cr.circle_id = c.id
       WHERE cr.caregiver_id = $1
         AND pa.patient_id = $2
         AND pa.is_active = TRUE
         AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
         AND c.terminated_at IS NULL`, [userId, patientId]);
        return cgCheck.rows.length > 0;
    }
    // Family / Circle Member / Circle Owner
    const circleCheck = await pool.query(`SELECT pca.circle_id
     FROM patient_circle_associations pca
     JOIN care_circles c ON pca.circle_id = c.id
     WHERE pca.patient_id = $1 AND c.terminated_at IS NULL
       AND (
         c.owner_id = $2
         OR EXISTS (
           SELECT 1 FROM care_circle_members m
           WHERE m.circle_id = c.id AND m.user_id = $2
         )
       )`, [patientId, userId]);
    return circleCheck.rows.length > 0;
}
/**
 * Resolves all patient IDs for which a user is canonically authorized to receive real-time updates.
 */
async function getAuthorizedPatientIdsForUser(pool, userId, userRole) {
    if (userRole === 'PATIENT') {
        return [userId];
    }
    if (userRole === 'CAREGIVER') {
        const cgRes = await pool.query(`SELECT DISTINCT pa.patient_id
       FROM patient_assignments pa
       JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
       JOIN care_circles c ON cr.circle_id = c.id
       WHERE cr.caregiver_id = $1
         AND pa.is_active = TRUE
         AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
         AND c.terminated_at IS NULL`, [userId]);
        return cgRes.rows.map((r) => r.patient_id);
    }
    // Family / Member / Owner
    const circleRes = await pool.query(`SELECT DISTINCT pca.patient_id
     FROM patient_circle_associations pca
     JOIN care_circles c ON pca.circle_id = c.id
     WHERE c.terminated_at IS NULL
       AND (
         c.owner_id = $1
         OR EXISTS (
           SELECT 1 FROM care_circle_members m
           WHERE m.circle_id = c.id AND m.user_id = $1
         )
       )`, [userId]);
    return circleRes.rows.map((r) => r.patient_id);
}
exports.io.on('connection', async (socket) => {
    const userId = socket.userId;
    const userRole = socket.userRole;
    // Join user's personal room synchronously
    socket.join(`user:${userId}`);
    // Register event listeners synchronously so no early messages are dropped
    socket.on('location:request', async (data) => {
        if (data && data.patientId) {
            try {
                const { default: pool } = await Promise.resolve().then(() => __importStar(require('./db/config')));
                const isAuth = await isAuthorizedForPatientRoom(pool, userId, userRole, data.patientId);
                if (isAuth) {
                    exports.io.to(`patient:${data.patientId}`).emit('location:request', { patientId: data.patientId });
                }
                else {
                    console.warn(`[WebSocket] User ${userId} unauthorized to request location for patient:${data.patientId}`);
                }
            }
            catch (err) {
                console.error('[WebSocket] location:request error:', err);
            }
        }
    });
    socket.on('join:patient', async (patientId) => {
        if (!patientId)
            return;
        try {
            const { default: pool } = await Promise.resolve().then(() => __importStar(require('./db/config')));
            const isAuth = await isAuthorizedForPatientRoom(pool, userId, userRole, patientId);
            if (isAuth) {
                socket.join(`patient:${patientId}`);
                console.log(`[WebSocket] User ${userId} (${userRole}) authorized and joined room patient:${patientId}`);
            }
            else {
                console.warn(`[WebSocket] User ${userId} (${userRole}) UNAUTHORIZED to join room patient:${patientId}`);
                socket.emit('error:unauthorized', { message: 'Not authorized for this patient room', patientId });
            }
        }
        catch (err) {
            console.error('[WebSocket] join:patient error:', err);
        }
    });
    socket.on('disconnect', () => {
        // rooms auto-cleaned by socket.io
    });
    // Join all canonically authorized patient rooms in background
    try {
        const { default: pool } = await Promise.resolve().then(() => __importStar(require('./db/config')));
        const authorizedPatientIds = await getAuthorizedPatientIdsForUser(pool, userId, userRole);
        for (const pid of authorizedPatientIds) {
            socket.join(`patient:${pid}`);
            console.log(`[WebSocket] User ${userId} (${userRole}) auto-joined room patient:${pid}`);
        }
    }
    catch (err) {
        console.error('[WebSocket] Room join error:', err);
    }
});
// ─── Middleware ───────────────────────────────────────────────────────────────
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json({ limit: '10mb' }));
// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    // Show only the hostname — no credentials
    const rawUrl = process.env.DATABASE_URL || '';
    let dbHost = null;
    try {
        const m = rawUrl.match(/@([^/:?]+)/);
        dbHost = m ? m[1] : null;
    }
    catch { /* ignore */ }
    res.json({
        status: 'ok',
        version: '1.0.9',
        dbHost,
        region: process.env.RENDER_REGION || process.env.RENDER_SERVICE_NAME || null,
        ts: new Date().toISOString(),
    });
});
// ─── Database Health Check ────────────────────────────────────────────────────
// Safe for production — does NOT expose credentials or passwords.
// Tests DNS resolution of the external Render Postgres hostname and a live pool query.
app.get('/health/db', async (_req, res) => {
    const rawUrl = process.env.DATABASE_URL || '';
    // Extract raw hostname only (safe to log)
    let rawHost = null;
    try {
        const m = rawUrl.match(/@([^/:?]+)/);
        rawHost = m ? m[1] : null;
    }
    catch { /* ignore */ }
    const result = { rawHost };
    // 1. DNS check of the external hostname
    try {
        const dns = await Promise.resolve().then(() => __importStar(require('dns')));
        const extHost = rawHost
            ? rawHost.replace(/^(dpg-[a-z0-9]+-[a-z])$/i, '$1.singapore-postgres.render.com')
            : null;
        if (!extHost)
            throw new Error('Cannot determine hostname');
        const addr = await new Promise((resolve, reject) => {
            dns.lookup(extHost, (err, address) => {
                if (err)
                    reject(err);
                else
                    resolve(address);
            });
        });
        result.dns = { host: extHost, addr };
    }
    catch (e) {
        result.dns = { error: e.code || e.message };
    }
    // 2. Show outbound IP of this web service (what Render DB sees as connecting IP)
    try {
        const http = await Promise.resolve().then(() => __importStar(require('http')));
        const outboundIp = await new Promise((resolve, reject) => {
            const req = http.get('http://checkip.amazonaws.com', (resp) => {
                let data = '';
                resp.on('data', (chunk) => { data += chunk; });
                resp.on('end', () => resolve(data.trim()));
            });
            req.on('error', reject);
            req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
        });
        result.outboundIp = outboundIp;
    }
    catch (e) {
        result.outboundIp = { error: e.message };
    }
    // 3. TCP-only connectivity test to port 5432 (no SSL/PostgreSQL protocol)
    try {
        const net = await Promise.resolve().then(() => __importStar(require('net')));
        const extHost = (result.dns?.host) || 'dpg-d9gu3evlk1mc738ldj4g-a.singapore-postgres.render.com';
        const tcpOk = await new Promise((resolve) => {
            const sock = net.createConnection({ host: extHost, port: 5432 }, () => {
                sock.destroy();
                resolve(true);
            });
            sock.setTimeout(5000);
            sock.on('error', () => resolve(false));
            sock.on('timeout', () => { sock.destroy(); resolve(false); });
        });
        result.tcpPort5432 = { success: tcpOk };
    }
    catch (e) {
        result.tcpPort5432 = { success: false, error: e.message };
    }
    // 4. Live pool query via db/config.ts (uses fixed connection string with sslmode=require)
    try {
        const { default: pool } = await Promise.resolve().then(() => __importStar(require('./db/config')));
        const q = await pool.query('SELECT 1 AS n, NOW() AS server_ts');
        result.pool = { success: true, n: q.rows[0].n, server_ts: q.rows[0].server_ts };
    }
    catch (e) {
        result.pool = { success: false, error: e.message, code: e.code };
    }
    // 5. Fresh Client (not cached pool) — external URL + ssl object only (no sslmode in URL)
    try {
        const { Client } = await Promise.resolve().then(() => __importStar(require('pg')));
        const parsed = new URL(rawUrl.replace(/^postgresql:/, 'postgres:'));
        const fixedHost = (parsed.hostname || '').replace(/^(dpg-[a-z0-9]+-[a-z])$/i, '$1.singapore-postgres.render.com');
        const c = new Client({
            host: fixedHost,
            port: 5432,
            database: parsed.pathname.replace(/^\//, ''),
            user: decodeURIComponent(parsed.username),
            password: decodeURIComponent(parsed.password),
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 10000,
        });
        await c.connect();
        const q = await c.query('SELECT 1 AS n');
        await c.end();
        result.freshClientSsl = { success: true, n: q.rows[0].n };
    }
    catch (e) {
        result.freshClientSsl = { success: false, error: e.message, code: e.code };
    }
    // 6. Fresh Client — external URL string with sslmode=require (URL-based SSL config)
    try {
        const { Client } = await Promise.resolve().then(() => __importStar(require('pg')));
        const parsed = new URL(rawUrl.replace(/^postgresql:/, 'postgres:'));
        const fixedHost = (parsed.hostname || '').replace(/^(dpg-[a-z0-9]+-[a-z])$/i, '$1.singapore-postgres.render.com');
        parsed.hostname = fixedHost;
        parsed.port = '5432';
        let connUrl = parsed.toString().replace(/^postgres:/, 'postgresql:');
        if (connUrl.includes('sslmode=')) {
            connUrl = connUrl.replace(/sslmode=[^&]+/, 'sslmode=require');
        }
        else {
            connUrl += (connUrl.includes('?') ? '&' : '?') + 'sslmode=require';
        }
        const c = new Client({ connectionString: connUrl, connectionTimeoutMillis: 10000 });
        await c.connect();
        const q = await c.query('SELECT 1 AS n');
        await c.end();
        result.freshClientSslmodeUrl = { success: true, n: q.rows[0].n };
    }
    catch (e) {
        result.freshClientSslmodeUrl = { success: false, error: e.message, code: e.code };
    }
    res.json(result);
});
// ─── Migrations Endpoint ──────────────────────────────────────────────────────
app.get('/health/migrations', async (_req, res) => {
    try {
        const { runMigrations } = await Promise.resolve().then(() => __importStar(require('./db/migrator')));
        const result = await runMigrations();
        res.json({ success: true, ...result });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message, stack: err.stack });
    }
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
app.use(`${api}/care/discovery`, discovery_router_1.default);
app.use(`${api}/care-requests`, care_requests_router_1.default);
app.use(`${api}/care-relationships`, care_relationships_router_1.default);
app.use(`${api}/care-circles`, care_circles_router_1.default);
app.use(api, memories_router_1.default);
app.use('/uploads', express_1.default.static(path_1.default.join(process.cwd(), 'uploads')));
// ─── 404 Not Found Handler ───────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
});
// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(response_1.errorHandler);
// ─── Graceful Shutdown ────────────────────────────────────────────────────────
function setupGracefulShutdown() {
    const shutdown = async (signal) => {
        console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);
        exports.httpServer.close(async () => {
            console.log('[Server] HTTP and WebSocket server closed.');
            try {
                const { default: pool } = await Promise.resolve().then(() => __importStar(require('./db/config')));
                await pool.end();
                console.log('[Server] Database pool closed.');
            }
            catch (dbErr) {
                console.error('[Server] Error closing database pool:', dbErr?.message || dbErr);
            }
            process.exit(0);
        });
        // Force exit if graceful shutdown exceeds 10s
        setTimeout(() => {
            console.error('[Server] Graceful shutdown timed out. Forcing process exit.');
            process.exit(1);
        }, 10000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}
// ─── Start ────────────────────────────────────────────────────────────────────
if (require.main === module) {
    setupGracefulShutdown();
    const PORT = parseInt(process.env.PORT || '3000', 10);
    exports.httpServer.listen(PORT, async () => {
        console.log(`\n🚀 SureStep API running on http://localhost:${PORT}`);
        console.log(`   WebSocket server ready`);
        console.log(`   Environment: ${process.env.NODE_ENV ?? 'development'}\n`);
        // Run database migrations
        try {
            const { runMigrations } = await Promise.resolve().then(() => __importStar(require('./db/migrator')));
            const migrationRes = await runMigrations();
            console.log('[Startup] Migrations applied:', migrationRes.applied.length ? migrationRes.applied : 'none (up to date)');
        }
        catch (migErr) {
            console.error('[Startup] Migration runner error:', migErr?.message || migErr);
        }
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