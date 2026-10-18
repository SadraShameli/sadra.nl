import { describe, expect, it } from 'vitest';

import {
    RoutineDraft,
    type RoutineSourceExercise,
} from '~/app/(app)/lifting/_components/RoutineDraft';
import { routineInputSchema } from '~/lib/lifting/schemas';

function exercise(
    slug: string,
    reps: readonly (null | number)[],
    isCustom = false,
): RoutineSourceExercise {
    return {
        exercise: { isCustom, slug },
        sets: reps.map((count) => ({ reps: count, type: 'working' })),
    };
}

describe('RoutineDraft', () => {
    it('turns each built-in exercise into a block with its set count and first logged reps', () => {
        expect(
            RoutineDraft.blocksOf([
                exercise('barbell-bench-press', [null, 8, 6]),
                exercise('plank', [null]),
            ]),
        ).toEqual([
            {
                exerciseSlug: 'barbell-bench-press',
                isCustom: false,
                sets: 3,
                targetReps: 8,
            },
            {
                exerciseSlug: 'plank',
                isCustom: false,
                sets: 1,
                targetReps: undefined,
            },
        ]);
    });

    it('builds the block from the working sets, leaving warm-ups out of the count and the reps', () => {
        expect(
            RoutineDraft.blocksOf([
                {
                    exercise: { isCustom: false, slug: 'barbell-squat' },
                    sets: [
                        { reps: 10, type: 'warmup' },
                        { reps: 5, type: 'warmup' },
                        { reps: 5, type: 'working' },
                        { reps: 5, type: 'working' },
                        { reps: 5, type: 'working' },
                    ],
                },
            ]),
        ).toEqual([
            {
                exerciseSlug: 'barbell-squat',
                isCustom: false,
                sets: 3,
                targetReps: 5,
            },
        ]);
    });

    it('keeps an exercise logged only as warm-ups, counting those sets', () => {
        expect(
            RoutineDraft.blocksOf([
                {
                    exercise: { isCustom: false, slug: 'face-pull' },
                    sets: [
                        { reps: 15, type: 'warmup' },
                        { reps: 12, type: 'warmup' },
                    ],
                },
            ]),
        ).toEqual([
            {
                exerciseSlug: 'face-pull',
                isCustom: false,
                sets: 2,
                targetReps: 15,
            },
        ]);
    });

    it('keeps custom exercises, which a routine now starts', () => {
        expect(
            RoutineDraft.blocksOf([
                exercise('barbell-squat', [5]),
                exercise('my-sled-push', [10]),
            ]).map((block) => block.exerciseSlug),
        ).toEqual(['barbell-squat', 'my-sled-push']);
    });

    it('marks each block built-in or custom, so the routine starts the same exercise when slugs match', () => {
        expect(
            RoutineDraft.blocksOf([
                exercise('barbell-squat', [5]),
                exercise('barbell-squat', [8], true),
            ]).map(({ exerciseSlug, isCustom }) => ({
                exerciseSlug,
                isCustom,
            })),
        ).toEqual([
            { exerciseSlug: 'barbell-squat', isCustom: false },
            { exerciseSlug: 'barbell-squat', isCustom: true },
        ]);
    });

    it('keeps every block inside the limits the routine API accepts', () => {
        const blocks = RoutineDraft.blocksOf([
            exercise(
                'deadlift',
                Array.from({ length: 25 }, () => 150),
            ),
            exercise('face-pull', []),
        ]);
        expect(
            routineInputSchema.safeParse({ blocks, name: 'Pull day' }).success,
        ).toBe(true);
        expect(blocks.map((block) => block.sets)).toEqual([20, 1]);
    });
});
