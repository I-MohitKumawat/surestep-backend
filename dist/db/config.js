"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
let connectionString = process.env.DATABASE_URL;
if (connectionString) {
    // If host is a Render short name without a domain (e.g. dpg-d9gu3evlk1mc738ldj4g-a),
    // append .singapore-postgres.render.com so it resolves across regions
    connectionString = connectionString.replace(/@(dpg-[a-z0-9]+-a)(\/|:|\?|$)/i, '@$1.singapore-postgres.render.com$2');
}
const isRemoteDb = Boolean(process.env.NODE_ENV === 'production' ||
    process.env.RENDER ||
    connectionString?.includes('render.com') ||
    connectionString?.includes('dpg-'));
const pool = new pg_1.Pool(connectionString
    ? {
        connectionString,
        ssl: isRemoteDb ? { rejectUnauthorized: false } : false,
    }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'surestep',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
    });
pool.on('error', (err) => {
    console.error('[DB Pool Error]', err);
});
exports.default = pool;
//# sourceMappingURL=config.js.map