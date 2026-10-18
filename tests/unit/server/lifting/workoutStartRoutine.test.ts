import { describe, expect, it, vi } from 'vitest';

import type { RoutineBlock } from '~/lib/lifting/types';

import { liftingWorkoutRouter } from '~/server/api/routers/lifting/workout';
import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc';

import {
    createFakeDatabase,
    type FakeRow,
    insertedColumnValues,
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
const ROUTINE_ID = '00000000-0000-4000-8000-000000000101';
const WORKOUT_ID = '00000000-0000-4000-8000-000000000102';
const SQUAT_ID = '00000000-0000-4000-8000-000000000201';
const OWN_SLED_ID = '00000000-0000-4000-8000-000000000202';
const FOREIGN_SLED_ID = '00000000-0000-4000-8000-000000000203';
const FOREIGN_ROPE_ID = '00000000-0000-4000-8000-000000000204';
const OWN_SQUAT_TWIN_ID = '00000000-0000-4000-8000-000000000205';
const PLANK_ID = '00000000-0000-4000-8000-000000000206';

const ROUTINE_TABLE = 'sadranl_lifting_routine';
const EXERCISE_TABLE = 'sadranl_lifting_exercise';
const WORKOUT_TABLE = 'sadranl_lifting_workout';
const WORKOUT_EXERCISE_TABLE = 'sadranl_lifting_workout_exercise';

function addedExercises(queries: readonly IssuedQuery[]): unknown[] {
    return queries
        .filter((query) => writeTable(query) === WORKOUT_EXERCISE_TABLE)
        .flatMap((query) => insertedColumnValues(query, 'exercise_id'));
}

function builtIn(slug: string): RoutineBlock {
    return { exerciseSlug: slug, sets: 3 };
}

function custom(slug: string): RoutineBlock {
    return { exerciseSlug: slug, isCustom: true, sets: 3 };
}

function exercise(id: string, slug: string, ownerId: null | string): FakeRow {
    return { id, is_custom: ownerId !== null, owner_id: ownerId, slug };
}

function isVisibleTo(query: IssuedQuery, row: FakeRow): boolean {
    const ownerParameter = /"owner_id" = \$(\d+)/.exec(query.text)?.[1];
    const isAllowsShared = /"owner_id" is null/i.test(query.text);
    if (ownerParameter === undefined) {
        return !isAllowsShared || row.owner_id === null;
    }
    const owner = query.params[Number(ownerParameter) - 1];
    return row.owner_id === owner || (isAllowsShared && row.owner_id === null);
}

function routine(blocks: readonly RoutineBlock[]): FakeRow {
    return {
        blocks,
        created_at: new Date('2026-10-01T09:00:00Z'),
        id: ROUTINE_ID,
        name: 'Leg day',
        sort_order: 0,
        updated_at: new Date('2026-10-01T09:00:00Z'),
        user_id: USER_ID,
    };
}

function startFrom(
    blocks: readonly RoutineBlock[],
    exercises: readonly FakeRow[],
) {
    const { database, queries } = createFakeDatabase((query) => {
        const table = readTable(query);
        if (table === ROUTINE_TABLE) return [routine(blocks)];
        if (table === EXERCISE_TABLE) {
            return exercises.filter((row) => isVisibleTo(query, row));
        }
        if (table === WORKOUT_TABLE) return [];
        return writeTable(query) === WORKOUT_TABLE ? [{ id: WORKOUT_ID }] : [];
    });
    const caller = createCallerFactory(
        createTRPCRouter({ workout: liftingWorkoutRouter }),
    )({
        db: database,
        headers: new Headers(),
        session: {
            user: { email: 'lifter@example.com', id: USER_ID, role: 'user' },
        } as never,
    });
    return {
        queries,
        start: () => caller.workout.start({ routineId: ROUTINE_ID }),
    };
}

describe('starting a workout from a routine', () => {
    it('adds the custom exercises the user owns alongside the built-in ones', async () => {
        const { queries, start } = startFrom(
            [builtIn('barbell-squat'), custom('my-sled-push')],
            [
                exercise(SQUAT_ID, 'barbell-squat', null),
                exercise(OWN_SLED_ID, 'my-sled-push', USER_ID),
            ],
        );
        await expect(start()).resolves.toEqual({
            id: WORKOUT_ID,
            resumed: false,
        });
        expect(addedExercises(queries)).toEqual([SQUAT_ID, OWN_SLED_ID]);
    });

    it('never adds another user custom exercise, even with the same slug', async () => {
        const { queries, start } = startFrom(
            [
                builtIn('barbell-squat'),
                custom('my-sled-push'),
                custom('rope-pull'),
            ],
            [
                exercise(SQUAT_ID, 'barbell-squat', null),
                exercise(FOREIGN_SLED_ID, 'my-sled-push', OTHER_USER_ID),
                exercise(OWN_SLED_ID, 'my-sled-push', USER_ID),
                exercise(FOREIGN_ROPE_ID, 'rope-pull', OTHER_USER_ID),
            ],
        );
        await start();
        expect(addedExercises(queries)).toEqual([SQUAT_ID, OWN_SLED_ID]);
    });

    it('keeps a block saved for the built-in exercise on it when the user has a custom one with the same slug', async () => {
        const { queries, start } = startFrom(
            [builtIn('barbell-squat')],
            [
                exercise(SQUAT_ID, 'barbell-squat', null),
                exercise(OWN_SQUAT_TWIN_ID, 'barbell-squat', USER_ID),
            ],
        );
        await start();
        expect(addedExercises(queries)).toEqual([SQUAT_ID]);
    });

    it('starts the custom exercise a block was saved for, not the built-in one with the same slug', async () => {
        const { queries, start } = startFrom(
            [custom('barbell-squat')],
            [
                exercise(OWN_SQUAT_TWIN_ID, 'barbell-squat', USER_ID),
                exercise(SQUAT_ID, 'barbell-squat', null),
            ],
        );
        await start();
        expect(addedExercises(queries)).toEqual([OWN_SQUAT_TWIN_ID]);
    });

    it('leaves out a custom block whose exercise is gone instead of starting the built-in one', async () => {
        const { queries, start } = startFrom(
            [builtIn('plank'), custom('barbell-squat')],
            [
                exercise(PLANK_ID, 'plank', null),
                exercise(SQUAT_ID, 'barbell-squat', null),
            ],
        );
        await start();
        expect(addedExercises(queries)).toEqual([PLANK_ID]);
    });
});
