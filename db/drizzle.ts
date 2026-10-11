import { drizzle } from 'drizzle-orm/node-postgres';
import pool from './config';
import * as schema from './schema';

export const db = drizzle(pool, { schema });
export type Database = typeof db;
export * from './schema';

