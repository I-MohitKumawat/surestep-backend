import * as schema from './schema';
export declare const db: import("drizzle-orm/node-postgres").NodePgDatabase<typeof schema> & {
    $client: import("pg").Pool;
};
export type Database = typeof db;
export * from './schema';
//# sourceMappingURL=drizzle.d.ts.map