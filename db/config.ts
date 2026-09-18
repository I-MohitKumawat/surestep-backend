import { Pool } from 'pg';

/**
 * Canonical database pool for SureStep.
 *
 * Render quirks handled here:
 * 1. The DATABASE_URL env var on Render is often set to the internal short hostname
 *    (e.g. dpg-xxx-a without a domain) from a different-region service configuration.
 *    We append .singapore-postgres.render.com to make it the external resolvable hostname.
 *
 * 2. Render's external PostgreSQL endpoint uses TLS at the proxy layer and requires
 *    sslmode=require in the connection string. Using a bare `ssl: { rejectUnauthorized: false }`
 *    pg object without the connection-string sslmode causes "Connection terminated unexpectedly"
 *    because Render's TLS proxy doesn't receive the proper SSL negotiation signal.
 *    Reference: https://render.com/docs/databases#external-connections
 *
 * 3. Do NOT pass both ssl: object AND sslmode in the connection string — they conflict.
 *    Let the connection string's sslmode handle SSL entirely.
 */

function buildConnectionString(): string | undefined {
  let url = process.env.DATABASE_URL;
  if (!url) return undefined;

  // Fix Render short hostname → full external hostname
  // Short form: dpg-xxxxxxxx-a  →  dpg-xxxxxxxx-a.singapore-postgres.render.com
  url = url.replace(
    /@(dpg-[a-z0-9]+-[a-z])(\/|:|\?|$)/i,
    (_m, id, sep) => `@${id}.singapore-postgres.render.com${sep}`,
  );

  // Add explicit port if missing (Render Postgres external uses 5432)
  // URL form: @host/db  →  @host:5432/db
  url = url.replace(
    /@([a-z0-9._-]+)(\/[^?]*)/i,
    (_m, host, rest) => {
      if (host.includes(':')) return `@${host}${rest}`; // port already present
      return `@${host}:5432${rest}`;
    },
  );

  // Ensure sslmode=require is present for Render's TLS proxy
  const isRenderDb = (
    process.env.RENDER === 'true' ||
    !!process.env.RENDER ||
    url.includes('render.com') ||
    url.includes('dpg-')
  );
  if (isRenderDb) {
    if (url.includes('sslmode=')) {
      // Replace whatever sslmode is set to with require
      url = url.replace(/sslmode=[^&]+/, 'sslmode=require');
    } else {
      url += (url.includes('?') ? '&' : '?') + 'sslmode=require';
    }
  }

  return url;
}

const connectionString = buildConnectionString();

const pool = new Pool(
  connectionString
    ? {
        connectionString,
        // Do NOT add ssl: object here — sslmode=require in the connection string
        // is sufficient and avoids conflicts with Render's TLS proxy.
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      }
    : {
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME     || 'surestep',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASSWORD || '',
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      },
);

pool.on('error', (err) => {
  console.error('[DB Pool Error]', err.message);
});

export default pool;