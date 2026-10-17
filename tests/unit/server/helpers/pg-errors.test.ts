import { describe, expect, it } from 'vitest';

import { user } from '~/server/db/schemas/auth';
import {
    isUniqueViolation,
    retryOnUniqueViolation,
} from '~/server/helpers/pg-errors';

import { createFakeDatabase, FakeDatabaseError } from '../fakeDatabase';

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

function rejectingDatabase(code: string) {
    return createFakeDatabase(() => {
        throw new FakeDatabaseError(code, 'sadranl_user_email_unique');
    });
}

async function insertUser(
    database: ReturnType<typeof rejectingDatabase>['database'],
): Promise<void> {
    await database
        .insert(user)
        .values({ email: 'a@b.test', id: 'user-1', name: 'A' });
}

async function caughtFrom(run: () => Promise<void>): Promise<unknown> {
    try {
        await run();
    } catch (error: unknown) {
        return error;
    }
    throw new TypeError('the query did not fail');
}

describe('isUniqueViolation', () => {
    it('recognizes a unique violation that Drizzle wraps in a query error', async () => {
        const { database } = rejectingDatabase(UNIQUE_VIOLATION);
        const error = await caughtFrom(() => insertUser(database));
        expect(isUniqueViolation(error)).toBe(true);
    });

    it('does not treat another wrapped constraint failure as a unique violation', async () => {
        const { database } = rejectingDatabase(FOREIGN_KEY_VIOLATION);
        const error = await caughtFrom(() => insertUser(database));
        expect(isUniqueViolation(error)).toBe(false);
    });
});

describe('retryOnUniqueViolation', () => {
    it('retries a wrapped unique violation up to the attempt limit', async () => {
        const { database, queries } = rejectingDatabase(UNIQUE_VIOLATION);
        await expect(
            retryOnUniqueViolation(() => insertUser(database)),
        ).rejects.toThrow();
        expect(queries).toHaveLength(3);
    });
});
