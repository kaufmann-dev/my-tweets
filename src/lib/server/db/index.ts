import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { DATABASE_URL } from '$app/env/private';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

const client = postgres(DATABASE_URL);

// adapter-node emits this after closing the HTTP server on SIGTERM/SIGINT. Open pool connections
// would otherwise keep the process alive until the container runtime kills it.
process.once('sveltekit:shutdown', () => client.end({ timeout: 5 }));

export const db = drizzle(client, { schema });
