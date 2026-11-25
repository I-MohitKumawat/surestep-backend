/**
 * Deterministic database bootstrap.
 *
 * Applies every pending SQL file in db/migrations through the same runner the
 * server uses at startup, recording each filename in schema_migrations. This is
 * the sole schema authority for local, CI, and production databases.
 */
import 'dotenv/config';
//# sourceMappingURL=migrate.d.ts.map