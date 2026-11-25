# Database bootstrap

`db/migrations/*.sql` is the **single source of truth** for the database schema.

- `npm run migrate` runs `scripts/migrate.ts`, which invokes the same
  `db/migrator.ts` runner the server uses at startup. Applied filenames are
  recorded in `schema_migrations`; migrations are never edited after being
  applied. Add a new numbered migration instead.
- `psql "$DATABASE_URL" -f db/truncate_all.sql` clears canonical application
  data while preserving schema and migration history.
- `db/schema/index.ts` is the Drizzle ORM model used for typed queries. It is
  not a bootstrap mechanism. The former `db/schema/*.sql` files were stale
  duplicates and have been removed.

For a fresh database:

```bash
npm run migrate
```
