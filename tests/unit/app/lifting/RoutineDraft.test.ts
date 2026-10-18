import { describe, expect, it } from 'vitest';

import {
    RoutineDraft,
    type RoutineSourceExercise,
} from '~/app/(app)/lifting/_components/RoutineDraft';
import { routineInputSchema } from '~/lib/lifting/schemas';

function exercise(
    slug: string,
    reps: readonly (null | number)[],
    ownerId: null | string = null,
): RoutineSourceExercise {
    return {
        exercise: { ownerId, slug },
        sets: reps.map((count) => ({ reps: count })),
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
            { exerciseSlug: 'barbell-bench-press', sets: 3, targetReps: 8 },
            { exerciseSlug: 'plank', sets: 1, targetReps: undefined },
        ]);
    });

    it('leaves out custom exercises, which a routine cannot start', () => {
        const exercises = [
            exercise('barbell-squat', [5]),
            exercise('my-sled-push', [10], 'lifter'),
        ];
        expect(
            RoutineDraft.blocksOf(exercises).map((block) => block.exerciseSlug),
        ).toEqual(['barbell-squat']);
        expect(RoutineDraft.leftOutCount(exercises)).toBe(1);
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
