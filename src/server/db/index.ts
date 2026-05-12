import { attachDatabasePool } from '@vercel/functions';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { env } from '~/env';
import * as authSchema from './schemas/auth';
import * as schema from './schemas/main';

export { users } from './schemas/auth';

const globalForDb = globalThis as unknown as {
    pool: pg.Pool | undefined;
};

const dbUrl = new URL(env.DATABASE_URL);
dbUrl.searchParams.delete('uselibpqcompat');
dbUrl.searchParams.delete('sslmode');

export const pool =
    globalForDb.pool ??
    new pg.Pool({
        connectionString: dbUrl.toString(),
        ssl: { rejectUnauthorized: false },
        max: 2,
        idleTimeoutMillis: 5000,
    });

attachDatabasePool(pool);

if (env.NODE_ENV !== 'production') globalForDb.pool = pool;

export const db = drizzle(pool, { schema: { ...schema, ...authSchema } });

export async function endDb() {
    await pool.end();
}
