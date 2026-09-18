import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { adminAuth } from './config/firebase';

import { errorHandler } from './shared/utils/response';

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
import path                from 'path';

// ─── App Setup ────────────────────────────────────────────────────────────────
const app = express();
const httpServer = createServer(app);

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

    // Verify Firebase ID token
    const decoded = await adminAuth.verifyIdToken(token);
    const firebaseUid = decoded.uid;

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

io.on('connection', async (socket) => {
  const userId   = (socket as any).userId   as string;
  const userRole = (socket as any).userRole as string;

  // Join user's personal room
  socket.join(`user:${userId}`);

  // Join all linked patient rooms
  try {
    const { default: pool } = await import('./db/config');

    if (userRole === 'PATIENT') {
      socket.join(`patient:${userId}`);
    } else {
      // Caregiver or Family: join rooms for all active patient links
      const result = await pool.query(
        `SELECT patient_user_id FROM patient_relationships
         WHERE related_user_id = $1 AND status::text IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`,
        [userId],
      );
      for (const row of result.rows) {
        socket.join(`patient:${row.patient_user_id}`);
        console.log(`[WebSocket] User ${userId} auto-joined room patient:${row.patient_user_id}`);
      }
    }
  } catch (err) {
    console.error('[WebSocket] Room join error:', err);
  }

  socket.on('location:request', (data: { patientId: string }) => {
    if (data && data.patientId) {
      io.to(`patient:${data.patientId}`).emit('location:request', { patientId: data.patientId });
    }
  });

  socket.on('join:patient', async (patientId: string) => {
    if (!patientId) return;
    try {
      const { default: pool } = await import('./db/config');
      if (userRole === 'PATIENT' && userId === patientId) {
        socket.join(`patient:${patientId}`);
        console.log(`[WebSocket] Patient ${userId} joined room patient:${patientId}`);
      } else {
        const check = await pool.query(
          `SELECT 1 FROM patient_relationships
           WHERE patient_user_id = $1 AND related_user_id = $2 
             AND status::text IN ('CONFIRMED', 'ACCEPTED', 'MEETING_COMPLETED', 'ASSESSMENT_PENDING', 'ACTIVE_CARE')`,
          [patientId, userId]
        );
        if (check.rows.length > 0) {
          socket.join(`patient:${patientId}`);
          console.log(`[WebSocket] Caregiver/Family ${userId} joined room patient:${patientId}`);
        } else {
          console.warn(`[WebSocket] User ${userId} unauthorized to join room patient:${patientId}`);
        }
      }
    } catch (err) {
      console.error('[WebSocket] join:patient error:', err);
    }
  });

  socket.on('disconnect', () => {
    // rooms auto-cleaned by socket.io
  });
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  const dbUrl = process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@') : null;
  res.json({
    status: 'ok',
    version: '1.0.6',
    dbUrl,
    renderEnv: {
      RENDER: process.env.RENDER,
      RENDER_SERVICE_NAME: process.env.RENDER_SERVICE_NAME,
      RENDER_INSTANCE_ID: process.env.RENDER_INSTANCE_ID,
      RENDER_SERVICE_ID: process.env.RENDER_SERVICE_ID,
      NODE_ENV: process.env.NODE_ENV,
    },
    ts: new Date().toISOString(),
  });
});

app.get('/health/db', async (_req, res) => {
  const results: any = {};
  const rawUrl = process.env.DATABASE_URL || '';
  results.rawUrl = rawUrl.replace(/:[^:@]+@/, ':***@');

  // 1. DNS check for internal host
  try {
    const dns = await import('dns');
    const lookup = await new Promise((resolve) => {
      dns.lookup('dpg-d9gu3evlk1mc738ldj4g-a', (err, addr) => {
        resolve(err ? { err: err.message, code: (err as any).code } : { addr });
      });
    });
    results.internalDns = lookup;
  } catch (e: any) {
    results.internalDns = { err: e.message };
  }

  // 2. DNS check for external host
  try {
    const dns = await import('dns');
    const lookup = await new Promise((resolve) => {
      dns.lookup('dpg-d9gu3evlk1mc738ldj4g-a.singapore-postgres.render.com', (err, addr) => {
        resolve(err ? { err: err.message, code: (err as any).code } : { addr });
      });
    });
    results.externalDns = lookup;
  } catch (e: any) {
    results.externalDns = { err: e.message };
  }

  // 3. Current pool test
  try {
    const { default: pool } = await import('./db/config');
    const q = await pool.query('SELECT NOW() as now, current_database(), current_user');
    results.poolQuery = { success: true, row: q.rows[0] };
  } catch (e: any) {
    results.poolQuery = { success: false, message: e.message, code: e.code };
  }

  // 4. Try internal URL with ssl: false
  try {
    const { Client } = await import('pg');
    const internalClient = new Client({
      connectionString: rawUrl,
      ssl: false,
      connectionTimeoutMillis: 3000,
    });
    await internalClient.connect();
    const q = await internalClient.query('SELECT NOW() as now');
    await internalClient.end();
    results.internalClientNoSsl = { success: true, now: q.rows[0].now };
  } catch (e: any) {
    results.internalClientNoSsl = { success: false, message: e.message, code: e.code };
  }

  // 5. Try internal URL with ssl: { rejectUnauthorized: false }
  try {
    const { Client } = await import('pg');
    const internalClientSsl = new Client({
      connectionString: rawUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 3000,
    });
    await internalClientSsl.connect();
    const q = await internalClientSsl.query('SELECT NOW() as now');
    await internalClientSsl.end();
    results.internalClientSsl = { success: true, now: q.rows[0].now };
  } catch (e: any) {
    results.internalClientSsl = { success: false, message: e.message, code: e.code };
  }

  // 6. Try EXTERNAL URL (fixed hostname) with ssl: { rejectUnauthorized: false }
  try {
    const { Client } = await import('pg');
    const externalUrl = rawUrl.replace(
      /@(dpg-[a-z0-9]+-a)(\/|:|\?|$)/i,
      '@$1.singapore-postgres.render.com$2',
    );
    const externalClientSsl = new Client({
      connectionString: externalUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
    await externalClientSsl.connect();
    const q = await externalClientSsl.query('SELECT NOW() as now');
    await externalClientSsl.end();
    results.externalClientSsl = { success: true, now: q.rows[0].now };
  } catch (e: any) {
    results.externalClientSsl = { success: false, message: e.message, code: e.code };
  }

  // 7. Try EXTERNAL URL with ssl: false (no TLS)
  try {
    const { Client } = await import('pg');
    const externalUrl = rawUrl.replace(
      /@(dpg-[a-z0-9]+-a)(\/|:|\?|$)/i,
      '@$1.singapore-postgres.render.com$2',
    );
    const externalClientNoSsl = new Client({
      connectionString: externalUrl,
      ssl: false,
      connectionTimeoutMillis: 5000,
    });
    await externalClientNoSsl.connect();
    const q = await externalClientNoSsl.query('SELECT NOW() as now');
    await externalClientNoSsl.end();
    results.externalClientNoSsl = { success: true, now: q.rows[0].now };
  } catch (e: any) {
    results.externalClientNoSsl = { success: false, message: e.message, code: e.code };
  }

  res.json(results);
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
app.use('/uploads',             express.static(path.join(process.cwd(), 'uploads')));

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const PORT = parseInt(process.env.PORT || '3000', 10);
  httpServer.listen(PORT, async () => {
    console.log(`\n🚀 SureStep API running on http://localhost:${PORT}`);
    console.log(`   WebSocket server ready`);
    console.log(`   Environment: ${process.env.NODE_ENV ?? 'development'}\n`);

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