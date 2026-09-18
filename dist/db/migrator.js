"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitSqlStatements = splitSqlStatements;
exports.runMigrations = runMigrations;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = __importDefault(require("./config"));
/**
 * Splits SQL script into discrete statements, respecting comments,
 * string literals, and $$ ... $$ dollar-quoted blocks.
 */
function splitSqlStatements(sql) {
    const statements = [];
    let current = '';
    let inString = false;
    let inDollarQuote = false;
    let inLineComment = false;
    let inBlockComment = false;
    for (let i = 0; i < sql.length; i++) {
        const char = sql[i];
        const nextChar = sql[i + 1] || '';
        if (inLineComment) {
            if (char === '\n')
                inLineComment = false;
            current += char;
            continue;
        }
        if (inBlockComment) {
            if (char === '*' && nextChar === '/') {
                inBlockComment = false;
                current += '*/';
                i++;
                continue;
            }
            current += char;
            continue;
        }
        if (!inString && !inDollarQuote && char === '-' && nextChar === '-') {
            inLineComment = true;
            current += '--';
            i++;
            continue;
        }
        if (!inString && !inDollarQuote && char === '/' && nextChar === '*') {
            inBlockComment = true;
            current += '/*';
            i++;
            continue;
        }
        if (!inDollarQuote && char === "'") {
            if (inString && nextChar === "'") {
                current += "''";
                i++;
                continue;
            }
            inString = !inString;
            current += char;
            continue;
        }
        if (!inString && char === '$' && nextChar === '$') {
            inDollarQuote = !inDollarQuote;
            current += '$$';
            i++;
            continue;
        }
        if (!inString && !inDollarQuote && char === ';') {
            const trimmed = current.trim();
            if (trimmed.length > 0) {
                statements.push(trimmed);
            }
            current = '';
            continue;
        }
        current += char;
    }
    const lastTrimmed = current.trim();
    if (lastTrimmed.length > 0) {
        statements.push(lastTrimmed);
    }
    return statements;
}
function findMigrationsDir() {
    const candidateDirs = [
        path_1.default.resolve(process.cwd(), 'db', 'migrations'),
        path_1.default.resolve(__dirname, 'migrations'),
        path_1.default.resolve(__dirname, '..', 'db', 'migrations'),
        path_1.default.resolve(__dirname, '..', '..', 'db', 'migrations'),
    ];
    for (const dir of candidateDirs) {
        if (fs_1.default.existsSync(dir) && fs_1.default.readdirSync(dir).some((f) => f.endsWith('.sql'))) {
            return dir;
        }
    }
    return null;
}
async function runMigrations() {
    const migrationsDir = findMigrationsDir();
    if (!migrationsDir) {
        console.warn('[Migrator] No migrations directory found; skipping migrations.');
        return { applied: [], alreadyApplied: [] };
    }
    const client = await config_1.default.connect();
    try {
        // 1. Ensure schema_migrations table exists
        await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
        // 2. Fetch already applied migrations
        const res = await client.query('SELECT name FROM schema_migrations ORDER BY name ASC');
        const appliedSet = new Set(res.rows.map((r) => r.name));
        const alreadyApplied = Array.from(appliedSet);
        // 3. Find pending migration files
        const files = fs_1.default
            .readdirSync(migrationsDir)
            .filter((f) => f.endsWith('.sql'))
            .sort();
        const appliedNow = [];
        for (const file of files) {
            if (appliedSet.has(file)) {
                continue;
            }
            console.log(`[Migrator] Applying migration: ${file}...`);
            const filePath = path_1.default.join(migrationsDir, file);
            const content = fs_1.default.readFileSync(filePath, 'utf-8');
            const statements = splitSqlStatements(content);
            for (const statement of statements) {
                try {
                    await client.query(statement);
                }
                catch (err) {
                    // If error is duplicate object / already exists, allow it to continue idempotently
                    const isDuplicate = err.code === '42710' || // duplicate_object
                        err.code === '42P07' || // duplicate_table
                        err.code === '42701' || // duplicate_column
                        err.message?.includes('already exists');
                    if (isDuplicate) {
                        console.warn(`[Migrator] Notice during ${file}: ${err.message}`);
                    }
                    else {
                        console.error(`[Migrator] Failed executing statement in ${file}:`, statement);
                        throw err;
                    }
                }
            }
            await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
            console.log(`[Migrator] Migration ${file} applied successfully.`);
            appliedNow.push(file);
        }
        return { applied: appliedNow, alreadyApplied };
    }
    finally {
        client.release();
    }
}
//# sourceMappingURL=migrator.js.map