import { describe, expect, it, vi } from 'vitest';

import { recordingsRouter } from '~/server/api/routers/iot/recording';
import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc';

import { createFakeDatabase } from '../fakeDatabase';

vi.mock('~/environment', () => ({ environment: { NODE_ENV: 'test' } }));
vi.mock('~/server/db', async () => {
    const { databaseSchema } = await import('~/server/db/databaseSchema');
    return { ...databaseSchema, db: {} };
});
vi.mock('~/lib/auth/server', () => ({
    auth: { api: { getSession: vi.fn() } },
}));
vi.mock('~/lib/email', () => ({}));
vi.mock('~/lib/notify', () => ({ scheduleFanOut: vi.fn() }));

const ROW = {
    created_at: new Date('2026-10-01T10:00:00Z'),
    device_id: 3,
    file_name: 'Oct 1, 2026 - 10.00.wav',
    id: 11,
    location_id: 2,
};

describe('recording.getRecordings', () => {
    it('returns the listed columns inside a Result, without the audio file', async () => {
        const { database } = createFakeDatabase(() => [ROW]);
        const caller = createCallerFactory(
            createTRPCRouter({ recording: recordingsRouter }),
        )({ db: database, headers: new Headers(), session: null });

        const result = await caller.recording.getRecordings();

        expect(result.data).toEqual([ROW]);
        expect(result.data[0]).not.toHaveProperty('file');
    });
});
