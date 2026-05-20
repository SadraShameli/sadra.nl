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

type PoolMember = (...args: unknown[]) => unknown;

function buildConnectionString(raw: string): string {
    const url = new URL(raw);
    url.searchParams.delete('uselibpqcompat');
    url.searchParams.delete('sslmode');
    return url.toString();
}

function getPool(): pg.Pool {
    if (globalForDb.pool) return globalForDb.pool;
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error(
            'DATABASE_URL is not configured. Set it before issuing DB queries.',
        );
    }
    const pool = new pg.Pool({
        connectionString: buildConnectionString(databaseUrl),
        idleTimeoutMillis: 5000,
        max: 2,
        ssl: { rejectUnauthorized: false },
    });
    attachDatabasePool(pool);
    if (env.NODE_ENV !== 'production') globalForDb.pool = pool;
    return pool;
}

export const db = drizzle(
    new Proxy({} as pg.Pool, {
        get(_target, prop) {
            const target = getPool() as unknown as Record<string, PoolMember>;
            const value = target[prop as string];
            if (typeof value === 'function') {
                return value.bind(target);
            }
            return value;
        },
    }),
    {
        schema: {
            ...schema,
            ...authSchema,
            ...tradingSchema,
            ...notificationSchema,
        },
    },
);

export async function endDb() {
    if (globalForDb.pool) {
        await globalForDb.pool.end();
        globalForDb.pool = undefined;
    }
}
