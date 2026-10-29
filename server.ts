import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { adminAuth } from './config/firebase';

import { errorHandler } from './shared/utils/response';
import { syncUserSocketRooms } from './shared/realtime/socketRooms';

// ─── Route Modules ────────────────────────────────────────────────────────────
import authRouter          from './modules/auth/auth.router';
import usersRouter         from './modules/users/users.router';
import relationshipsRouter from './modules/relationships/relationships.router';
import routinesRouter      from './modules/routines/routines.router';
import locationRouter      from './modules/location/location.router';
import awarenessRouter     from './modules/awareness/awareness.router';
import voiceRouter         from './modules/voice/voice.router';
import cognitionRouter     from './modules/cognition/cognition.router';
import reportsRouter       from './modules/cognition/reports.router';
import alertsRouter        from './modules/alerts/alerts.router';
import notificationsRouter from './modules/notifications/notifications.router';
import paymentsRouter      from './modules/payments/payments.router';
import familyRouter        from './modules/family/family.router';
import mediaRouter         from './modules/media/media.router';
import assessmentRouter    from './modules/assessment/assessment.router';
import carePlanRouter      from './modules/careplan/careplan.router';
import discoveryRouter     from './modules/discovery/discovery.router';
import careRequestsRouter  from './modules/care-requests/care-requests.router';
import careRelationshipsRouter from './modules/care-relationships/care-relationships.router';
import careCirclesRouter       from './modules/care-circles/care-circles.router';
import memoriesRouter          from './modules/memories/memories.router';
import path                from 'path';

// ─── App Setup ────────────────────────────────────────────────────────────────
const app = express();
export const httpServer = createServer(app);

// ─── WebSocket Server ─────────────────────────────────────────────────────────
export const io = new SocketIOServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Patient rooms: each patient gets a room `patient:{id}`
// Caregivers/family join rooms for their linked patients on connection.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('UNAUTHORIZED'));

    let firebaseUid: string;
    if (token.startsWith('mock-dev-')) {
      firebaseUid = token.replace('mock-dev-', '').replace('-token', '');
    } else {
      // Verify Firebase ID token
      const decoded = await adminAuth.verifyIdToken(token);
      firebaseUid = decoded.uid;
    }

    const { default: pool } = await import('./db/config');
    const result = await pool.query(
      'SELECT id, role FROM users WHERE firebase_uid = $1 AND is_active = TRUE AND deleted_at IS NULL',
      [firebaseUid],
    );
    if (!result.rows[0]) return next(new Error('USER_NOT_PROVISIONED'));

    (socket as any).userId   = result.rows[0].id;
    (socket as any).userRole = result.rows[0].role;
    next();
  } catch {
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
async function isAuthorizedForPatientRoom(pool: any, userId: string, userRole: string, patientId: string): Promise<boolean> {
  if (userRole === 'PATIENT') {
    return userId === patientId;
  }

  if (userRole === 'CAREGIVER') {
    const cgCheck = await pool.query(
      `SELECT pa.id
       FROM patient_assignments pa
       JOIN caregiver_relationships cr ON pa.relationship_id = cr.id
       JOIN care_circles c ON cr.circle_id = c.id
       WHERE cr.caregiver_id = $1
         AND pa.patient_id = $2
         AND pa.is_active = TRUE
         AND cr.status IN ('ACTIVE', 'NOTICE_PERIOD')
         AND c.terminated_at IS NULL`,
      [userId, patientId]
    );
    return cgCheck.rows.length > 0;
  }

  // Family / Circle Member / Circle Owner
  const circleCheck = await pool.query(
    `SELECT pca.circle_id
     FROM patient_circle_associations pca
     JOIN care_circles c ON pca.circle_id = c.id
     WHERE pca.patient_id = $1 AND c.terminated_at IS NULL
       AND (
         c.owner_id = $2
         OR EXISTS (
           SELECT 1 FROM care_circle_members m
           WHERE m.circle_id = c.id AND m.user_id = $2
         )
       )`,
    [patientId, userId]
  );
  return circleCheck.rows.length > 0;
}

io.on('connection', async (socket) => {
  const userId   = (socket as any).userId   as string;
  const userRole = (socket as any).userRole as string;

  // Join user's personal room synchronously
  socket.join(`user:${userId}`);

  // Register event listeners synchronously so no early messages are dropped
  socket.on('location:request', async (data: { patientId: string }) => {
    if (data && data.patientId) {
      try {
        const { default: pool } = await import('./db/config');
        const isAuth = await isAuthorizedForPatientRoom(pool, userId, userRole, data.patientId);
        if (isAuth) {
          io.to(`patient:${data.patientId}`).emit('location:request', { patientId: data.patientId });
        } else {
          console.warn(`[WebSocket] User ${userId} unauthorized to request location for patient:${data.patientId}`);
        }
      } catch (err) {
        console.error('[WebSocket] location:request error:', err);
      }
    }
  });

  socket.on('join:patient', async (patientId: string) => {
    if (!patientId) return;
    try {
      const { default: pool } = await import('./db/config');
      const isAuth = await isAuthorizedForPatientRoom(pool, userId, userRole, patientId);
      if (isAuth) {
        socket.join(`patient:${patientId}`);
        console.log(`[WebSocket] User ${userId} (${userRole}) authorized and joined room patient:${patientId}`);
      } else {
        console.warn(`[WebSocket] User ${userId} (${userRole}) UNAUTHORIZED to join room patient:${patientId}`);
        socket.emit('error:unauthorized', { message: 'Not authorized for this patient room', patientId });
      }
    } catch (err) {
      console.error('[WebSocket] join:patient error:', err);
    }
  });

  socket.on('disconnect', () => {
    // rooms auto-cleaned by socket.io
  });

  // Join every canonically authorized patient and circle room in background.
  // The shared helper is also used after access changes so live sockets stay consistent.
  try {
    await syncUserSocketRooms(userId);
    console.log(`[WebSocket] User ${userId} (${userRole}) synchronized authorized rooms`);
  } catch (err) {
    console.error('[WebSocket] Room join error:', err);
  }
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  // Show only the hostname — no credentials
  const rawUrl = process.env.DATABASE_URL || '';
  let dbHost: string | null = null;
  try {
    const m = rawUrl.match(/@([^/:?]+)/);
    dbHost = m ? m[1] : null;
  } catch { /* ignore */ }

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
  let rawHost: string | null = null;
  try {
    const m = rawUrl.match(/@([^/:?]+)/);
    rawHost = m ? m[1] : null;
  } catch { /* ignore */ }

  const result: any = { rawHost };

  // 1. DNS check of the external hostname
  try {
    const dns = await import('dns');
    const extHost = rawHost
      ? rawHost.replace(/^(dpg-[a-z0-9]+-[a-z])$/i, '$1.singapore-postgres.render.com')
      : null;
    if (!extHost) throw new Error('Cannot determine hostname');
    const addr = await new Promise<string>((resolve, reject) => {
      dns.lookup(extHost, (err, address) => {
        if (err) reject(err); else resolve(address);
      });
    });
    result.dns = { host: extHost, addr };
  } catch (e: any) {
    result.dns = { error: e.code || e.message };
  }

  // 2. Show outbound IP of this web service (what Render DB sees as connecting IP)
  try {
    const http = await import('http');
    const outboundIp = await new Promise<string>((resolve, reject) => {
      const req = http.get('http://checkip.amazonaws.com', (resp) => {
        let data = '';
        resp.on('data', (chunk: string) => { data += chunk; });
        resp.on('end', () => resolve(data.trim()));
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    });
    result.outboundIp = outboundIp;
  } catch (e: any) {
    result.outboundIp = { error: e.message };
  }

  // 3. TCP-only connectivity test to port 5432 (no SSL/PostgreSQL protocol)
  try {
    const net = await import('net');
    const extHost = (result.dns?.host) || 'dpg-d9gu3evlk1mc738ldj4g-a.singapore-postgres.render.com';
    const tcpOk = await new Promise<boolean>((resolve) => {
      const sock = net.createConnection({ host: extHost, port: 5432 }, () => {
        sock.destroy();
        resolve(true);
      });
      sock.setTimeout(5000);
      sock.on('error', () => resolve(false));
      sock.on('timeout', () => { sock.destroy(); resolve(false); });
    });
    result.tcpPort5432 = { success: tcpOk };
  } catch (e: any) {
    result.tcpPort5432 = { success: false, error: e.message };
  }

  // 4. Live pool query via db/config.ts (uses fixed connection string with sslmode=require)
  try {
    const { default: pool } = await import('./db/config');
    const q = await pool.query('SELECT 1 AS n, NOW() AS server_ts');
    result.pool = { success: true, n: q.rows[0].n, server_ts: q.rows[0].server_ts };
  } catch (e: any) {
    result.pool = { success: false, error: e.message, code: e.code };
  }

  // 5. Fresh Client (not cached pool) — external URL + ssl object only (no sslmode in URL)
  try {
    const { Client } = await import('pg');
    const parsed = new URL(rawUrl.replace(/^postgresql:/, 'postgres:'));
    const fixedHost = (parsed.hostname || '').replace(
      /^(dpg-[a-z0-9]+-[a-z])$/i,
      '$1.singapore-postgres.render.com',
    );
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
  } catch (e: any) {
    result.freshClientSsl = { success: false, error: e.message, code: e.code };
  }

  // 6. Fresh Client — external URL string with sslmode=require (URL-based SSL config)
  try {
    const { Client } = await import('pg');
    const parsed = new URL(rawUrl.replace(/^postgresql:/, 'postgres:'));
    const fixedHost = (parsed.hostname || '').replace(
      /^(dpg-[a-z0-9]+-[a-z])$/i,
      '$1.singapore-postgres.render.com',
    );
    parsed.hostname = fixedHost;
    parsed.port = '5432';
    let connUrl = parsed.toString().replace(/^postgres:/, 'postgresql:');
    if (connUrl.includes('sslmode=')) {
      connUrl = connUrl.replace(/sslmode=[^&]+/, 'sslmode=require');
    } else {
      connUrl += (connUrl.includes('?') ? '&' : '?') + 'sslmode=require';
    }
    const c = new Client({ connectionString: connUrl, connectionTimeoutMillis: 10000 });
    await c.connect();
    const q = await c.query('SELECT 1 AS n');
    await c.end();
    result.freshClientSslmodeUrl = { success: true, n: q.rows[0].n };
  } catch (e: any) {
    result.freshClientSslmodeUrl = { success: false, error: e.message, code: e.code };
  }

  res.json(result);
});

// ─── Migrations Endpoint ──────────────────────────────────────────────────────
app.get('/health/migrations', async (_req, res) => {
  try {
    const { runMigrations } = await import('./db/migrator');
    const result = await runMigrations();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, stack: err.stack });
  }
});

// ─── API Routes ───────────────────────────────────────────────────────────────
const api = '/api/v1';

app.use(`${api}/auth`,          authRouter);
app.use(`${api}/users`,         usersRouter);
app.use(`${api}/profiles`,      usersRouter);
app.use(`${api}/relationships`, relationshipsRouter);
app.use(api,                    routinesRouter);
app.use(`${api}/location`,      locationRouter);
app.use(`${api}/geofences`,     locationRouter);
app.use(`${api}/awareness`,     awarenessRouter);
app.use(`${api}/voice`,         voiceRouter);
app.use(`${api}/familiarity`,   voiceRouter);
app.use(`${api}/cognition`,     cognitionRouter);
app.use(`${api}/reports`,       reportsRouter);
app.use(`${api}/threads`,       alertsRouter);
app.use(`${api}/calendar`,      alertsRouter);
app.use(`${api}/documents`,     alertsRouter);
app.use(`${api}/handovers`,     alertsRouter);
app.use(`${api}/wellbeing`,     alertsRouter);
app.use(`${api}/incidents`,     alertsRouter);
app.use(`${api}/ratings`,       alertsRouter);
app.use(`${api}/alerts`,        notificationsRouter);
app.use(`${api}/payments`,      paymentsRouter);
app.use(`${api}/family`,        familyRouter);
app.use(`${api}/media`,         mediaRouter);
app.use(`${api}/assessments`,   assessmentRouter);
app.use(`${api}/care-plans`,    carePlanRouter);
app.use(`${api}/care/discovery`, discoveryRouter);
app.use(`${api}/care-requests`,  careRequestsRouter);
app.use(`${api}/care-relationships`, careRelationshipsRouter);
app.use(`${api}/care-circles`,        careCirclesRouter);
app.use(api,                          memoriesRouter);
app.use('/uploads',             express.static(path.join(process.cwd(), 'uploads')));

// ─── 404 Not Found Handler ───────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
function setupGracefulShutdown() {
  const shutdown = async (signal: string) => {
    console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);

    httpServer.close(async () => {
      console.log('[Server] HTTP and WebSocket server closed.');

      try {
        const { default: pool } = await import('./db/config');
        await pool.end();
        console.log('[Server] Database pool closed.');
      } catch (dbErr: any) {
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
  httpServer.listen(PORT, async () => {
    console.log(`\n🚀 SureStep API running on http://localhost:${PORT}`);
    console.log(`   WebSocket server ready`);
    console.log(`   Environment: ${process.env.NODE_ENV ?? 'development'}\n`);

    // Run database migrations
    try {
      const { runMigrations } = await import('./db/migrator');
      const migrationRes = await runMigrations();
      console.log('[Startup] Migrations applied:', migrationRes.applied.length ? migrationRes.applied : 'none (up to date)');
    } catch (migErr: any) {
      console.error('[Startup] Migration runner error:', migErr?.message || migErr);
    }

    // Start Bull background job queues (non-fatal if Redis unavailable in dev)
    try {
      const { scheduleJobs } = await import('./jobs/queues');
      await scheduleJobs();
    } catch (err) {
      console.warn('[Jobs] Could not start job queues (Redis may be offline in dev):', (err as Error).message);
    }
  });
}

export default app;