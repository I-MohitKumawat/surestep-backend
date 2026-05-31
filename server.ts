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

  // Join all linked patient rooms
  try {
    const { default: pool } = await import('./db/config');

    if (userRole === 'PATIENT') {
      socket.join(`patient:${userId}`);
    } else {
      // Caregiver or Family: join rooms for all confirmed patients
      const result = await pool.query(
        `SELECT patient_user_id FROM patient_relationships
         WHERE related_user_id = $1 AND status = 'CONFIRMED'`,
        [userId],
      );
      for (const row of result.rows) {
        socket.join(`patient:${row.patient_user_id}`);
      }
    }
  } catch (err) {
    console.error('[WebSocket] Room join error:', err);
  }

  socket.on('disconnect', () => {
    // rooms auto-cleaned by socket.io
  });
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
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

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
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

export default app;