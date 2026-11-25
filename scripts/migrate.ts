/**
 * Deterministic database bootstrap.
 *
 * Applies every pending SQL file in db/migrations through the same runner the
 * server uses at startup, recording each filename in schema_migrations. This is
 * the sole schema authority for local, CI, and production databases.
 */
import 'dotenv/config';
import { runMigrations } from '../db/migrator';
import pool from '../db/config';

async function main(): Promise<void> {
  const result = await runMigrations();

  if (result.applied.length === 0) {
    console.log('[migrate] Database is up to date.');
  } else {
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
    await pool.end();
  });
