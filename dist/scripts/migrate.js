"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Deterministic database bootstrap.
 *
 * Applies every pending SQL file in db/migrations through the same runner the
 * server uses at startup, recording each filename in schema_migrations. This is
 * the sole schema authority for local, CI, and production databases.
 */
require("dotenv/config");
const migrator_1 = require("../db/migrator");
const config_1 = __importDefault(require("../db/config"));
async function main() {
    const result = await (0, migrator_1.runMigrations)();
    if (result.applied.length === 0) {
        console.log('[migrate] Database is up to date.');
    }
    else {
        console.log(`[migrate] Applied ${result.applied.length} migration(s):`);
        for (const name of result.applied) {
            console.log(`  - ${name}`);
        }
    }
}
main()
    .catch((err) => {
    console.error('[migrate] Migration failed:', err);
    process.exitCode = 1;
})
    .finally(async () => {
    await config_1.default.end();
});
//# sourceMappingURL=migrate.js.map