import { attachDatabasePool } from '@vercel/functions';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { env } from '~/env';

import * as authSchema from './schemas/auth';
import * as schema from './schemas/main';
import * as tradingSchema from './schemas/trading';

export {
    accounts,
    passwordResetTokens,
    sessions,
    users,
    verificationTokens,
} from './schemas/auth';
export {
    dailyPreparations,
    tradeAssessments,
    tradingPlans,
} from './schemas/trading';

const globalForDb = globalThis as unknown as {
    pool: pg.Pool | undefined;
};

const dbUrl = new URL(env.DATABASE_URL);
dbUrl.searchParams.delete('uselibpqcompat');
dbUrl.searchParams.delete('sslmode');

const pool =
    globalForDb.pool ??
    new pg.Pool({
        connectionString: dbUrl.toString(),
        idleTimeoutMillis: 5000,
        max: 2,
        ssl: { rejectUnauthorized: false },
    });

attachDatabasePool(pool);

if (env.NODE_ENV !== 'production') globalForDb.pool = pool;

export const db = drizzle(pool, {
    schema: { ...schema, ...authSchema, ...tradingSchema },
});

export async function endDb() {
    await pool.end();
}
