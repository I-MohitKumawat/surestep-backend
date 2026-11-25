# Drizzle schema model

`index.ts` defines the Drizzle ORM table model used by `db/drizzle.ts` and
`drizzle.config.ts` for typed application queries.

It is **not** the database bootstrap definition. The authoritative schema is
`db/migrations/*.sql`, applied through `npm run migrate` (see `db/README.md`).
The former numbered `.sql` files in this directory were stale duplicates of the
migration-era schema and have been removed.
