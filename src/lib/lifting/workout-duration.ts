const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;

export const WorkoutDurationBucket = {
    From15To60: '15-60',
    From60To120: '60-120',
    Over120: 'over-120',
    Under15: 'under-15',
} as const;

export type WorkoutDurationBucket =
    (typeof WorkoutDurationBucket)[keyof typeof WorkoutDurationBucket];

export interface WorkoutDurationBucketDefinition {
    label: string;
    range: WorkoutDurationRange;
    value: WorkoutDurationBucket;
}

export type WorkoutDurationRange = readonly [number, number];

export interface WorkoutTiming {
    endedAt: Date | null | string;
    startedAt: Date | string;
}

export const WORKOUT_DURATION_BUCKETS: readonly WorkoutDurationBucketDefinition[] =
    [
        {
            label: 'Under 15 min',
            range: [0, 15 * SECONDS_PER_MINUTE - 1],
            value: WorkoutDurationBucket.Under15,
        },
        {
            label: '15 to 60 min',
            range: [15 * SECONDS_PER_MINUTE, 60 * SECONDS_PER_MINUTE - 1],
            value: WorkoutDurationBucket.From15To60,
        },
        {
            label: '1 to 2 h',
            range: [60 * SECONDS_PER_MINUTE, 120 * SECONDS_PER_MINUTE - 1],
            value: WorkoutDurationBucket.From60To120,
        },
        {
            label: 'Over 2 h',
            range: [120 * SECONDS_PER_MINUTE, Infinity],
            value: WorkoutDurationBucket.Over120,
        },
    ];

export const WorkoutDuration = {
    bucketForFilterValue(
        filterValue: unknown,
    ): undefined | WorkoutDurationBucketDefinition {
        if (!Array.isArray(filterValue)) return undefined;
        const bounds: readonly unknown[] = filterValue;
        const [min, max] = bounds;
        return WORKOUT_DURATION_BUCKETS.find(
            (bucket) => bucket.range[0] === min && bucket.range[1] === max,
        );
    },

    bucketForValue(
        value: string | undefined,
    ): undefined | WorkoutDurationBucketDefinition {
        return WORKOUT_DURATION_BUCKETS.find(
            (bucket) => bucket.value === value,
        );
    },

    seconds(workout: WorkoutTiming): null | number {
        return workout.endedAt
            ? Math.round(
                  (new Date(workout.endedAt).getTime() -
                      new Date(workout.startedAt).getTime()) /
                      MS_PER_SECOND,
              )
            : null;
    },
};
