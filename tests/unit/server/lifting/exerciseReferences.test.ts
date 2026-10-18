import { describe, expect, it, vi } from 'vitest';

import { liftingGoalRouter } from '~/server/api/routers/lifting/goal';
import { liftingWorkoutRouter } from '~/server/api/routers/lifting/workout';
import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc';

import {
    createFakeDatabase,
    type FakeRow,
    type IssuedQuery,
    readTable,
    writeTable,
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
const OTHER_USER_ID = 'other-lifting-user';
const WORKOUT_ID = '00000000-0000-4000-8000-000000000010';
const FOREIGN_EXERCISE_ID = '00000000-0000-4000-8000-000000000020';

const OWNED_WORKOUT: FakeRow = {
    ended_at: null,
    id: WORKOUT_ID,
    name: 'Leg day',
    notes: null,
    started_at: new Date('2026-10-01T10:00:00Z'),
    user_id: USER_ID,
};

const FOREIGN_PRIVATE_EXERCISE: FakeRow = {
    id: FOREIGN_EXERCISE_ID,
    name: 'Secret lift',
    owner_id: OTHER_USER_ID,
    slug: 'secret-lift',
};

function callerWith() {
    const { database, queries } = createFakeDatabase((query) => {
        const table = readTable(query);
        if (table === 'sadranl_lifting_exercise') {
            return [FOREIGN_PRIVATE_EXERCISE].filter((row) =>
                isVisibleTo(query, row),
            );
        }
        if (table === 'sadranl_lifting_workout') return [OWNED_WORKOUT];
        return writeTable(query) === null
            ? []
            : [{ id: '00000000-0000-4000-8000-000000000099' }];
    });
    const caller = createCallerFactory(
        createTRPCRouter({
            goal: liftingGoalRouter,
            workout: liftingWorkoutRouter,
        }),
    )({
        db: database,
        headers: new Headers(),
        session: {
            user: { email: 'lifter@example.com', id: USER_ID, role: 'user' },
        } as never,
    });
    return { caller, queries };
}

function isVisibleTo(query: IssuedQuery, row: FakeRow): boolean {
    const ownerParameter = /"owner_id" = \$(\d+)/.exec(query.text);
    if (ownerParameter?.[1] === undefined) return true;
    const owner = query.params[Number(ownerParameter[1]) - 1];
    const isAllowsShared = /"owner_id" is null/i.test(query.text);
    return row.owner_id === owner || (isAllowsShared && row.owner_id === null);
}

function writesOf(queries: readonly IssuedQuery[]): readonly IssuedQuery[] {
    return queries.filter((query) => writeTable(query) !== null);
}

describe('lifting exercise references', () => {
    it('refuses to add another user private exercise to an owned workout', async () => {
        const { caller, queries } = callerWith();
        await expect(
            caller.workout.addExercise({
                exerciseId: FOREIGN_EXERCISE_ID,
                workoutId: WORKOUT_ID,
            }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(writesOf(queries)).toEqual([]);
    });

    it('refuses a goal on another user private exercise', async () => {
        const { caller, queries } = callerWith();
        await expect(
            caller.goal.create({
                exerciseId: FOREIGN_EXERCISE_ID,
                kind: 'onerepmax',
                targetValue: 100,
            }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(writesOf(queries)).toEqual([]);
    });
});
