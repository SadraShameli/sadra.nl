import { attachDatabasePool } from '@vercel/functions';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { environment } from '~/environment';

import { databaseSchema } from './databaseSchema';

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
export { userTheme } from './schemas/theme';
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
    return url.href;
}

function shouldUseSsl(raw: string): boolean {
    try {
        const url = new URL(raw);
        const sslmode = url.searchParams.get('sslmode');
        return (
            sslmode !== 'disable' &&
            !['127.0.0.1', '::1', 'localhost'].includes(url.hostname)
        );
    } catch {
        return true;
    }
}

const databaseUrl = environment.DATABASE_URL;
const pool =
    globalForDatabase.pool ??
    new pg.Pool({
        connectionString: databaseUrl
            ? buildConnectionString(databaseUrl)
            : PLACEHOLDER_DB_URL,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30_000,
        keepAlive: true,
        max: 20,
        maxLifetimeSeconds: 60,
        ssl:
            databaseUrl && shouldUseSsl(databaseUrl)
                ? { rejectUnauthorized: false }
                : false,
        statement_timeout: 15_000,
    });

const isPoolLifecycleAttached = (() => {
    pool.on('error', (error) => {
        console.error('[db.pool] idle client error', error);
    });

    attachDatabasePool(pool);

    return true;
})();

if (isPoolLifecycleAttached && environment.NODE_ENV !== 'production') {
    globalForDatabase.pool = pool;
}

const database = drizzle(pool, { schema: databaseSchema });
export { database as db };

async function endDatabase() {
    await pool.end();
}
export { endDatabase as endDb };
