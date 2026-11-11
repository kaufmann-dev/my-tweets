import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './index.ts';

/**
 * Applies pending migrations from `drizzle/` (relative to the working directory, the project root
 * in development and in the deployed image). Runs at server startup, before anything queries the
 * schema, so a fresh database works on the first deploy.
 */
export async function runMigrations(): Promise<void> {
	await migrate(db, { migrationsFolder: resolve('drizzle') });
}
