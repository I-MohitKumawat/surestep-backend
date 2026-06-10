"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const pool = new pg_1.Pool(process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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