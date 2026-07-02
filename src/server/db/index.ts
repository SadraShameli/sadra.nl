import { attachDatabasePool } from '@vercel/functions';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { env } from '~/env';

import * as relationsModule from './relations';
import * as accountingSchema from './schemas/accounting';
import * as authSchema from './schemas/auth';
import * as schema from './schemas/iot';
import * as liftingSchema from './schemas/lifting';
import * as mainSchema from './schemas/main';
import * as notificationSchema from './schemas/notification';
import * as observabilitySchema from './schemas/observability';
import * as tradingSchema from './schemas/trading';

export {
    accountingBankAccount,
    accountingCredential,
    accountingRule,
    accountingRun,
} from './schemas/accounting';
export { account, user } from './schemas/auth';
export {
    liftingExercise,
    liftingExerciseAlias,
    liftingGoal,
    liftingMeasurement,
    liftingPersonalRecord,
    liftingProgram,
    liftingRoutine,
    liftingSet,
    liftingSettings,
    liftingUserProgram,
    liftingWorkout,
    liftingWorkoutExercise,
} from './schemas/lifting';
export { notificationPreference } from './schemas/notification';
export { rateLimitBucket } from './schemas/observability';
export {
    dailyPreparations,
    tradeAssessments,
    tradingPlans,
} from './schemas/trading';

const globalForDatabase = globalThis as unknown as {
    pool: pg.Pool | undefined;
};

const PLACEHOLDER_DB_URL = 'postgres://placeholder@localhost:5432/placeholder';

function buildConnectionString(raw: string): string {
    const url = new URL(raw);
    url.searchParams.delete('uselibpqcompat');
    url.searchParams.delete('sslmode');
    return url.toString();
}

function shouldUseSsl(raw: string): boolean {
    try {
        const url = new URL(raw);
        const sslmode = url.searchParams.get('sslmode');
        if (sslmode === 'disable') return false;
        return !['127.0.0.1', '::1', 'localhost'].includes(url.hostname);
    } catch {
        return true;
    }
}

const databaseUrl = env.DATABASE_URL;
const pool =
    globalForDatabase.pool ??
    new pg.Pool({
        connectionString: databaseUrl
            ? buildConnectionString(databaseUrl)
            : PLACEHOLDER_DB_URL,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30_000,
        max: 20,
        ssl:
            databaseUrl && shouldUseSsl(databaseUrl)
                ? { rejectUnauthorized: false }
                : false,
        statement_timeout: 15_000,
    });

pool.on('error', (error) => {
    console.error('[db.pool] idle client error', error);
});

attachDatabasePool(pool);

if (env.NODE_ENV !== 'production') globalForDatabase.pool = pool;

export const db = drizzle(pool, {
    schema: {
        ...mainSchema,
        ...schema,
        ...authSchema,
        ...tradingSchema,
        ...notificationSchema,
        ...observabilitySchema,
        ...accountingSchema,
        ...liftingSchema,
        ...relationsModule,
    },
});

export async function endDb() {
    await pool.end();
}
