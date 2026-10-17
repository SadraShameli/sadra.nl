import { describe, expect, it, vi } from 'vitest';

import { PrSyncService } from '~/server/api/routers/lifting/pr-sync';
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
const EXERCISE_ID = '00000000-0000-4000-8000-000000000030';
const FORMER_PR_SET_ID = '00000000-0000-4000-8000-000000000031';
const WORKOUT_ID = '00000000-0000-4000-8000-000000000032';
const WORKOUT_EXERCISE_ID = '00000000-0000-4000-8000-000000000033';

function recordResyncsOf(
    queries: readonly IssuedQuery[],
): readonly IssuedQuery[] {
    return queries.filter(
        (query) =>
            writeTable(query) === 'sadranl_lifting_personal_record' &&
            query.params.includes(EXERCISE_ID),
    );
}

function workoutCaller(rowsFor: (query: IssuedQuery) => FakeRow[]) {
    const { database, queries } = createFakeDatabase(rowsFor);
    const caller = createCallerFactory(
        createTRPCRouter({ workout: liftingWorkoutRouter }),
    )({
        db: database,
        headers: new Headers(),
        session: {
            user: { email: 'lifter@example.com', id: USER_ID, role: 'user' },
        } as never,
    });
    return { caller, queries };
}

describe('PrSyncService.syncExercise', () => {
    it('clears the PR flag of a former record set that is now a warmup', async () => {
        const { database, queries } = createFakeDatabase((query) =>
            readTable(query) === 'sadranl_lifting_set'
                ? [
                      {
                          completed_at: new Date('2026-10-01T10:05:00Z'),
                          id: FORMER_PR_SET_ID,
                          reps: 5,
                          started_at: new Date('2026-10-01T10:00:00Z'),
                          type: 'warmup',
                          weight_kg: 100,
                      },
                  ]
                : [],
        );
        await new PrSyncService(database).syncExercise(USER_ID, EXERCISE_ID);
        const clearing = queries.filter(
            (query) =>
                writeTable(query) === 'sadranl_lifting_set' &&
                query.text.includes('"is_pr" = $1') &&
                query.params[0] === false,
        );
        expect(clearing).toHaveLength(1);
        expect(clearing[0]?.params).toContain(FORMER_PR_SET_ID);
    });
});

describe('workout deletions resynchronize personal records', () => {
    it('resyncs the records of every exercise in a deleted workout', async () => {
        const { caller, queries } = workoutCaller((query) =>
            readTable(query) === 'sadranl_lifting_workout_exercise'
                ? [{ exercise_id: EXERCISE_ID }]
                : [],
        );
        await caller.workout.delete({ id: WORKOUT_ID });
        expect(recordResyncsOf(queries)).toHaveLength(1);
    });

    it('resyncs the records of an exercise removed from a workout', async () => {
        const { caller, queries } = workoutCaller((query) =>
            readTable(query) === 'sadranl_lifting_workout_exercise'
                ? [
                      {
                          exercise_id: EXERCISE_ID,
                          id: WORKOUT_EXERCISE_ID,
                          workout: [
                              null,
                              '2026-10-01T10:00:00Z',
                              null,
                              WORKOUT_ID,
                              null,
                              'Leg day',
                              null,
                              null,
                              null,
                              null,
                              '2026-10-01T10:00:00Z',
                              '2026-10-01T10:00:00Z',
                              USER_ID,
                          ],
                          workout_id: WORKOUT_ID,
                      },
                  ]
                : [],
        );
        await caller.workout.removeExercise({ id: WORKOUT_EXERCISE_ID });
        expect(recordResyncsOf(queries)).toHaveLength(1);
    });
});
