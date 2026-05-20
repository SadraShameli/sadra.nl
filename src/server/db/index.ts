import { attachDatabasePool } from '@vercel/functions';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { env } from '~/env';

import * as authSchema from './schemas/auth';
import * as schema from './schemas/main';
import * as notificationSchema from './schemas/notification';
import * as tradingSchema from './schemas/trading';

export {
    accounts,
    passwordResetTokens,
    sessions,
    users,
    verificationTokens,
} from './schemas/auth';
export { notificationPreference } from './schemas/notification';
export {
    dailyPreparations,
    tradeAssessments,
    tradingPlans,
} from './schemas/trading';

const globalForDb = globalThis as unknown as {
    pool: pg.Pool | undefined;
};

const PLACEHOLDER_DB_URL = 'postgres://placeholder@localhost:5432/placeholder';

function buildConnectionString(raw: string): string {
    const url = new URL(raw);
    url.searchParams.delete('uselibpqcompat');
    url.searchParams.delete('sslmode');
    return url.toString();
}

const databaseUrl = env.DATABASE_URL;
const pool =
    globalForDb.pool ??
    new pg.Pool({
        connectionString: databaseUrl
            ? buildConnectionString(databaseUrl)
            : PLACEHOLDER_DB_URL,
        idleTimeoutMillis: 5000,
        max: 2,
        ssl: { rejectUnauthorized: false },
    });

attachDatabasePool(pool);

if (env.NODE_ENV !== 'production') globalForDb.pool = pool;

export const db = drizzle(pool, {
    schema: {
        ...schema,
        ...authSchema,
        ...tradingSchema,
        ...notificationSchema,
    },
});

export async function endDb() {
    await pool.end();
}
