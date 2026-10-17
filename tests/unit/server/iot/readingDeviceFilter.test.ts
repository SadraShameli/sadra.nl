import { describe, expect, it, vi } from 'vitest';

import { readingRouter } from '~/server/api/routers/iot/reading';
import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc';

import { createFakeDatabase, type IssuedQuery } from '../fakeDatabase';

vi.mock('~/environment', () => ({ environment: { NODE_ENV: 'test' } }));
vi.mock('~/server/db', () => ({ db: {} }));
vi.mock('~/lib/auth/server', () => ({
    auth: { api: { getSession: vi.fn() } },
}));
vi.mock('~/lib/email', () => ({}));
vi.mock('~/lib/notify', () => ({ scheduleFanOut: vi.fn() }));

const READING_TABLE = /from "sadranl_reading"/i;
const DEVICE_PREDICATE = /"sadranl_reading"\."device_id" = \$\d+/i;

function readingQueries(queries: readonly IssuedQuery[]): IssuedQuery[] {
    return queries.filter((query) => READING_TABLE.test(query.text));
}

describe('reading.getReadingsInput device filter', () => {
    it('reports no readings for a device that is not at the location instead of every device there', async () => {
        const { database, queries } = createFakeDatabase(() => []);
        const caller = createCallerFactory(
            createTRPCRouter({ reading: readingRouter }),
        )({ db: database, headers: new Headers(), session: null });

        const result = await caller.reading.getReadingsInput({
            date_from: new Date('2026-01-01T00:00:00Z'),
            date_to: new Date('2026-01-02T00:00:00Z'),
            device_id: 999,
            granularity: 'raw',
            location_id: 3,
        });

        expect(result).toEqual({ error: 'No readings could be found' });
        for (const query of readingQueries(queries)) {
            expect(query.text).toMatch(DEVICE_PREDICATE);
        }
    });
});
