import { describe, expect, it } from 'vitest';

import {
    WORKOUT_DURATION_BUCKETS,
    WorkoutDuration,
    WorkoutDurationBucket,
} from '~/lib/lifting/workout-duration';

function bucketsContaining(seconds: number): WorkoutDurationBucket[] {
    return WORKOUT_DURATION_BUCKETS.filter(
        (bucket) => seconds >= bucket.range[0] && seconds <= bucket.range[1],
    ).map((bucket) => bucket.value);
}

describe('WORKOUT_DURATION_BUCKETS', () => {
    it.each([
        [0, WorkoutDurationBucket.Under15],
        [899, WorkoutDurationBucket.Under15],
        [900, WorkoutDurationBucket.From15To60],
        [3599, WorkoutDurationBucket.From15To60],
        [3600, WorkoutDurationBucket.From60To120],
        [7199, WorkoutDurationBucket.From60To120],
        [7200, WorkoutDurationBucket.Over120],
        [86_400, WorkoutDurationBucket.Over120],
    ])('puts %i seconds in exactly the %s bucket', (seconds, expected) => {
        expect(bucketsContaining(seconds)).toEqual([expected]);
    });

    it('defines every bucket once', () => {
        expect(
            WORKOUT_DURATION_BUCKETS.map((bucket) => bucket.value).toSorted(
                (left, right) => left.localeCompare(right),
            ),
        ).toEqual(
            Object.values(WorkoutDurationBucket).toSorted((left, right) =>
                left.localeCompare(right),
            ),
        );
    });
});

describe('WorkoutDuration', () => {
    it('finds a bucket by its value', () => {
        expect(
            WorkoutDuration.bucketForValue(WorkoutDurationBucket.From15To60)
                ?.range,
        ).toEqual([900, 3599]);
        expect(WorkoutDuration.bucketForValue(undefined)).toBeUndefined();
        expect(WorkoutDuration.bucketForValue('nope')).toBeUndefined();
    });

    it('finds the bucket a table filter value came from', () => {
        for (const bucket of WORKOUT_DURATION_BUCKETS) {
            expect(
                WorkoutDuration.bucketForFilterValue([...bucket.range])?.value,
            ).toBe(bucket.value);
        }
        expect(WorkoutDuration.bucketForFilterValue([1, 2])).toBeUndefined();
        expect(WorkoutDuration.bucketForFilterValue(undefined)).toBeUndefined();
        expect(WorkoutDuration.bucketForFilterValue('15-60')).toBeUndefined();
    });

    it('measures a finished workout in whole seconds', () => {
        expect(
            WorkoutDuration.seconds({
                endedAt: new Date('2026-01-01T10:45:30.600Z'),
                startedAt: '2026-01-01T10:00:00.000Z',
            }),
        ).toBe(2731);
    });

    it('has no duration while the workout is still running', () => {
        expect(
            WorkoutDuration.seconds({
                endedAt: null,
                startedAt: new Date('2026-01-01T10:00:00.000Z'),
            }),
        ).toBeNull();
    });
});
