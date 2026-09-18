"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
/**
 * Canonical database pool for SureStep.
 *
 * Render PostgreSQL external connection requirements (verified via /health/db diagnostics):
 *
 * 1. The DATABASE_URL env var Render sets uses the internal short hostname
 *    (e.g. dpg-xxx-a without domain). When the web service and DB are in different
 *    regions this fails DNS. We append the full external hostname suffix.
 *
 * 2. External Render Postgres requires SSL. Non-SSL connections get:
 *    "SSL/TLS required" (PostgreSQL error code 28000).
 *
 * 3. Both conditions must be met for the pg driver to successfully negotiate TLS:
 *    a. sslmode=require in the connection string URL
 *    b. ssl: { rejectUnauthorized: false } as an explicit Pool option
 *
 *    Using ONLY sslmode=require in the URL is insufficient — the pg driver on Node.js
 *    may still attempt an unencrypted handshake first, resulting in
 *    "Connection terminated unexpectedly".
 *    Using ONLY ssl: { rejectUnauthorized: false } without sslmode in the URL
 *    also causes "Connection terminated unexpectedly" on Render's external endpoint.
 *
 *    Providing BOTH causes pg to:
 *    (a) know SSL is required at the protocol level (from sslmode)
 *    (b) use Node.js TLS with the correct self-signed cert acceptance (from ssl option)
 *
 * Reference: https://render.com/docs/databases#external-connections
 * Reference: https://node-postgres.com/features/ssl
 */
function buildConnectionString() {
    let url = process.env.DATABASE_URL;
    if (!url)
        return undefined;
    // Fix short Render hostname → full external hostname
    // Pattern: @dpg-xxxxxxxx-a/  →  @dpg-xxxxxxxx-a.singapore-postgres.render.com/
    url = url.replace(/@(dpg-[a-z0-9]+-[a-z])(\/|:|\?|$)/i, (_m, id, sep) => `@${id}.singapore-postgres.render.com${sep}`);
    // Ensure sslmode=require is present in the connection string
    const isRenderDb = (!!process.env.RENDER ||
        url.includes('render.com') ||
        url.includes('dpg-'));
    if (isRenderDb) {
        if (url.includes('sslmode=')) {
            url = url.replace(/sslmode=[^&]+/, 'sslmode=require');
        }
        else {
            url += (url.includes('?') ? '&' : '?') + 'sslmode=require';
        }
    }
    return url;
}
const connectionString = buildConnectionString();
const isRenderDb = (!!process.env.RENDER ||
    (connectionString || '').includes('render.com') ||
    (connectionString || '').includes('dpg-'));
const pool = new pg_1.Pool(connectionString
    ? {
        connectionString,
        // BOTH sslmode=require in the URL and the ssl object are required for Render.
        // The ssl object enables Node.js TLS with rejectUnauthorized: false (Render uses
        // self-signed/managed certs on the external endpoint). Without this, pg attempts
        // an unencrypted handshake first even when sslmode=require is in the URL.
        ssl: isRenderDb ? { rejectUnauthorized: false } : false,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
    }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'surestep',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
    });
pool.on('error', (err) => {
    console.error('[DB Pool Error]', err.message);
});
exports.default = pool;
//# sourceMappingURL=config.js.map