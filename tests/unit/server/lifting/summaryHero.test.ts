import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { liftingAnalyticsRouter } from '~/server/api/routers/lifting/analytics';
import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc';

import {
    createFakeDatabase,
    type FakeRow,
    type IssuedQuery,
    readTable,
} from '../fakeDatabase';

vi.mock('~/environment', () => ({ environment: { NODE_ENV: 'test' } }));
vi.mock('~/server/db', async () => {
    const schema = await import('~/server/db/schemas/lifting');
    return { db: {}, ...schema };
});
vi.mock('~/lib/auth/server', () => ({
    auth: { api: { getSession: vi.fn() } },
}));
vi.mock('~/lib/email', () => ({}));
vi.mock('~/lib/notify', () => ({ scheduleFanOut: vi.fn() }));

const USER_ID = 'lifting-user';
const NOW = new Date('2026-10-14T12:00:00Z');
const WEEKS = 21;
const DAY_MS = 24 * 60 * 60 * 1000;

function limited(query: IssuedQuery, rows: FakeRow[]): FakeRow[] {
    const limit = /\slimit \$(\d+)/i.exec(query.text);
    return limit?.[1] === undefined
        ? rows
        : rows.slice(0, Number(query.params[Number(limit[1]) - 1]));
}

function weeklyWorkouts(): FakeRow[] {
    return Array.from({ length: WEEKS }, (_, index) => {
        const startedAt = new Date(NOW.getTime() - index * 7 * DAY_MS);
        return {
            ended_at: startedAt,
            id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
            name: `Workout ${String(index)}`,
            started_at: startedAt,
        };
    });
}

describe('lifting analytics summaryHero', () => {
    beforeEach(() => {
        vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('counts the weekly streak over the whole workout history, not only the latest 20 workouts', async () => {
        const { database } = createFakeDatabase((query) =>
            readTable(query) === 'sadranl_lifting_workout'
                ? limited(query, weeklyWorkouts())
                : [],
        );
        const caller = createCallerFactory(
            createTRPCRouter({ analytics: liftingAnalyticsRouter }),
        )({
            db: database,
            headers: new Headers(),
            session: {
                user: {
                    email: 'lifter@example.com',
                    id: USER_ID,
                    role: 'user',
                },
            } as never,
        });
        const summary = await caller.analytics.summaryHero();
        expect(summary.currentStreak).toBe(WEEKS);
        expect(summary.lastWorkout?.name).toBe('Workout 0');
    });
});
